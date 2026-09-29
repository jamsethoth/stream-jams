import {
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
import { snapshotTimerDefinition, TimerDefinitionNotFoundError, type TimerActivityProbe } from "./timer-management-service.js";

const MAX_SCHEDULE_DELAY_MS = 2_147_483_647;
const COMPLETION_HOLD_MS = 3_000;

export interface TimerClock { now(): number; }

export interface TimerScheduler {
  schedule(delayMs: number, callback: () => void): { cancel(): void };
}

export interface TimerCueSink {
  play(input: { readonly cue: "start" | "end"; readonly run: TimerRunState }): Promise<void>;
  stop(generation: string): Promise<void>;
}

interface TimerRuntimeCoordinatorOptions {
  readonly definitions: Pick<TimerDefinitionRepository, "findById">;
  readonly config: { getModuleConfig(moduleId: string): Promise<OverlayModuleConfig> };
  readonly clock: TimerClock;
  readonly scheduler: TimerScheduler;
  readonly cueSink?: TimerCueSink;
  readonly generateGeneration?: () => string;
}

interface RuntimeEntry {
  state: TimerRunState;
  scheduled: { cancel(): void } | null;
}

export class TimerRuntimeCoordinator implements TimerActivityProbe, OverlayModuleRuntime {
  readonly #entries = new Map<string, RuntimeEntry>();
  readonly #listeners = new Set<(revision: number) => void>();
  readonly #definitions: TimerRuntimeCoordinatorOptions["definitions"];
  readonly #config: TimerRuntimeCoordinatorOptions["config"];
  readonly #clock: TimerClock;
  readonly #scheduler: TimerScheduler;
  readonly #cueSink: TimerCueSink | undefined;
  readonly #generateGeneration: () => string;
  #nextGeneration = 0;
  #revision = 0;
  #closed = false;

  constructor(options: TimerRuntimeCoordinatorOptions) {
    this.#definitions = options.definitions;
    this.#config = options.config;
    this.#clock = options.clock;
    this.#scheduler = options.scheduler;
    this.#cueSink = options.cueSink;
    this.#generateGeneration = options.generateGeneration ?? (() => `timer-run-${++this.#nextGeneration}`);
  }

  isActive(definitionId: string): boolean { return this.#entries.has(definitionId); }

  listStates(): readonly TimerRunState[] {
    return structuredClone([...this.#entries.values()].map(entry => entry.state).sort(compareTimerStates));
  }

  getState(definitionId: string): TimerRunState | null {
    const state = this.#entries.get(definitionId)?.state;
    return state === undefined ? null : structuredClone(state);
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
    return this.#result(true, null);
  }

  async restart(definitionId: string): Promise<TimerCommandResult> {
    this.#assertOpen();
    const existing = this.#entries.get(definitionId);
    if (existing !== undefined) {
      existing.scheduled?.cancel();
      this.#entries.delete(definitionId);
      await this.#settleCueStop(existing.state.generation);
    }
    return this.#startFresh(definitionId);
  }

  subscribe(listener: (revision: number) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  async getModuleSnapshot(request: OverlayModuleSnapshotRequest): Promise<OverlayModuleSnapshot> {
    const saved = await this.#config.getModuleConfig("timers");
    const config = timersOverlayModuleConfigSchema.parse(saved.config);
    const targetProfileId = request.targetProfileId ?? "landscape";
    return {
      moduleId: "timers",
      enabled: saved.enabled,
      instructions: [],
      presentation: {
        kind: "timer-stack",
        stack: projectTimerStack({
          nowEpochMs: this.#clock.now(),
          targetProfileId,
          region: config.profiles[targetProfileId],
          runs: this.listStates()
        })
      }
    };
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    this.#listeners.clear();
    for (const entry of entries) entry.scheduled?.cancel();
    await Promise.allSettled(entries.map(entry => this.#cueSink?.stop(entry.state.generation)));
  }

  async #startFresh(definitionId: string): Promise<TimerCommandResult> {
    const definition = this.#definitions.findById(definitionId);
    if (definition === null) throw new TimerDefinitionNotFoundError(definitionId);
    const startedAtEpochMs = this.#clock.now();
    const state: TimerRunState = {
      status: "running",
      definitionId,
      generation: this.#generateGeneration(),
      snapshot: snapshotTimerDefinition(definition),
      startedAtEpochMs,
      endsAtEpochMs: startedAtEpochMs + definition.durationMs
    };
    this.#entries.set(definitionId, { state, scheduled: null });
    this.#scheduleDeadline(definitionId, state.generation);
    this.#publish();
    await this.#settleCuePlay("start", state);
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
    if (entry?.state.status !== "running" || entry.state.generation !== generation) return;
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
    });
    this.#publish();
    void this.#settleCuePlay("end", entry.state);
  }

  #publish(): void {
    const revision = ++this.#revision;
    for (const listener of this.#listeners) listener(revision);
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
  }
}

function compareTimerStates(left: TimerRunState, right: TimerRunState): number {
  const rank = (state: TimerRunState) => state.status === "completed" ? 0 : state.status === "running" ? 1 : 2;
  const rankDifference = rank(left) - rank(right); if (rankDifference !== 0) return rankDifference;
  const deadline = (state: TimerRunState) => state.status === "completed" ? state.expiresAtEpochMs : state.status === "running" ? state.endsAtEpochMs : state.remainingMs;
  return deadline(left) - deadline(right) || left.snapshot.label.localeCompare(right.snapshot.label) || left.definitionId.localeCompare(right.definitionId);
}
