import {
  timerAdjustmentSchema,
  MAX_TIMER_REMAINING_MS,
  compareTimerRuns,
  projectTimerStack,
  timersOverlayModuleConfigSchema,
  type OverlayModuleConfig,
  type OverlayModuleRuntime,
  type OverlayModuleSnapshot,
  type OverlayModuleSnapshotRequest,
  type TimerCommandResult,
  type TimerDefinitionRepository,
  type TimerRunState
} from "@stream-jams/core";
import type { TimerAdjustment } from "@stream-jams/core";
import type { TimerRunRepository } from "./sqlite-timer-run-repository.js";
import { snapshotTimerDefinition, TimerDefinitionNotFoundError, type TimerActivityProbe } from "./timer-management-service.js";

import type { LocalMediaService } from "../assets/local-media-service.js";

const MAX_SCHEDULE_DELAY_MS = 2_147_483_647;
const COMPLETION_HOLD_MS = 3_000;

export interface TimerClock { now(): number; }

export interface TimerScheduler {
  schedule(delayMs: number, callback: () => void): { cancel(): void };
}

export interface TimerCueSink {
  close?(): Promise<void>;
  play(input: { readonly cue: "start" | "end"; readonly run: TimerRunState }): Promise<void>;
  stop(generation: string): Promise<void>;
}

interface TimerRuntimeCoordinatorOptions {
  readonly recovery?: TimerRunRepository;
  readonly onRecoveryError?: (error: unknown) => void;
  readonly localMediaService?: LocalMediaService;
  readonly definitions: Pick<TimerDefinitionRepository, "findById">;
  readonly config: { getModuleConfig(moduleId: string): Promise<OverlayModuleConfig> };
  readonly clock: TimerClock;
  readonly scheduler: TimerScheduler;
  readonly cueSink?: TimerCueSink;
  readonly generateGeneration?: () => string;
  readonly assertCommandAvailable?: () => void;
}

interface RuntimeEntry {
  iconAvailable: boolean;
  state: TimerRunState;
  scheduled: { cancel(): void } | null;
}

export class TimerRuntimeCoordinator implements TimerActivityProbe, OverlayModuleRuntime {
  readonly #recovery: TimerRunRepository | undefined;
  readonly #onRecoveryError: ((error: unknown) => void) | undefined;
  #checkpoint: { cancel(): void } | null = null;
  readonly #media: LocalMediaService | undefined;
  readonly #entries = new Map<string, RuntimeEntry>();
  readonly #listeners = new Set<(revision: number) => void>();
  readonly #definitions: TimerRuntimeCoordinatorOptions["definitions"];
  readonly #config: TimerRuntimeCoordinatorOptions["config"];
  readonly #clock: TimerClock;
  readonly #scheduler: TimerScheduler;
  readonly #cueSink: TimerCueSink | undefined;
  readonly #generateGeneration: () => string;
  readonly #assertCommandAvailable: (() => void) | undefined;
  #nextGeneration = 0;
  #revision = 0;
  #closed = false;

  constructor(options: TimerRuntimeCoordinatorOptions) {
    this.#recovery = options.recovery;
    this.#onRecoveryError = options.onRecoveryError;
    this.#media = options.localMediaService;
    this.#definitions = options.definitions;
    this.#config = options.config;
    this.#clock = options.clock;
    this.#scheduler = options.scheduler;
    this.#cueSink = options.cueSink;
    this.#assertCommandAvailable = options.assertCommandAvailable;
    this.#generateGeneration = options.generateGeneration ?? (() => `timer-run-${++this.#nextGeneration}`);
  }

