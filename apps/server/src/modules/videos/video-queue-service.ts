import { randomUUID } from "node:crypto";
import type { OverlayPurpose, VideoHoldReason, VideoMetadata, VideoRecentItem, VideoRequestItem, VideoSource, VideoSubmissionChannel, VideosModuleConfig } from "@stream-jams/core";
import { videoClockPositionMs } from "@stream-jams/core/videos";
import { VideoQueueConflictError, type VideoQueueChange, type VideoQueueRepository, type VideoQueueRun, type VideoQueueSnapshot } from "./video-queue-repository.js";

export const videoQueueMaximumItems = 500;
/** A player that has not reported started by then is marked failed. */
export const videoLoadTimeoutMs = 15_000;
/** Grace after the known duration before an item without an end report is finished. */
export const videoEndGraceMs = 3_000;
export const videoNoticeDurationMs = 5_000;

export type VideoPlaybackPhase = "loading" | "playing" | "paused";

export interface VideoCurrentPlayback {
  readonly item: VideoRequestItem;
  readonly phase: VideoPlaybackPhase;
  readonly clock: { readonly state: "playing" | "paused"; readonly positionMs: number; readonly atEpochMs: number };
  /** Increments on every operator seek so players know to jump rather than drift-correct. */
  readonly seekGeneration: number;
}

/** Finished requests kept per purpose across restarts. */
export const videoFinishedHistoryLimit = 100;

export interface VideoQueueView extends VideoQueueSnapshot {
  readonly current: VideoCurrentPlayback | null;
  /** Epoch ms when the gap before the next run item ends, or null. */
  readonly gapEndsAtEpochMs: number | null;
  readonly notice: { readonly id: string; readonly displayName: string | null } | null;
}

export interface VideoSubmission {
  readonly source: VideoSource;
  readonly title: string | null;
  readonly requester: string | null;
  readonly durationMs: number | null;
  readonly autoplay: boolean;
  readonly via: VideoSubmissionChannel;
}

export type VideoQueueCommand =
  | { readonly kind: "play-next" }
  | { readonly kind: "play-all" }
  | { readonly kind: "pause-queue" }
  | { readonly kind: "resume-queue" }
  | { readonly kind: "skip" }
  | { readonly kind: "stop" }
  | { readonly kind: "clear" }
  | { readonly kind: "remove"; readonly itemId: string }
  | { readonly kind: "play-anyway"; readonly itemId: string }
  | { readonly kind: "reorder"; readonly itemIds: readonly string[] };

export type VideoItemCommand =
  | { readonly kind: "pause" }
  | { readonly kind: "resume" }
  | { readonly kind: "seek"; readonly positionMs: number };

export class VideoQueueCommandError extends Error {
  constructor(readonly code: "queue-full" | "not-found" | "not-playing" | "invalid-order" | "item-mismatch", message: string) {
    super(message);
    this.name = "VideoQueueCommandError";
  }
}

export interface VideoQueueScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface VideoQueueServiceOptions {
  readonly repository: VideoQueueRepository;
  readonly getConfig: () => VideosModuleConfig;
  readonly now?: () => number;
  readonly scheduler?: VideoQueueScheduler;
  readonly createId?: () => string;
}

interface PurposeState {
  snapshot: VideoQueueSnapshot;
  current: VideoCurrentPlayback | null;
  gapEndsAtEpochMs: number | null;
  notice: { readonly id: string; readonly displayName: string | null } | null;
  playbackTimer: unknown;
  gapTimer: unknown;
  noticeTimer: unknown;
}

type Listener = (purpose: OverlayPurpose, view: VideoQueueView) => void;

/**
 * Authoritative Videos queue per purpose. Queue membership, order and status are
 * persisted; the current item's clock lives in memory and is rebuilt as idle on
 * restart, when interrupted items return to the queue head.
 */
