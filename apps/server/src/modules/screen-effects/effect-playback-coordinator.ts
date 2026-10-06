import { moduleOccurrenceKey } from "../playback/occurrence-identity.js";
import {
  overlayInstructionSchema,
  type AudioPlaybackSink,
  type EffectContentSnapshot,
  type EffectOccurrence,
  type EffectQueue,
  type EffectQueueSnapshot,
  type OverlayInstruction,
  type OverlayModuleSnapshot,
  type OverlayModuleSnapshotRequest,
  type PlaybackSafetyState,
  type ResolvedAlertAudio
} from "@stream-jams/core";
import type {
  DesktopVisualPlaybackSink,
  OverlayPlaybackInstructionSink
} from "../playback/playback-ports.js";

export interface EffectPlaybackAudioOutputService {
  preparePlayback(playbackId: string, audio: readonly ResolvedAlertAudio[]): Promise<{
    readonly batches: readonly Parameters<AudioPlaybackSink["play"]>[0][];
    readonly unavailableRouteIds: readonly string[];
  }>;
}

import type { LocalMediaService } from "../assets/local-media-service.js";

export interface EffectPlaybackCoordinatorOptions {
  readonly localMediaService?: LocalMediaService;
  readonly queue: EffectQueue;
  readonly getSafety: () => PlaybackSafetyState;
  readonly overlayPlaybackSink?: OverlayPlaybackInstructionSink | undefined;
  readonly desktopVisualSink?: DesktopVisualPlaybackSink | undefined;
  readonly audioOutputService?: EffectPlaybackAudioOutputService | undefined;
  readonly audioPlaybackSink?: AudioPlaybackSink | undefined;
  readonly isModuleEnabled?: (() => boolean | Promise<boolean>) | undefined;
  readonly validateReferences?: ((content: EffectContentSnapshot, owner?: string) => boolean | Promise<boolean>) | undefined;
  readonly validateOutputAvailability?: ((content: EffectContentSnapshot) => boolean | Promise<boolean>) | undefined;
  readonly onWatchdogExpired?: ((occurrenceId: string, outstanding: { browserInstructions: number; browserClients: number; browserRecipients: string; desktopPending: boolean; audioPending: boolean }) => void | Promise<void>) | undefined;
  readonly onStopFailure?: ((error: unknown, occurrenceId: string) => void | Promise<void>) | undefined;
  readonly onPlaybackFailure?: ((error: unknown, occurrenceId: string, recipient: "browser" | "desktop" | "audio") => void | Promise<void>) | undefined;
  readonly now?: (() => number) | undefined;
}

interface BrowserObligation {
  pendingClients: Set<string>;
}

interface ActivePlayback {
  readonly occurrence: EffectOccurrence;
  readonly transportId: string;
  readonly browserInstructions: readonly OverlayInstruction[];
  readonly browser: Map<string, BrowserObligation>;
  readonly disconnectedClients: Set<string>;
  desktopPending: boolean;
  audioPending: boolean;
  hadRecipient: boolean;
  hadFailure: boolean;
  finished: boolean;
  stopping: Promise<boolean> | null;
  preparing: boolean;
  readonly preparationCancels: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
}

const COMPLETION_GRACE_MS = 5_000;
const START_DELAY_MS = 100;


export class EffectPlaybackCoordinator {
  readonly #localMediaService: LocalMediaService | undefined;
  readonly #onWatchdogExpired: EffectPlaybackCoordinatorOptions["onWatchdogExpired"];
  readonly #queue: EffectQueue;
  readonly #getSafety: () => PlaybackSafetyState;
  readonly #overlayPlaybackSink: OverlayPlaybackInstructionSink | null;
  readonly #desktopVisualSink: DesktopVisualPlaybackSink | null;
  readonly #audioOutputService: EffectPlaybackAudioOutputService | null;
  readonly #audioPlaybackSink: AudioPlaybackSink | null;
  readonly #isModuleEnabled: () => boolean | Promise<boolean>;
  readonly #validateReferences: (content: EffectContentSnapshot, owner?: string) => boolean | Promise<boolean>;
  readonly #validateOutputAvailability: (content: EffectContentSnapshot) => boolean | Promise<boolean>;
  readonly #onStopFailure: (error: unknown, occurrenceId: string) => void | Promise<void>;
  readonly #onPlaybackFailure: (error: unknown, occurrenceId: string, recipient: "browser" | "desktop" | "audio") => void | Promise<void>;
  readonly #now: () => number;
  #active: ActivePlayback | null = null;
  #closed = false;
  #starting = false;
  #closePromise: Promise<void> | null = null;

