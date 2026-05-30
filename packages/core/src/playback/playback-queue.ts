import type { NormalizedStreamEvent } from "../events/types.js";
import type { PlaybackQueueItem, PlaybackQueueSnapshot, ResolvedAlert } from "./types.js";

export interface EnqueuePlaybackItemInput {
  readonly sourceEvent: NormalizedStreamEvent;
  readonly alerts: readonly ResolvedAlert[];
  readonly priority?: number;
}

export interface PlaybackQueue {
  getSnapshot(): PlaybackQueueSnapshot;
  enqueue(input: EnqueuePlaybackItemInput): PlaybackQueueSnapshot;
  completeCurrent(): PlaybackQueueSnapshot;
  skipCurrent(): PlaybackQueueSnapshot;
  replayRecent(itemId: string): PlaybackQueueSnapshot;
  pause(): PlaybackQueueSnapshot;
  resume(): PlaybackQueueSnapshot;
  mute(): PlaybackQueueSnapshot;
  unmute(): PlaybackQueueSnapshot;
  setDoNotDisturb(enabled: boolean): PlaybackQueueSnapshot;
}

export interface PlaybackQueueDependencies {
  readonly clock?: () => Date;
  readonly generateId: () => string;
  readonly recentLimit?: number;
}

export class PlaybackQueueItemNotFoundError extends Error {
  constructor(readonly itemId: string) {
    super(`Playback queue item "${itemId}" was not found`);
    this.name = "PlaybackQueueItemNotFoundError";
  }
}

interface InternalPlaybackQueueItem extends PlaybackQueueItem {
  readonly sequence: number;
}

export class DefaultPlaybackQueue implements PlaybackQueue {
  readonly #clock: () => Date;
  readonly #generateId: () => string;
  readonly #recentLimit: number;
  #current: InternalPlaybackQueueItem | null = null;
  #queued: InternalPlaybackQueueItem[] = [];
  #recent: InternalPlaybackQueueItem[] = [];
  #paused = false;
  #muted = false;
  #doNotDisturb = false;
  #nextSequence = 0;

  constructor(dependencies: PlaybackQueueDependencies) {
    this.#clock = dependencies.clock ?? (() => new Date());
    this.#generateId = dependencies.generateId;
    this.#recentLimit = dependencies.recentLimit ?? 25;
  }

  getSnapshot(): PlaybackQueueSnapshot {
    return this.#snapshot();
  }

  enqueue(input: EnqueuePlaybackItemInput): PlaybackQueueSnapshot {
    if (input.alerts.length === 0) {
      return this.#snapshot();
    }

    const now = this.#now();
    this.#queued.push({
      id: this.#generateId(),
      sourceEvent: input.sourceEvent,
      alerts: [...input.alerts],
      priority: input.priority ?? 0,
      status: "queued",
      enqueuedAt: now,
      startedAt: null,
      completedAt: null,
      sequence: this.#nextSequence++
    });
    this.#sortQueued();
    this.#maybeStartNext(now);
    return this.#snapshot();
  }

  completeCurrent(): PlaybackQueueSnapshot {
    return this.#finishCurrent("completed");
  }

  skipCurrent(): PlaybackQueueSnapshot {
    return this.#finishCurrent("skipped");
  }

  replayRecent(itemId: string): PlaybackQueueSnapshot {
    const item = this.#recent.find((candidate) => candidate.id === itemId);
    if (item === undefined) {
      throw new PlaybackQueueItemNotFoundError(itemId);
    }

    return this.enqueue({
      sourceEvent: item.sourceEvent,
      alerts: item.alerts,
      priority: item.priority
    });
  }

  pause(): PlaybackQueueSnapshot {
    this.#paused = true;
    return this.#snapshot();
  }

  resume(): PlaybackQueueSnapshot {
    this.#paused = false;
    this.#maybeStartNext(this.#now());
    return this.#snapshot();
  }

  mute(): PlaybackQueueSnapshot {
    this.#muted = true;
    return this.#snapshot();
  }

  unmute(): PlaybackQueueSnapshot {
    this.#muted = false;
    return this.#snapshot();
  }

  setDoNotDisturb(enabled: boolean): PlaybackQueueSnapshot {
    this.#doNotDisturb = enabled;
    this.#maybeStartNext(this.#now());
    return this.#snapshot();
  }

  #finishCurrent(status: "completed" | "skipped"): PlaybackQueueSnapshot {
    if (this.#current === null) {
      return this.#snapshot();
    }

    const now = this.#now();
    this.#recent.unshift({
      ...this.#current,
      status,
      completedAt: now
    });
    this.#recent = this.#recent.slice(0, this.#recentLimit);
    this.#current = null;
    this.#maybeStartNext(now);
    return this.#snapshot();
  }

  #maybeStartNext(now: string): void {
    if (this.#current !== null || this.#paused || this.#doNotDisturb || this.#queued.length === 0) {
      return;
    }

    const next = this.#queued.shift();
    if (next === undefined) {
      return;
    }

    this.#current = {
      ...next,
      status: "playing",
      startedAt: now
    };
  }

  #sortQueued(): void {
    this.#queued.sort((left, right) => {
      const priorityDifference = right.priority - left.priority;
      return priorityDifference === 0 ? left.sequence - right.sequence : priorityDifference;
    });
  }

  #snapshot(): PlaybackQueueSnapshot {
    return {
      current: this.#current === null ? null : toPlaybackQueueItem(this.#current),
      queued: this.#queued.map(toPlaybackQueueItem),
      recent: this.#recent.map(toPlaybackQueueItem),
      paused: this.#paused,
      muted: this.#muted,
      doNotDisturb: this.#doNotDisturb
    };
  }

  #now(): string {
    return this.#clock().toISOString();
  }
}

function toPlaybackQueueItem(item: InternalPlaybackQueueItem): PlaybackQueueItem {
  return {
    id: item.id,
    sourceEvent: item.sourceEvent,
    alerts: item.alerts,
    priority: item.priority,
    status: item.status,
    enqueuedAt: item.enqueuedAt,
    startedAt: item.startedAt,
    completedAt: item.completedAt
  };
}
