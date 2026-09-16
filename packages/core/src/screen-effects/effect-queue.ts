import type { PlaybackSafetyState } from "../playback/types.js";
import type { EffectContentSnapshot, EffectTrigger } from "./types.js";

export type EffectOccurrenceStatus = "queued" | "playing" | "completed" | "skipped" | "failed";
export type EffectOccurrenceCompletionStatus = Extract<EffectOccurrenceStatus, "completed" | "skipped" | "failed">;

export interface EffectOccurrence {
  readonly id: string;
  readonly moduleId: "screen-effects";
  readonly trigger: EffectTrigger | null;
  readonly content: EffectContentSnapshot;
  readonly enqueuedAtMs: number;
  readonly sequence: number;
  readonly startedAtMs: number | null;
  readonly completedAtMs: number | null;
  readonly status: EffectOccurrenceStatus;
}

export interface EffectQueueSnapshot {
  readonly current: EffectOccurrence | null;
  readonly queued: readonly EffectOccurrence[];
  readonly recent: readonly EffectOccurrence[];
  readonly modulePaused: boolean;
}

export interface EffectQueue {
  hasPendingCapacity(): boolean;
  enqueue(item: EffectOccurrence): "queued" | "full";
  snapshot(): EffectQueueSnapshot;
  advance(safety: PlaybackSafetyState): EffectOccurrence | null;
  complete(occurrenceId: string, status: EffectOccurrenceCompletionStatus, nowMs: number): boolean;
  remove(occurrenceId: string): boolean;
  clearPending(): number;
  setModulePaused(paused: boolean): void;
}

export interface EffectQueueOptions {
  readonly maxPending?: number;
  readonly recentLimit?: number;
  readonly modulePaused?: boolean;
  readonly now?: () => number;
}

export function comparePendingEffects(left: EffectOccurrence, right: EffectOccurrence): number {
  if (left.content.priority !== right.content.priority) {
    return left.content.priority > right.content.priority ? -1 : 1;
  }
  if (left.sequence === right.sequence) return 0;
  return left.sequence < right.sequence ? -1 : 1;
}

export class DefaultEffectQueue implements EffectQueue {
  readonly #maxPending: number;
  readonly #recentLimit: number;
  readonly #now: () => number;
  #current: EffectOccurrence | null = null;
  #queued: EffectOccurrence[] = [];
  #recent: EffectOccurrence[] = [];
  #modulePaused: boolean;

  constructor(options: EffectQueueOptions = {}) {
    this.#maxPending = boundedInteger(options.maxPending ?? 100, "maxPending", 1);
    this.#recentLimit = boundedInteger(options.recentLimit ?? 25, "recentLimit", 0);
    this.#modulePaused = options.modulePaused ?? false;
    this.#now = options.now ?? Date.now;
  }

  hasPendingCapacity(): boolean {
    return this.#queued.length < this.#maxPending;
  }

  enqueue(item: EffectOccurrence): "queued" | "full" {
    validateQueuedOccurrence(item);
    if (!this.hasPendingCapacity()) return "full";
    this.#queued.push(structuredClone(item));
    this.#queued.sort(comparePendingEffects);
    return "queued";
  }

  snapshot(): EffectQueueSnapshot {
    return structuredClone({
      current: this.#current,
      queued: this.#queued,
      recent: this.#recent,
      modulePaused: this.#modulePaused
    });
  }

  advance(safety: PlaybackSafetyState): EffectOccurrence | null {
    if (this.#current !== null || this.#modulePaused || safety.paused || safety.doNotDisturb) {
      return null;
    }
    const next = this.#queued.shift();
    if (next === undefined) return null;
    this.#current = {
      ...next,
      status: "playing",
      startedAtMs: this.#now()
    };
    return structuredClone(this.#current);
  }

  complete(occurrenceId: string, status: EffectOccurrenceCompletionStatus, nowMs: number): boolean {
    if (this.#current?.id !== occurrenceId) return false;
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new RangeError("Completion time must be a non-negative safe integer");
    }
    this.#recent.unshift({ ...this.#current, status, completedAtMs: nowMs });
    this.#recent = this.#recent.slice(0, this.#recentLimit);
    this.#current = null;
    return true;
  }

  remove(occurrenceId: string): boolean {
    const index = this.#queued.findIndex((candidate) => candidate.id === occurrenceId);
    if (index < 0) return false;
    this.#queued.splice(index, 1);
    return true;
  }

  clearPending(): number {
    const count = this.#queued.length;
    this.#queued = [];
    return count;
  }

  setModulePaused(paused: boolean): void {
    this.#modulePaused = paused;
  }
}

function validateQueuedOccurrence(item: EffectOccurrence): void {
  if (
    item.moduleId !== "screen-effects"
    || item.status !== "queued"
    || item.startedAtMs !== null
    || item.completedAtMs !== null
    || item.id.trim().length === 0
    || !Number.isSafeInteger(item.content.priority)
    || !Number.isSafeInteger(item.sequence)
    || item.sequence < 0
    || !Number.isSafeInteger(item.enqueuedAtMs)
    || item.enqueuedAtMs < 0
  ) {
    throw new TypeError("Effect queue accepts only valid queued Screen Effects occurrences");
  }
}

function boundedInteger(value: number, label: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be a safe integer of at least ${minimum}`);
  }
  return value;
}