  constructor(options: EffectPlaybackCoordinatorOptions) {
    this.#localMediaService = options.localMediaService;
    this.#onWatchdogExpired = options.onWatchdogExpired;
    this.#queue = options.queue;
    this.#getSafety = options.getSafety;
    this.#overlayPlaybackSink = options.overlayPlaybackSink ?? null;
    this.#desktopVisualSink = options.desktopVisualSink ?? null;
    this.#audioOutputService = options.audioOutputService ?? null;
    this.#audioPlaybackSink = options.audioPlaybackSink ?? null;
    this.#isModuleEnabled = options.isModuleEnabled ?? (() => true);
    this.#validateReferences = options.validateReferences ?? (() => true);
    this.#validateOutputAvailability = options.validateOutputAvailability ?? (() => true);
    this.#onStopFailure = options.onStopFailure ?? (() => {});
    this.#onPlaybackFailure = options.onPlaybackFailure ?? (() => {});
    this.#now = options.now ?? Date.now;
  }

  getSnapshot(): EffectQueueSnapshot {
    return this.#queue.snapshot();
  }

  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    const enabled = await this.#isModuleEnabled();
    if (!enabled) {
      return { moduleId: "screen-effects", enabled: false, instructions: [] };
    }
    // Transient occurrences are delivered only to recipients admitted at prepare.
    // Reconnecting outputs resume with subsequent content, never a partial replay.
    void request;
    return {
      moduleId: "screen-effects",
      enabled,
      instructions: []
    };
  }

  async startNext(): Promise<void> {
    if (this.#closed || this.#starting || this.#active !== null) return;
    this.#starting = true;
    try {
      while (!this.#closed && this.#active === null && await this.#isModuleEnabled()) {
        const occurrence = this.#queue.advance(this.#getSafety());
        if (occurrence === null) return;
        const ready = await this.#validateReferences(occurrence.content, moduleOccurrenceKey("screen-effects", occurrence.id))
          && await this.#validateOutputAvailability(occurrence.content)
          && await this.#isModuleEnabled();
        if (this.#queue.snapshot().current?.id !== occurrence.id) return;
        if (!ready) {
          this.#queue.complete(occurrence.id, "failed", this.#now());
          continue;
        }
        this.#start(occurrence);
      }
    } finally {
      this.#starting = false;
    }
  }

  async disable(): Promise<void> {
    this.#queue.clearPending();
    const currentId = this.#queue.snapshot().current?.id;
    if (currentId === undefined) return;
    if (this.#active === null) {
      this.#queue.complete(currentId, "failed", this.#now());
      return;
    }
    await this.#stopAndComplete(currentId, "failed");
  }

  reportInstructionFinished(
    clientId: string,
    instructionId: string,
    failed = false
  ): EffectQueueSnapshot {
    const state = this.#active;
    const obligation = state?.browser.get(instructionId);
    if (state === null || state === undefined || obligation === undefined || state.finished) {
      return this.#queue.snapshot();
    }
    obligation.pendingClients.delete(clientId);
    if (failed) state.hadFailure = true;
    if (obligation.pendingClients.size === 0) state.browser.delete(instructionId);
    this.#maybeComplete(state);
    return this.#queue.snapshot();
  }

  reportClientDisconnected(clientId: string): EffectQueueSnapshot {
    const state = this.#active;
    if (state === null || state.finished) return this.#queue.snapshot();
    state.disconnectedClients.add(clientId);
    for (const [instructionId, obligation] of state.browser) {
      obligation.pendingClients.delete(clientId);
      if (obligation.pendingClients.size === 0) state.browser.delete(instructionId);
    }
    this.#maybeComplete(state);
    return this.#queue.snapshot();
  }

  skip(occurrenceId: string): Promise<boolean> {
    return this.#stopAndComplete(occurrenceId, "skipped");
  }

  close(): Promise<void> {
    if (this.#closePromise !== null) return this.#closePromise;
    this.#closed = true;
    this.#queue.setModulePaused(true);
    this.#queue.clearPending();
    const currentId = this.#queue.snapshot().current?.id;
    this.#closePromise = currentId === undefined
      ? Promise.resolve()
      : this.#stopAndComplete(currentId, "failed").then(() => undefined);
    return this.#closePromise;
  }

  #start(occurrence: EffectOccurrence): void {
    const transportId = moduleOccurrenceKey("screen-effects", occurrence.id);
    const startsAtEpochMs = this.#now() + START_DELAY_MS;
    const versions = this.#localMediaService?.versions(transportId);
    const bind = (instruction: OverlayInstruction): OverlayInstruction => versions === undefined ? instruction : { ...instruction, assetVersions: versions };
    const browserInstructions = createBrowserInstructions(occurrence, startsAtEpochMs).map(bind);
    const desktopInstructions = createDesktopInstructions(occurrence, startsAtEpochMs).map(bind);
    const audio = createResolvedAudio(occurrence);
    const state: ActivePlayback = {
      occurrence,
      transportId,
      browserInstructions,
      browser: new Map(),
      disconnectedClients: new Set(),
      desktopPending: desktopInstructions.length > 0 && this.#desktopVisualSink !== null,
      audioPending: audio.length > 0
        && this.#audioOutputService !== null
        && this.#audioPlaybackSink !== null,
      hadRecipient: false,
      hadFailure: false,
      finished: false,
      stopping: null,
      preparing: true,
      preparationCancels: new Set(),
      timer: null
    };
    this.#active = state;
    void this.#prepareAndStart(state, desktopInstructions, audio);
  }

  #prepareAndStart(state: ActivePlayback, desktop: readonly OverlayInstruction[], audio: readonly ResolvedAlertAudio[]): Promise<void> {
    return this.#localMediaService === undefined ? this.#prepareGroup(state, desktop, audio)
      : this.#localMediaService.runPreparation(() => this.#prepareGroup(state, desktop, audio));
  }

  async #prepareGroup(state: ActivePlayback, desktop: readonly OverlayInstruction[], audio: readonly ResolvedAlertAudio[]): Promise<void> {
    const preparations: Promise<(startsAt: number) => void>[] = [];
    if (this.#overlayPlaybackSink !== null) {
      for (const instruction of state.browserInstructions) preparations.push(this.#prepareRecipient(state, "browser", async allowed => {
        const sink = this.#overlayPlaybackSink!;
        if (sink.preparePlaybackInstruction === undefined) return (startsAt: number) => this.#dispatchBrowser(state, [
          { ...instruction, timing: { startsAtEpochMs: startsAt, endsAtEpochMs: startsAt + instruction.durationMs } }
        ]);
        try {
          const prepared = await sink.preparePlaybackInstruction(instruction);
          if (!allowed()) return () => {};
          const clients = prepared.deliveredClientIds.filter(id => !state.disconnectedClients.has(id));
          if (clients.length > 0) {
            state.hadRecipient = true;
            state.browser.set(instruction.id, { pendingClients: new Set(clients) });
          }
          return (startsAt: number) => {
            try { prepared.start(startsAt); }
            catch (error) { state.browser.delete(instruction.id); throw error; }
          };
        } catch (error) {
          state.hadFailure = true;
          this.#reportPlaybackFailure(error, state.occurrence.id, "browser");
          return () => {};
        }
      }, () => {
        state.browser.delete(instruction.id);
        this.#overlayPlaybackSink?.stopPlaybackInstructions?.([instruction.id]);
      }));
    }
    if (state.desktopPending) preparations.push(this.#prepareRecipient(state, "desktop", async allowed => {
      state.hadRecipient = true;
      try {
        const sink = this.#desktopVisualSink!;
        const prepared = sink.prepare === undefined
          ? { start: (startsAt: number) => sink.play(state.transportId, desktop, startsAt) }
          : await sink.prepare(state.transportId, desktop);
        if (!allowed()) return () => {};
        return (startsAt: number) => {
          void Promise.resolve().then(() => prepared.start(startsAt)).then(
            () => this.#settleDesktop(state, false),
            (error: unknown) => { this.#reportPlaybackFailure(error, state.occurrence.id, "desktop"); this.#settleDesktop(state, true); }
          );
        };
      } catch (error) {
        this.#reportPlaybackFailure(error, state.occurrence.id, "desktop"); this.#settleDesktop(state, true);
        return () => {};
      }
    }, async () => {
      await this.#desktopVisualSink!.stop(state.transportId);
      this.#settleDesktop(state, true);
    }));
    if (state.audioPending) preparations.push(this.#prepareRecipient(state, "audio", allowed => this.#prepareAudio(state, audio, allowed), async () => {
      await this.#audioPlaybackSink!.stop(state.transportId);
      state.audioPending = false;
    }));
    const prepared = await Promise.all(preparations);
    if (!this.#isActive(state)) return;
    const startsAt = this.#now() + START_DELAY_MS;
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = this.#scheduleTimer(() => {
      const outstanding = {
        browserInstructions: state.browser.size,
        browserClients: [...state.browser.values()].reduce((sum, value) => sum + value.pendingClients.size, 0),
        browserRecipients: JSON.stringify([...state.browser].slice(0, 16).map(([instructionId, value]) => ({ instructionId: instructionId.slice(0, 256), clientIds: [...value.pendingClients].slice(0, 16).map(id => id.slice(0, 256)) }))),
        desktopPending: state.desktopPending, audioPending: state.audioPending
      };
      void Promise.resolve().then(() => this.#onWatchdogExpired?.(state.occurrence.id, outstanding)).catch((error: unknown) => this.#reportStopFailure(error, state.occurrence.id));
      void this.#stopAndComplete(state.occurrence.id, "failed").catch((error: unknown) => this.#reportStopFailure(error, state.occurrence.id));
    }, START_DELAY_MS + state.occurrence.content.variant.durationMs + COMPLETION_GRACE_MS);
    for (const start of prepared) {
      try { start(startsAt); }
      catch (error) { state.hadFailure = true; this.#reportPlaybackFailure(error, state.occurrence.id, "browser"); }
    }
    state.preparing = false;
    this.#maybeComplete(state);
  }

  #prepareRecipient(
    state: ActivePlayback,
    recipient: "browser" | "desktop" | "audio",
    prepare: (allowed: () => boolean) => Promise<(startsAt: number) => void>,
    cleanup: () => void | Promise<void>
  ): Promise<(startsAt: number) => void> {
    return new Promise(resolve => {
      let settled = false;
      const allowed = () => !settled && this.#isActive(state);
      const finish = (start: (at: number) => void) => {
        if (settled) return;
        settled = true; clearTimeout(timer); state.preparationCancels.delete(cancel); resolve(start);
      };
      const cancel = () => finish(() => {});
      const fail = async (error: unknown) => {
        if (settled) return;
        settled = true; clearTimeout(timer); state.preparationCancels.delete(cancel);
        state.hadFailure = true;
        this.#reportPlaybackFailure(error, state.occurrence.id, recipient);
        try { await cleanup(); }
        catch (cleanupError) { this.#reportStopFailure(cleanupError, state.occurrence.id); }
        resolve(() => {});
      };
      const timer = this.#scheduleTimer(() => { void fail(new Error(`${recipient} playback preparation timed out after 15000ms.`)); }, 15_000);
      state.preparationCancels.add(cancel);
      try { void prepare(allowed).then(finish, fail); }
      catch (error) { void fail(error); }
    });
  }

  #dispatchBrowser(state: ActivePlayback, instructions: readonly OverlayInstruction[]): void {
    if (this.#overlayPlaybackSink === null) return;
    for (const instruction of instructions) {
      try {
        const delivered = this.#overlayPlaybackSink.deliverPlaybackInstruction(instruction);
        const clients = new Set((delivered?.deliveredClientIds ?? []).filter(id => !state.disconnectedClients.has(id)));
        if (clients.size > 0) {
          state.hadRecipient = true;
          state.browser.set(instruction.id, { pendingClients: clients });
        }
      } catch (error) {
        this.#reportPlaybackFailure(error, state.occurrence.id, "browser");
        // Other recipients remain independent.
      }
    }
  }

  async #prepareAudio(
    state: ActivePlayback,
    audio: readonly ResolvedAlertAudio[],
    allowed: () => boolean
  ): Promise<(startsAt: number) => void> {
    try {
      const prepared = await this.#audioOutputService!.preparePlayback(state.transportId, audio);
      if (!allowed()) return () => {};
      if (prepared.unavailableRouteIds.length > 0 || prepared.batches.length === 0) {
        state.hadFailure = true;
        this.#reportPlaybackFailure(new Error(`Selected audio routes unavailable: ${prepared.unavailableRouteIds.join(", ") || "no prepared destinations"}`), state.occurrence.id, "audio");
      }
      if (prepared.batches.length > 0) state.hadRecipient = true;
      const handles = await Promise.allSettled(prepared.batches.map(batch => {
        const sink = this.#audioPlaybackSink!;
        return sink.prepare === undefined ? Promise.resolve({ start: (startsAtEpochMs: number) => sink.play({ ...batch, moduleId: "screen-effects",
          muted: this.#getSafety().muted, timing: { startsAtEpochMs, endsAtEpochMs: startsAtEpochMs + batch.durationMs } }) })
          : sink.prepare({ ...batch, moduleId: "screen-effects", muted: this.#getSafety().muted });
      }));
      if (!allowed()) return () => {};
      for (const handle of handles) if (handle.status === "rejected") {
        state.hadFailure = true; this.#reportPlaybackFailure(handle.reason, state.occurrence.id, "audio");
      }
      return startsAt => {
        void Promise.allSettled(handles.filter(handle => handle.status === "fulfilled").map(handle =>
          Promise.resolve().then(() => handle.value.start(startsAt)))).then(results => {
          for (const result of results) {
            if (result.status === "rejected") {
              state.hadFailure = true; this.#reportPlaybackFailure(result.reason, state.occurrence.id, "audio");
            } else if (result.value.failedRouteIds.length > 0) {
              state.hadFailure = true;
              this.#reportPlaybackFailure(new Error(`Selected audio routes failed: ${result.value.failedRouteIds.join(", ")}`), state.occurrence.id, "audio");
            }
          }
          if (this.#isActive(state)) { state.audioPending = false; this.#maybeComplete(state); }
        });
      };
    } catch (error) {
      state.hadFailure = true;
      this.#reportPlaybackFailure(error, state.occurrence.id, "audio");
      if (this.#isActive(state)) {
        state.audioPending = false;
        this.#maybeComplete(state);
      }
      return () => {};
    }
  }

  #settleDesktop(state: ActivePlayback, failed: boolean): void {
    if (!this.#isActive(state)) return;
    if (failed) state.hadFailure = true;
    state.desktopPending = false;
    this.#maybeComplete(state);
  }

  #maybeComplete(state: ActivePlayback): void {
    if (
      !this.#isActive(state)
      || state.preparing
      || state.browser.size > 0
      || state.desktopPending
      || state.audioPending
    ) {
      return;
    }
    this.#complete(state, state.hadRecipient && !state.hadFailure ? "completed" : "failed");
  }

  #complete(state: ActivePlayback, status: "completed" | "failed"): boolean {
    if (!this.#isActive(state)) return false;
    state.finished = true;
    for (const cancel of state.preparationCancels) cancel();
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
    const completed = this.#queue.complete(state.occurrence.id, status, this.#now());
    this.#active = null;
    this.#scheduleNext();
    return completed;
  }

  #stopAndComplete(
    occurrenceId: string,
    status: "skipped" | "failed"
  ): Promise<boolean> {
    const state = this.#active;
    if (state === null || state.occurrence.id !== occurrenceId) return Promise.resolve(false);
    if (state.stopping !== null) return state.stopping;
    state.finished = true;
    for (const cancel of state.preparationCancels) cancel();
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
    try {
      this.#overlayPlaybackSink?.stopPlaybackInstructions?.(
        state.browserInstructions.map((instruction) => instruction.id)
      );
    } catch (error) {
      void Promise.resolve(this.#onStopFailure(error, occurrenceId)).catch(
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      () => {
        // error-provenance: allow cleanup -- the production logger owns its own emergency fallback
      });
      // A disconnected browser cannot block local silence.
    }
    state.browser.clear();
    const stops = [
      ...(this.#audioPlaybackSink === null ? [] : [this.#audioPlaybackSink.stop(state.transportId)]),
      ...(this.#desktopVisualSink === null ? [] : [this.#desktopVisualSink.stop(state.transportId)])
    ];
    state.stopping = Promise.all(stops)
      .then(() => {
        if (this.#active !== state) return false;
        const completed = this.#queue.complete(occurrenceId, status, this.#now());
        this.#active = null;
        if (!this.#closed) this.#scheduleNext();
        return completed;
      })
      .catch((error: unknown) => {
        if (this.#active === state) state.stopping = null;
        throw error;
      });
    return state.stopping;
  }

  #isActive(state: ActivePlayback): boolean {
    return this.#active === state && !state.finished && !this.#closed;
  }

  #reportStopFailure(error: unknown, occurrenceId: string): void {
    void Promise.resolve().then(() => this.#onStopFailure(error, occurrenceId)).catch(
    // error-provenance: allow cleanup -- the production logger owns its own emergency fallback
    () => undefined);
  }

  #reportPlaybackFailure(error: unknown, occurrenceId: string, recipient: "browser" | "desktop" | "audio"): void {
    void Promise.resolve(this.#onPlaybackFailure(error, occurrenceId, recipient)).catch(
    // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
    () => {
      // error-provenance: allow cleanup -- the production logger owns its own emergency fallback
    });
  }

  #scheduleNext(): void {
    queueMicrotask(() => { void this.startNext(); });
  }

  #scheduleTimer(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(callback, delayMs);
    timer.unref?.();
    return timer;
  }
}

interface BrowserTarget {
  readonly scope: "module" | "unified";
  readonly targetProfileId?: "landscape" | "vertical";
}

const browserTargets: readonly BrowserTarget[] = [{ scope: "module" }, { scope: "unified" }];

function createBrowserInstructions(
  occurrence: EffectOccurrence,
  startsAtEpochMs: number
): readonly OverlayInstruction[] {
  const { variant } = occurrence.content;
  const purpose = "live";
  const instructions: OverlayInstruction[] = [];
  for (const target of browserTargets) {
    const suffix = `${target.scope}:${target.targetProfileId ?? "default"}`;
    if (variant.visual !== null && variant.visualOutputs.browserSource) {
      instructions.push(createInstruction({
        occurrence,
        id: `${moduleOccurrenceKey("screen-effects", occurrence.id)}:visual:${suffix}`,
        purpose,
        target,
        startsAtEpochMs,
        visual: {
          assetId: variant.visual.assetId,
          mediaType: variant.visual.mediaType,
          layout: variant.visual.layout
        },
        audio: null
      }));
    }
    if (variant.outputs.browserSource && variant.visual?.mediaType === "video" && variant.visual.playEmbeddedAudio) {
      instructions.push(createInstruction({
        occurrence,
        id: `${moduleOccurrenceKey("screen-effects", occurrence.id)}:video-audio:${suffix}`,
        purpose,
        target,
        startsAtEpochMs,
        visual: null,
        audio: {
          assetId: variant.visual.assetId,
          volume: variant.visual.audioVolume,
          sourceKind: "video-soundtrack",
          fadeInMs: variant.visual.audioFadeInMs ?? 0,
          fadeOutMs: variant.visual.audioFadeOutMs ?? 0,
          playbackDurationMs: Math.min(occurrence.content.assetDurations?.[variant.visual.assetId] ?? variant.durationMs, variant.durationMs)
        }
      }));
    }
    if (variant.outputs.browserSource && variant.sound !== null) {
      instructions.push(createInstruction({
        occurrence,
        id: `${moduleOccurrenceKey("screen-effects", occurrence.id)}:sound:${suffix}`,
        purpose,
        target,
        startsAtEpochMs,
        visual: null,
        audio: {
          assetId: variant.sound.assetId,
          volume: variant.sound.volume,
          sourceKind: "audio",
          fadeInMs: variant.sound.fadeInMs ?? 0,
          fadeOutMs: variant.sound.fadeOutMs ?? 0,
          playbackDurationMs: Math.min(occurrence.content.assetDurations?.[variant.sound.assetId] ?? variant.durationMs, variant.durationMs)
        }
      }));
    }
  }
  return instructions;
}

function createDesktopInstructions(
  occurrence: EffectOccurrence,
  startsAtEpochMs: number
): readonly OverlayInstruction[] {
  const { variant } = occurrence.content;
  if (variant.visual === null || !variant.visualOutputs.desktop) return [];
  return [createInstruction({
    occurrence,
    id: `${moduleOccurrenceKey("screen-effects", occurrence.id)}:desktop-visual`,
    purpose: "live",
    target: { scope: "module", targetProfileId: "landscape" },
    startsAtEpochMs,
    visual: {
      assetId: variant.visual.assetId,
      mediaType: variant.visual.mediaType,
      layout: variant.visual.layout
    },
    audio: null
  })];
}

function createInstruction(input: {
  readonly occurrence: EffectOccurrence;
  readonly id: string;
  readonly purpose: "live" | "test";
  readonly target: BrowserTarget;
  readonly startsAtEpochMs: number;
  readonly visual: OverlayInstruction["visual"];
  readonly audio: OverlayInstruction["audio"];
}): OverlayInstruction {
  const durationMs = input.occurrence.content.variant.durationMs;
  return overlayInstructionSchema.parse({
    id: input.id,
    overlayId: "default",
    moduleId: "screen-effects",
    ...(input.occurrence.trigger === null ? { operatorTest: true } : {}),
    purpose: input.purpose,
    scope: input.target.scope,
    ...(input.target.targetProfileId === undefined ? {} : {
      targetProfileId: input.target.targetProfileId
    }),
    visual: input.visual,
    audio: input.audio,
    text: null,
    shape: null,
    animation: null,
    tts: null,
    durationMs,
    timing: {
      startsAtEpochMs: input.startsAtEpochMs,
      endsAtEpochMs: input.startsAtEpochMs + durationMs
    }
  });
}

function createResolvedAudio(occurrence: EffectOccurrence): readonly ResolvedAlertAudio[] {
  const { variant } = occurrence.content;
  if (variant.outputs.deviceRouteIds.length === 0) return [];
  const layers: ResolvedAlertAudio["layers"][number][] = [];
  if (variant.visual?.mediaType === "video" && variant.visual.playEmbeddedAudio) {
    layers.push({
      sourceKind: "video-soundtrack",
      layerId: `${variant.id}:video`,
      assetId: variant.visual.assetId,
      volume: variant.visual.audioVolume,
      fadeInMs: variant.visual.audioFadeInMs ?? 0,
      fadeOutMs: variant.visual.audioFadeOutMs ?? 0,
      playbackDurationMs: Math.min(occurrence.content.assetDurations?.[variant.visual.assetId] ?? variant.durationMs, variant.durationMs)
    });
  }
  if (variant.sound !== null) {
    layers.push({
      sourceKind: "audio",
      layerId: `${variant.id}:sound`,
      assetId: variant.sound.assetId,
      volume: variant.sound.volume,
      fadeInMs: variant.sound.fadeInMs ?? 0,
      fadeOutMs: variant.sound.fadeOutMs ?? 0,
      playbackDurationMs: Math.min(occurrence.content.assetDurations?.[variant.sound.assetId] ?? variant.durationMs, variant.durationMs)
    });
  }
  return layers.length === 0 ? [] : [{
    documentId: occurrence.content.effectId,
    durationMs: variant.durationMs,
    outputs: structuredClone(variant.outputs),
    layers
  }];
}