export class VideoQueueService {
  private readonly repository: VideoQueueRepository;
  private readonly getConfig: () => VideosModuleConfig;
  private readonly now: () => number;
  private readonly scheduler: VideoQueueScheduler;
  private readonly createId: () => string;
  private readonly states = new Map<OverlayPurpose, PurposeState>();
  private readonly listeners = new Set<Listener>();
  private disposed = false;

  constructor(options: VideoQueueServiceOptions) {
    this.repository = options.repository;
    this.getConfig = options.getConfig;
    this.now = options.now ?? Date.now;
    this.scheduler = options.scheduler ?? { setTimeout: (callback, delayMs) => setTimeout(callback, delayMs), clearTimeout: handle => clearTimeout(handle as NodeJS.Timeout) };
    this.createId = options.createId ?? randomUUID;
    this.repository.recoverInterruptedPlayback(new Date(this.now()).toISOString());
    // Finished rows only feed Recent and Failed recently; keep a bounded history per purpose.
    this.repository.pruneFinished(videoFinishedHistoryLimit);
    for (const purpose of ["live", "test"] as const) {
      this.states.set(purpose, { snapshot: this.repository.load(purpose), current: null, gapEndsAtEpochMs: null, notice: null, playbackTimer: null, gapTimer: null, noticeTimer: null });
    }
    // Older builds held unknown-length items; re-applying the limit queues them again.
    this.reevaluateLimits();
  }