  isActive(definitionId: string): boolean { return this.#entries.has(definitionId); }

  listStates(): readonly TimerRunState[] {
    return structuredClone([...this.#entries.values()].map(entry => entry.state).sort(compareTimerRuns));
  }

  getState(definitionId: string): TimerRunState | null {
    const state = this.#entries.get(definitionId)?.state;
    return state === undefined ? null : structuredClone(state);
  }

  async restore(): Promise<void> {
    this.#assertOpen();
    for (const saved of this.#recovery?.list() ?? []) {
      if (saved.status !== "paused" || this.#definitions.findById(saved.definitionId) === null) continue;
      const entry: RuntimeEntry = { state: saved, scheduled: null, iconAvailable: true };
      this.#entries.set(saved.definitionId, entry);
      if (this.#media !== undefined) {
        try {
          await this.#media.acquire(timerRunOwner(saved.generation), [saved.snapshot.iconAssetId, saved.snapshot.startAudioAssetId, saved.snapshot.endAudioAssetId].filter((id): id is string => id !== null), undefined, true);
        } catch (error) {
          // error-provenance: allow expected -- missing restored media is diagnosed without losing retained time
          entry.iconAvailable = false;
          this.#onRecoveryError?.(error);
        }
      }
    }
    this.#publish();
  }

  async adjust(definitionId: string, candidate: TimerAdjustment, inactiveBehavior: "ignore" | "start" | "paused" = "ignore"): Promise<TimerCommandResult> {
    this.#assertOpen();
    const input = timerAdjustmentSchema.parse(candidate);
    let created = false;
    let entry = this.#entries.get(definitionId);
    if (entry?.state.status === "completed") {
      if (input.action !== "set" && inactiveBehavior === "ignore") return this.#result(false, entry.state);
      await this.stop(definitionId);
      entry = undefined;
    }
    if (entry === undefined) {
      if (input.action !== "set" && inactiveBehavior === "ignore") return this.#result(false, null);
      if (input.action === "set" && input.amountMs === 0) return this.#result(false, null);
      await this.#startFresh(definitionId, true);
      created = true;
      entry = this.#entries.get(definitionId);
      if (entry === undefined) return this.#result(false, null);
      // New runs are created paused before adjusting; no transient start cue.
    }
    const state = entry.state;
    if (state.status === "completed") return this.#result(false, state);
    const oldRemaining = state.status === "paused" ? state.remainingMs : Math.max(0, state.endsAtEpochMs - this.#clock.now());
    const remainingMs = input.action === "set" ? input.amountMs : Math.min(MAX_TIMER_REMAINING_MS, Math.max(0, oldRemaining + (input.action === "increment" ? input.amountMs : -input.amountMs)));
    if (remainingMs === oldRemaining && !created) return this.#result(false, state);
    if (remainingMs === 0) {
      this.#complete(definitionId, state.generation);
      return this.#result(true, entry.state);
    }
    if (state.status === "running") {
      entry.state = { ...state, startedAtEpochMs: this.#clock.now(), endsAtEpochMs: this.#clock.now() + remainingMs };
      this.#scheduleDeadline(definitionId, state.generation);
    } else entry.state = { ...state, remainingMs };
    this.#publish();
    if (created && inactiveBehavior === "start" && state.status === "paused") {
      await this.resume(definitionId);
      await this.#settleCuePlay("start", entry.state);
    }
    return this.#result(true, entry.state);
  }

  async start(definitionId: string): Promise<TimerCommandResult> {
    this.#assertOpen();
    const existing = this.#entries.get(definitionId);
    if (existing !== undefined) return this.#result(false, existing.state);
    return this.#startFresh(definitionId);
  }

  async pause(definitionId: string): Promise<TimerCommandResult> {
    this.#assertOpen();
    const entry = this.#entries.get(definitionId);
    if (entry?.state.status !== "running") return this.#result(false, entry?.state ?? null);
    const remainingMs = Math.max(0, entry.state.endsAtEpochMs - this.#clock.now());
    if (remainingMs === 0) {
      this.#complete(definitionId, entry.state.generation);
      return this.#result(true, this.#entries.get(definitionId)?.state ?? null);
    }
    entry.scheduled?.cancel();
    entry.scheduled = null;
    entry.state = {
      status: "paused",
      definitionId,
      generation: entry.state.generation,
      snapshot: entry.state.snapshot,
      remainingMs
    };
    this.#publish();
    return this.#result(true, entry.state);
  }

  async resume(definitionId: string): Promise<TimerCommandResult> {
    this.#assertOpen();
    const entry = this.#entries.get(definitionId);
    if (entry?.state.status !== "paused") return this.#result(false, entry?.state ?? null);
    const startedAtEpochMs = this.#clock.now();
    entry.state = {
      status: "running",
      definitionId,
      generation: entry.state.generation,
      snapshot: entry.state.snapshot,
      startedAtEpochMs,
      endsAtEpochMs: startedAtEpochMs + entry.state.remainingMs
    };
    this.#scheduleDeadline(definitionId, entry.state.generation);
    this.#publish();
    return this.#result(true, entry.state);
  }

  async stop(definitionId: string): Promise<TimerCommandResult> {
    this.#assertOpen();
    const entry = this.#entries.get(definitionId);
    if (entry === undefined) return this.#result(false, null);
    entry.scheduled?.cancel();
    this.#entries.delete(definitionId);
    this.#publish();
    await this.#settleCueStop(entry.state.generation);
    await this.#media?.release(timerRunOwner(entry.state.generation));
    return this.#result(true, null);
  }

  async restart(definitionId: string): Promise<TimerCommandResult> {
    this.#assertOpen();
    const existing = this.#entries.get(definitionId);
    let cleanup: Promise<void> | undefined;
    if (existing !== undefined) {
      existing.scheduled?.cancel();
      this.#entries.delete(definitionId);
      cleanup = this.#settleCueStop(existing.state.generation).then(() => this.#media?.release(timerRunOwner(existing.state.generation)));
    }
    // Commit the replacement before yielding: cleanup must never reopen a stopped or closed timer.
    const started = this.#startFresh(definitionId);
    const [result] = await Promise.all([started, cleanup]);
    return result;
  }

  subscribe(listener: (revision: number) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    const saved = await this.#config.getModuleConfig("timers");
    const config = timersOverlayModuleConfigSchema.parse(saved.config);
    const targetProfileId = request.targetProfileId ?? "landscape";
    const projection = projectTimerStack({ nowEpochMs: this.#clock.now(), targetProfileId, region: config.profiles[targetProfileId], runs: this.listStates() });
    const cards = projection.cards.map(card => {
      if (this.#media === undefined || card.iconAssetId === null) return card;
      if (this.#entries.get(card.definitionId)?.iconAvailable === false) return { ...card, iconAssetId: null };
      try { return { ...card, iconVersion: this.#media.descriptor(timerRunOwner(card.generation), card.iconAssetId).version }; }
      // error-provenance: allow expected -- retired or unavailable icons retain the existing transparent fallback
      catch { return { ...card, iconAssetId: null }; }
    });
    return {
      moduleId: "timers",
      enabled: saved.enabled,
      instructions: [],
      presentation: {
        kind: "timer-stack",
        stack: { ...projection, cards }
      }
    };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#saveRecovery();
    this.#checkpoint?.cancel();
    this.#checkpoint = null;
    this.#closed = true;
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    this.#listeners.clear();
    for (const entry of entries) entry.scheduled?.cancel();
    await Promise.allSettled(entries.map(async entry => {
      await this.#settleCueStop(entry.state.generation);
      await this.#media?.release(timerRunOwner(entry.state.generation));
    }));
    await this.#cueSink?.close?.();
  }

  async #startFresh(definitionId: string, paused = false): Promise<TimerCommandResult> {
    const definition = this.#definitions.findById(definitionId);
    if (definition === null) throw new TimerDefinitionNotFoundError(definitionId);
    const startedAtEpochMs = this.#clock.now();
    const state: TimerRunState = paused ? {
      status: "paused", definitionId, generation: this.#generateGeneration(),
      snapshot: snapshotTimerDefinition(definition), remainingMs: definition.durationMs
    } : {
      status: "running",
      definitionId,
      generation: this.#generateGeneration(),
      snapshot: snapshotTimerDefinition(definition),
      startedAtEpochMs,
      endsAtEpochMs: startedAtEpochMs + definition.durationMs
    };
    const entry: RuntimeEntry = { state, scheduled: null, iconAvailable: true };
    this.#entries.set(definitionId, entry);
    if (this.#media !== undefined) {
      const owner = timerRunOwner(state.generation);
      try {
        await this.#media.acquire(owner, [definition.iconAssetId, definition.startAudioAssetId, definition.endAudioAssetId].filter((id): id is string => id !== null), undefined, true);
        if (definition.iconAssetId !== null) {
          try { await this.#media.verifyGroup(owner, [definition.iconAssetId], AbortSignal.timeout(5000)); }
          // error-provenance: allow expected -- an unreadable icon cannot prevent the authoritative timer run
          catch { entry.iconAvailable = false; }
        }
      } catch (error) {
        if (this.#entries.get(definitionId) === entry) this.#entries.delete(definitionId);
        await this.#media.release(owner);
        throw error;
      }
      if (this.#closed || this.#entries.get(definitionId) !== entry) {
        await this.#media.release(owner);
        return this.#result(true, this.#entries.get(definitionId)?.state ?? null);
      }
    }
    this.#scheduleDeadline(definitionId, state.generation);
    this.#publish();
    if (!paused) await this.#settleCuePlay("start", state);
    return this.#result(true, state);
  }

  #scheduleDeadline(definitionId: string, generation: string): void {
    const entry = this.#entries.get(definitionId);
    if (entry?.state.status !== "running" || entry.state.generation !== generation) return;
    entry.scheduled?.cancel();
    const remainingMs = Math.max(0, entry.state.endsAtEpochMs - this.#clock.now());
    const delayMs = Math.min(MAX_SCHEDULE_DELAY_MS, remainingMs);
    entry.scheduled = this.#scheduler.schedule(delayMs, () => {
      const current = this.#entries.get(definitionId);
      if (current?.state.status !== "running" || current.state.generation !== generation) return;
      if (current.state.endsAtEpochMs > this.#clock.now()) this.#scheduleDeadline(definitionId, generation);
      else this.#complete(definitionId, generation);
    });
  }

  #complete(definitionId: string, generation: string): void {
    const entry = this.#entries.get(definitionId);
    if (entry === undefined || entry.state.status === "completed" || entry.state.generation !== generation) return;
    entry.scheduled?.cancel();
    const completedAtEpochMs = this.#clock.now();
    entry.state = {
      status: "completed",
      definitionId,
      generation,
      snapshot: entry.state.snapshot,
      completedAtEpochMs,
      expiresAtEpochMs: completedAtEpochMs + COMPLETION_HOLD_MS
    };
    entry.scheduled = this.#scheduler.schedule(COMPLETION_HOLD_MS, () => {
      const current = this.#entries.get(definitionId);
      if (current?.state.status !== "completed" || current.state.generation !== generation) return;
      this.#entries.delete(definitionId);
      this.#publish();
      void this.#media?.release(timerRunOwner(generation));
    });
    this.#publish();
    void this.#settleCuePlay("end", entry.state);
  }

  #publish(): void {
    this.#saveRecovery();
    this.#checkpoint?.cancel();
    this.#checkpoint = null;
    if (this.#recovery !== undefined && [...this.#entries.values()].some(entry => entry.state.status === "running")) {
      this.#scheduleCheckpoint();
    }
    const revision = ++this.#revision;
    for (const listener of this.#listeners) listener(revision);
  }

  #saveRecovery(): void {
    const states: TimerRunState[] = [];
    for (const { state } of this.#entries.values()) {
      if (state.status === "paused") states.push(state);
      if (state.status === "running") {
        const remainingMs = Math.max(0, state.endsAtEpochMs - this.#clock.now());
        if (remainingMs > 0) states.push({ status: "paused", definitionId: state.definitionId, generation: state.generation, snapshot: state.snapshot, remainingMs });
      }
    }
    this.#recovery?.replace(states);
  }

  #scheduleCheckpoint(): void {
    this.#checkpoint = this.#scheduler.schedule(1000, () => {
      if (this.#closed) return;
      try { this.#saveRecovery(); }
      catch (error) {
        // error-provenance: allow expected -- checkpoint failure is diagnosed and retried on the next interval
        this.#onRecoveryError?.(error);
      }
      this.#scheduleCheckpoint();
    });
  }

  #result(changed: boolean, state: TimerRunState | null): TimerCommandResult {
    return { changed, state: state === null ? null : structuredClone(state) };
  }

  async #settleCuePlay(cue: "start" | "end", run: TimerRunState): Promise<void> {
    try { await this.#cueSink?.play({ cue, run: structuredClone(run) }); }
    // error-provenance: allow expected -- cue failures cannot roll back an authoritative timer transition
    catch { /* Cue failure must not alter the authoritative timer transition. */ }
  }

  async #settleCueStop(generation: string): Promise<void> {
    try { await this.#cueSink?.stop(generation); }
    // error-provenance: allow cleanup -- cue cleanup failure cannot block the authoritative timer transition
    catch { /* Stopping a failed cue must not block the timer transition. */ }
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error("Timer runtime is closed");
    this.#assertCommandAvailable?.();
  }
}

export function timerRunOwner(generation: string): string { return JSON.stringify(["timers", generation]); }