  view(purpose: OverlayPurpose): VideoQueueView {
    const state = this.state(purpose);
    return { ...state.snapshot, current: state.current, gapEndsAtEpochMs: state.gapEndsAtEpochMs, notice: state.notice };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  submit(purpose: OverlayPurpose, submission: VideoSubmission): VideoRequestItem {
    const state = this.state(purpose);
    const item = this.newItem(purpose, submission);
    this.commit(purpose, state.snapshot.revision, { upsert: [item] });
    if (item.autoplay && item.status === "queued" && this.isIdle(state) && !state.snapshot.queuePaused) {
      this.startRun(purpose, { mode: "next", remainingIds: [item.id] });
    } else {
      this.emit(purpose);
    }
    return item;
  }

  command(purpose: OverlayPurpose, expectedRevision: number, command: VideoQueueCommand): VideoQueueView {
    const state = this.state(purpose);
    const { snapshot } = state;
    switch (command.kind) {
      case "play-next": {
        const next = playable(snapshot.items)[0];
        if (next === undefined) throw new VideoQueueCommandError("not-found", "No queued video is ready to play.");
        this.requireRevision(snapshot, expectedRevision);
        if (this.isIdle(state)) this.startRun(purpose, { mode: "next", remainingIds: [next.id] });
        else this.commit(purpose, expectedRevision, { run: appendRun(snapshot.run, [next.id]) }, true);
        break;
      }
      case "play-all": {
        const ids = playable(snapshot.items).map(item => item.id);
        if (ids.length === 0) throw new VideoQueueCommandError("not-found", "No queued video is ready to play.");
        this.requireRevision(snapshot, expectedRevision);
        if (this.isIdle(state)) this.startRun(purpose, { mode: "all", remainingIds: ids });
        else this.commit(purpose, expectedRevision, { run: appendRun(snapshot.run, ids) }, true);
        break;
      }
      case "pause-queue":
        this.commit(purpose, expectedRevision, { queuePaused: true }, true);
        break;
      case "resume-queue":
        this.commit(purpose, expectedRevision, { queuePaused: false });
        if (this.isIdle(state)) this.advance(purpose); else this.emit(purpose);
        break;
      case "skip":
      case "stop": {
        const current = state.current;
        if (current === null && state.gapEndsAtEpochMs === null) throw new VideoQueueCommandError("not-playing", "No video is playing.");
        this.requireRevision(snapshot, expectedRevision);
        if (command.kind === "stop") {
          this.clearGap(state);
          this.commit(purpose, expectedRevision, { run: null }, current !== null);
        }
        if (current !== null) this.finish(purpose, current.item.id, "played");
        else if (command.kind === "skip") { this.clearGap(state); this.advance(purpose); }
        else this.emit(purpose);
        break;
      }
      case "clear": {
        const waiting = snapshot.items.filter(item => item.status === "queued" || item.status === "held");
        this.commit(purpose, expectedRevision, { upsert: waiting.map(item => ({ ...item, status: "removed", holdReason: null })), run: snapshot.run === null ? null : { ...snapshot.run, remainingIds: [] } });
        break;
      }
      case "remove": {
        const item = this.waitingItem(snapshot, command.itemId);
        this.commit(purpose, expectedRevision, { upsert: [{ ...item, status: "removed", holdReason: null }], run: withoutRunItem(snapshot.run, item.id) });
        break;
      }
      case "play-anyway": {
        const item = this.waitingItem(snapshot, command.itemId);
        const released = { ...item, status: "queued" as const, holdReason: null, limitOverridden: true };
        if (this.isIdle(state)) {
          this.commit(purpose, expectedRevision, { upsert: [released] }, true);
          this.startRun(purpose, { mode: "next", remainingIds: [item.id] });
        } else {
          this.commit(purpose, expectedRevision, { upsert: [released] });
        }
        break;
      }
      case "reorder": {
        const waiting = snapshot.items.filter(item => item.status === "queued" || item.status === "held");
        const byId = new Map(waiting.map(item => [item.id, item]));
        if (command.itemIds.length !== waiting.length || new Set(command.itemIds).size !== waiting.length || command.itemIds.some(id => !byId.has(id))) {
          throw new VideoQueueCommandError("invalid-order", "The new order must list every waiting video exactly once.");
        }
        const base = Math.min(...waiting.map(item => item.position));
        const reordered = command.itemIds.map((id, index) => ({ ...byId.get(id)!, position: base + index }));
        const order = new Map(command.itemIds.map((id, index) => [id, index]));
        const run = snapshot.run === null ? null : { ...snapshot.run, remainingIds: [...snapshot.run.remainingIds].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)) };
        this.commit(purpose, expectedRevision, { upsert: reordered, run });
        break;
      }
    }
    return this.view(purpose);
  }

  /**
   * Adds a Recent (played or failed) item back to the end of the queue as a new request,
   * attributed to `via` and never autoplayed. The length limit applies again, so an
   * over-limit video waits held. Guarded by the queue revision like other commands.
   */
  requeue(purpose: OverlayPurpose, expectedRevision: number, itemId: string, via: VideoSubmissionChannel): VideoRequestItem {
    const state = this.state(purpose);
    this.requireRevision(state.snapshot, expectedRevision);
    const recent = this.recentItem(purpose, itemId);
    // The provider details travel with the replay, so it needs no new lookup.
    const item = { ...this.newItem(purpose, { source: recent.source, title: recent.title, requester: recent.requester, durationMs: recent.durationMs, autoplay: false, via }),
      providerTitle: recent.providerTitle, channelName: recent.channelName };
    this.commit(purpose, expectedRevision, { upsert: [item] });
    return item;
  }

  /** A played or failed item still listed in Recent for this purpose. */
  recentItem(purpose: OverlayPurpose, itemId: string): VideoRecentItem {
    const item = this.state(purpose).snapshot.recent.find(candidate => candidate.id === itemId);
    if (item === undefined) throw new VideoQueueCommandError("not-found", "That video is no longer in Recent.");
    return item;
  }

  /** Pause, resume or seek the current item. Guarded by item id, not queue revision. */
  control(purpose: OverlayPurpose, expectedItemId: string, command: VideoItemCommand): VideoQueueView {
    const state = this.state(purpose);
    const current = state.current;
    if (current === null || current.item.id !== expectedItemId) throw new VideoQueueCommandError("item-mismatch", "That video is no longer playing.");
    const now = this.now();
    const positionMs = videoClockPositionMs(current.clock, now);
    if (command.kind === "pause") {
      if (current.phase === "paused") return this.view(purpose);
      this.clearPlaybackTimer(state);
      state.current = { ...current, phase: "paused", clock: { state: "paused", positionMs, atEpochMs: now } };
      this.persistItem(purpose, { ...current.item, status: "paused" });
    } else if (command.kind === "resume") {
      if (current.phase !== "paused") return this.view(purpose);
      state.current = { ...current, phase: "playing", clock: { state: "playing", positionMs, atEpochMs: now } };
      this.persistItem(purpose, { ...current.item, status: "playing" });
      this.scheduleEnd(purpose);
    } else {
      const target = clampSeek(command.positionMs, current.item.durationMs);
      state.current = { ...current, clock: { ...current.clock, positionMs: target, atEpochMs: now }, seekGeneration: current.seekGeneration + 1 };
      if (current.phase === "playing") this.scheduleEnd(purpose);
      this.emit(purpose);
    }
    return this.view(purpose);
  }

  /** The primary (or fallback) player started rendering the item. */
  reportStarted(itemId: string, report: { readonly positionMs?: number; readonly durationMs?: number | null } = {}): boolean {
    const found = this.findCurrent(itemId);
    if (found === null) return false;
    const [purpose, state, current] = found;
    if (current.phase !== "loading") return true;
    const now = this.now();
    state.current = { ...current, phase: "playing", clock: { state: "playing", positionMs: report.positionMs ?? current.clock.positionMs, atEpochMs: now } };
    if (this.learnDuration(purpose, report.durationMs ?? null) === "cut") return true;
    this.scheduleEnd(purpose);
    this.emit(purpose);
    return true;
  }

  /** Position and duration reports from the player keep the clock honest. */
  reportProgress(itemId: string, report: { readonly positionMs: number; readonly durationMs?: number | null }): boolean {
    const found = this.findCurrent(itemId);
    if (found === null) return false;
    const [purpose, state, current] = found;
    if (current.phase === "playing") {
      state.current = { ...current, clock: { state: "playing", positionMs: Math.max(0, Math.round(report.positionMs)), atEpochMs: this.now() } };
    }
    if (this.learnDuration(purpose, report.durationMs ?? null) === "learned" && current.phase === "playing") this.scheduleEnd(purpose);
    return true;
  }

  /**
   * A media length from a fallback browser player, which never steers the shared clock.
   * Learned while loading or playing, so an unknown-length item over the limit is cut and held.
   */
  reportDuration(itemId: string, durationMs: number): boolean {
    const found = this.findCurrent(itemId);
    if (found === null) return false;
    const [purpose, , current] = found;
    if (this.learnDuration(purpose, durationMs) === "learned" && current.phase === "playing") this.scheduleEnd(purpose);
    return true;
  }

  reportEnded(itemId: string): boolean {
    const found = this.findCurrent(itemId);
    if (found === null) return false;
    this.finish(found[0], itemId, "played");
    return true;
  }

  reportFailed(itemId: string): boolean {
    const found = this.findCurrent(itemId);
    if (found === null) return false;
    this.finish(found[0], itemId, "failed");
    return true;
  }

  /**
   * Records what the provider reported for a request still in the queue. The submitted title is
   * kept; the provider title and channel are stored beside it. A provider length counts as a
   * known length: it fills an unknown length only, and the length limit then applies exactly as
   * when a player reports it, holding a waiting item as over the limit or cutting the current one.
   * Returns false when the item is no longer in the queue, so nothing changes.
   */
  applyMetadata(purpose: OverlayPurpose, itemId: string, metadata: VideoMetadata): boolean {
    if (this.disposed) return false;
    const state = this.state(purpose);
    const item = state.snapshot.items.find(candidate => candidate.id === itemId);
    if (item === undefined) return false;
    const described = {
      ...item,
      providerTitle: metadata.title ?? item.providerTitle,
      channelName: metadata.channelName ?? item.channelName
    };
    const durationMs = validDurationMs(metadata.durationMs);
    const current = state.current;
    if (current?.item.id === itemId) {
      // Learned only while the length is unknown, as the queue would when the player reports it.
      this.persistItem(purpose, { ...current.item, providerTitle: described.providerTitle, channelName: described.channelName }, true);
      const learned = current.item.durationMs === null ? this.learnDuration(purpose, durationMs) : "unchanged";
      if (learned === "cut") return true;
      if (learned === "learned" && state.current?.phase === "playing") this.scheduleEnd(purpose);
      this.emit(purpose);
      return true;
    }
    const waiting = item.status === "queued" || item.status === "held";
    const known = item.durationMs ?? (waiting ? durationMs : null);
    let next: VideoRequestItem = { ...described, durationMs: known };
    if (waiting && !item.limitOverridden) {
      const hold = this.holdReason(known, false);
      next = { ...next, status: hold === null ? "queued" : "held", holdReason: hold };
    }
    // A held item drops out of the run; the run skips anything not queued when it gets there.
    this.commit(purpose, state.snapshot.revision, { upsert: [next] });
    return true;
  }

  /** Shows the bounded "no clip" notice for legacy Streamer.bot shoutouts. */
  showNotice(purpose: OverlayPurpose, displayName: string | null): void {
    const state = this.state(purpose);
    if (state.noticeTimer !== null) this.scheduler.clearTimeout(state.noticeTimer);
    const id = `video-notice:${this.createId()}`;
    state.notice = { id, displayName };
    state.noticeTimer = this.scheduler.setTimeout(() => {
      state.noticeTimer = null;
      if (state.notice?.id === id) { state.notice = null; this.emit(purpose); }
    }, videoNoticeDurationMs);
    this.emit(purpose);
  }

  /** Re-applies the length limit to waiting items after the configuration changes. */
  reevaluateLimits(): void {
    for (const purpose of ["live", "test"] as const) {
      const { snapshot } = this.state(purpose);
      const changed = snapshot.items.flatMap(item => {
        if (item.limitOverridden || (item.status !== "queued" && item.status !== "held")) return [];
        const hold = this.holdReason(item.durationMs, false);
        if (hold === item.holdReason) return [];
        return [{ ...item, status: hold === null ? "queued" as const : "held" as const, holdReason: hold }];
      });
      if (changed.length > 0) this.commit(purpose, snapshot.revision, { upsert: changed });
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const state of this.states.values()) {
      this.clearPlaybackTimer(state);
      this.clearGap(state);
      if (state.noticeTimer !== null) this.scheduler.clearTimeout(state.noticeTimer);
    }
    this.listeners.clear();
  }

  private startRun(purpose: OverlayPurpose, run: VideoQueueRun): void {
    const state = this.state(purpose);
    this.commit(purpose, state.snapshot.revision, { run }, true);
    this.advance(purpose);
  }

  /** Starts the next run item if nothing plays, no gap is pending and the queue is not paused. */
  private advance(purpose: OverlayPurpose): void {
    const state = this.state(purpose);
    if (this.disposed || !this.isIdle(state)) return;
    const run = state.snapshot.run;
    if (run === null || state.snapshot.queuePaused) { this.emit(purpose); return; }
    const waiting = new Map(state.snapshot.items.filter(item => item.status === "queued").map(item => [item.id, item]));
    const remaining = run.remainingIds.filter(id => waiting.has(id));
    const nextId = remaining[0];
    if (nextId === undefined) {
      this.commit(purpose, state.snapshot.revision, { run: null });
      return;
    }
    const item = waiting.get(nextId)!;
    const playing = { ...item, status: "playing" as const, autoplay: false };
    this.commit(purpose, state.snapshot.revision, { upsert: [playing], run: { ...run, remainingIds: remaining.slice(1) } }, true);
    const startAtMs = "startAtMs" in item.source ? item.source.startAtMs : 0;
    state.current = { item: playing, phase: "loading", clock: { state: "paused", positionMs: startAtMs, atEpochMs: this.now() }, seekGeneration: 0 };
    state.playbackTimer = this.scheduler.setTimeout(() => {
      state.playbackTimer = null;
      if (state.current?.item.id === playing.id && state.current.phase === "loading") this.finish(purpose, playing.id, "failed");
    }, videoLoadTimeoutMs);
    this.emit(purpose);
  }

  /**
   * Ends the current item and continues the run. `over-limit` returns the item to
   * the queue as held at its original position instead of marking it finished.
   */
  private finish(purpose: OverlayPurpose, itemId: string, outcome: "played" | "failed" | "over-limit"): void {
    const state = this.state(purpose);
    const current = state.current;
    if (current === null || current.item.id !== itemId) return;
    this.clearPlaybackTimer(state);
    state.current = null;
    const done: VideoRequestItem = outcome === "over-limit"
      ? { ...current.item, status: "held", holdReason: "over-limit" }
      : { ...current.item, status: outcome, holdReason: null };
    const run = state.snapshot.run;
    const continues = run !== null && run.remainingIds.length > 0 && !state.snapshot.queuePaused;
    this.commit(purpose, state.snapshot.revision, { upsert: [done], ...(continues ? {} : { run: run !== null && run.remainingIds.length > 0 ? run : null }) }, true);
    if (!continues) { this.emit(purpose); return; }
    const gapMs = this.getConfig().gapSeconds * 1000;
    if (gapMs === 0) { this.advance(purpose); return; }
    state.gapEndsAtEpochMs = this.now() + gapMs;
    state.gapTimer = this.scheduler.setTimeout(() => {
      state.gapTimer = null;
      state.gapEndsAtEpochMs = null;
      this.advance(purpose);
    }, gapMs);
    this.emit(purpose);
  }

  private scheduleEnd(purpose: OverlayPurpose): void {
    const state = this.state(purpose);
    const current = state.current;
    this.clearPlaybackTimer(state);
    if (current === null || current.phase !== "playing" || current.item.durationMs === null) return;
    const remaining = current.item.durationMs - videoClockPositionMs(current.clock, this.now());
    const itemId = current.item.id;
    state.playbackTimer = this.scheduler.setTimeout(() => {
      state.playbackTimer = null;
      this.finish(purpose, itemId, "played");
    }, Math.max(0, remaining) + videoEndGraceMs);
  }

  /**
   * Records a duration learned from the player. An item queued with an unknown
   * length that turns out to be over the limit, and was not released with Play
   * anyway, is cut: playback ends and it returns to the queue held as over-limit.
   */
  private learnDuration(purpose: OverlayPurpose, durationMs: number | null): "unchanged" | "learned" | "cut" {
    const state = this.state(purpose);
    const current = state.current;
    if (current === null || durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) return "unchanged";
    const rounded = Math.round(durationMs);
    if (current.item.durationMs === rounded) return "unchanged";
    const wasUnknown = current.item.durationMs === null;
    const item = { ...current.item, durationMs: rounded };
    state.current = { ...current, item };
    if (wasUnknown && this.holdReason(rounded, item.limitOverridden) === "over-limit") {
      this.finish(purpose, item.id, "over-limit");
      return "cut";
    }
    this.persistItem(purpose, item, true);
    return "learned";
  }

  private persistItem(purpose: OverlayPurpose, item: VideoRequestItem, silent = false): void {
    const state = this.state(purpose);
    if (state.current?.item.id === item.id) state.current = { ...state.current, item };
    this.commit(purpose, state.snapshot.revision, { upsert: [item] }, silent);
  }

  private commit(purpose: OverlayPurpose, expectedRevision: number, change: VideoQueueChange, silent = false): void {
    const state = this.state(purpose);
    state.snapshot = this.repository.commit(purpose, expectedRevision, change);
    if (!silent) this.emit(purpose);
  }

  /**
   * Only a known length over the limit holds an item. Unknown-length items queue
   * normally and are checked when the player reports their duration.
   */
  private holdReason(durationMs: number | null, overridden: boolean): VideoHoldReason | null {
    if (overridden || durationMs === null) return null;
    return durationMs > this.getConfig().maxLengthSeconds * 1000 ? "over-limit" : null;
  }

  private newItem(purpose: OverlayPurpose, submission: VideoSubmission): VideoRequestItem {
    const { snapshot } = this.state(purpose);
    if (snapshot.items.length >= videoQueueMaximumItems) throw new VideoQueueCommandError("queue-full", "The video queue is full.");
    const hold = this.holdReason(submission.durationMs, false);
    return {
      id: `video:${this.createId()}`,
      purpose,
      source: submission.source,
      title: submission.title,
      providerTitle: null,
      channelName: null,
      requester: submission.requester,
      submittedVia: submission.via,
      durationMs: submission.durationMs,
      status: hold === null ? "queued" : "held",
      holdReason: hold,
      limitOverridden: false,
      autoplay: submission.autoplay,
      position: nextPosition(snapshot),
      createdAt: new Date(this.now()).toISOString()
    };
  }

  private waitingItem(snapshot: VideoQueueSnapshot, itemId: string): VideoRequestItem {
    const item = snapshot.items.find(candidate => candidate.id === itemId && (candidate.status === "queued" || candidate.status === "held"));
    if (item === undefined) throw new VideoQueueCommandError("not-found", "That video is not waiting in the queue.");
    return item;
  }

  private requireRevision(snapshot: VideoQueueSnapshot, expectedRevision: number): void {
    // The repository also enforces the guard; checking first keeps rejected commands side-effect free.
    if (snapshot.revision !== expectedRevision) throw new VideoQueueConflictError();
  }

  private findCurrent(itemId: string): [OverlayPurpose, PurposeState, VideoCurrentPlayback] | null {
    for (const [purpose, state] of this.states) {
      if (state.current?.item.id === itemId) return [purpose, state, state.current];
    }
    return null;
  }

  private isIdle(state: PurposeState): boolean {
    return state.current === null && state.gapEndsAtEpochMs === null;
  }

  private clearPlaybackTimer(state: PurposeState): void {
    if (state.playbackTimer !== null) this.scheduler.clearTimeout(state.playbackTimer);
    state.playbackTimer = null;
  }

  private clearGap(state: PurposeState): void {
    if (state.gapTimer !== null) this.scheduler.clearTimeout(state.gapTimer);
    state.gapTimer = null;
    state.gapEndsAtEpochMs = null;
  }

  private state(purpose: OverlayPurpose): PurposeState {
    const state = this.states.get(purpose);
    if (state === undefined) throw new Error(`Unknown video queue purpose ${purpose}`);
    return state;
  }

  private emit(purpose: OverlayPurpose): void {
    if (this.disposed) return;
    const view = this.view(purpose);
    for (const listener of this.listeners) listener(purpose, view);
  }
}

function validDurationMs(durationMs: number | null): number | null {
  return durationMs !== null && Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : null;
}

function playable(items: readonly VideoRequestItem[]): VideoRequestItem[] {
  return items.filter(item => item.status === "queued");
}

function nextPosition(snapshot: VideoQueueSnapshot): number {
  return snapshot.items.reduce((max, item) => Math.max(max, item.position), -1) + 1;
}

function appendRun(run: VideoQueueRun | null, ids: readonly string[]): VideoQueueRun {
  const existing = run?.remainingIds ?? [];
  return { mode: run?.mode === "all" || ids.length > 1 ? "all" : "next", remainingIds: [...existing, ...ids.filter(id => !existing.includes(id))] };
}

function withoutRunItem(run: VideoQueueRun | null, itemId: string): VideoQueueRun | null {
  return run === null ? null : { ...run, remainingIds: run.remainingIds.filter(id => id !== itemId) };
}

function clampSeek(positionMs: number, durationMs: number | null): number {
  const target = Math.max(0, Math.round(positionMs));
  return durationMs === null ? target : Math.min(target, Math.max(0, durationMs - 1000));
}
