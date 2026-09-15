import {
  PlaybackQueueItemNotFoundError,
  ownerOperationsSnapshotSchema,
  type EffectQueue,
  type EffectQueueSnapshot,
  type OperationRow,
  type OwnerOperationsSnapshot,
  type PlaybackQueueSnapshot,
  type QueueOwner
} from "@stream-jams/core";
import type { EffectAdmissionOutcome } from "../screen-effects/effect-admission-service.js";

interface AlertOwnerCoordinator {
  getSnapshot(): PlaybackQueueSnapshot;
  skip(occurrenceId: string): Promise<boolean>;
  remove(occurrenceId: string): boolean;
  replayRecent(occurrenceId: string): PlaybackQueueSnapshot;
  clearPending(): number;
  setModulePaused(paused: boolean): PlaybackQueueSnapshot;
}

interface EffectOwnerCoordinator {
  skip(occurrenceId: string): Promise<boolean>;
  startNext(): Promise<void>;
}

export function createAlertQueueOwner(options: {
  readonly coordinator: AlertOwnerCoordinator;
  readonly isPaused: () => boolean;
  readonly persistPaused: (paused: boolean) => Promise<void>;
}): QueueOwner {
  return {
    moduleId: "alerts",
    snapshot: () => toAlertOwnerSnapshot(options.coordinator.getSnapshot(), options.isPaused()),
    skip: (occurrenceId) => options.coordinator.skip(occurrenceId),
    remove: async (occurrenceId) => options.coordinator.remove(occurrenceId),
    replay: async (occurrenceId) => {
      try {
        options.coordinator.replayRecent(occurrenceId);
        return true;
      } catch (error) {
        if (error instanceof PlaybackQueueItemNotFoundError) return false;
        throw error;
      }
    },
    clearPending: async () => options.coordinator.clearPending(),
    setPaused: async (paused) => {
      await options.persistPaused(paused);
      options.coordinator.setModulePaused(paused);
    }
  };
}

export function createEffectQueueOwner(options: {
  readonly queue: EffectQueue;
  readonly coordinator: EffectOwnerCoordinator;
  readonly replayRecent: (occurrenceId: string) => Promise<EffectAdmissionOutcome>;
  readonly persistPaused: (paused: boolean) => Promise<void>;
}): QueueOwner {
  return {
    moduleId: "screen-effects",
    snapshot: () => toEffectOwnerSnapshot(options.queue.snapshot()),
    skip: (occurrenceId) => options.coordinator.skip(occurrenceId),
    remove: async (occurrenceId) => options.queue.remove(occurrenceId),
    replay: async (occurrenceId) => {
      const outcome = await options.replayRecent(occurrenceId);
      if (outcome.status !== "queued") return false;
      await options.coordinator.startNext();
      return true;
    },
    clearPending: async () => options.queue.clearPending(),
    setPaused: async (paused) => {
      await options.persistPaused(paused);
      options.queue.setModulePaused(paused);
      if (!paused) await options.coordinator.startNext();
    }
  };
}

export function toAlertOwnerSnapshot(
  snapshot: PlaybackQueueSnapshot,
  paused: boolean
): OwnerOperationsSnapshot {
  const mapRow = (
    item: NonNullable<PlaybackQueueSnapshot["current"]>,
    moduleQueuePosition: number | null
  ): OperationRow => ({
    moduleId: "alerts",
    occurrenceId: item.id,
    name: humanize(item.sourceEvent.type),
    summary: bounded(item.sourceEvent.actor.displayName || "Anonymous viewer", 256),
    status: item.status,
    enqueuedAtMs: Date.parse(item.enqueuedAt),
    completedAtMs: item.completedAt === null ? null : Date.parse(item.completedAt),
    sequence: item.sequence,
    moduleQueuePosition
  });
  return ownerOperationsSnapshotSchema.parse({
    moduleId: "alerts",
    paused,
    current: snapshot.current === null ? null : mapRow(snapshot.current, null),
    queued: snapshot.queued.map((item, index) => mapRow(item, index + 1)),
    recent: snapshot.recent.map((item) => mapRow(item, null))
  });
}

export function toEffectOwnerSnapshot(snapshot: EffectQueueSnapshot): OwnerOperationsSnapshot {
  const mapRow = (
    item: NonNullable<EffectQueueSnapshot["current"]>,
    moduleQueuePosition: number | null
  ): OperationRow => ({
    moduleId: "screen-effects",
    occurrenceId: item.id,
    name: item.content.effectName,
    summary: bounded(item.trigger?.summary ?? "Manual test", 256),
    status: item.status,
    enqueuedAtMs: item.enqueuedAtMs,
    completedAtMs: item.completedAtMs,
    sequence: item.sequence,
    moduleQueuePosition
  });
  return ownerOperationsSnapshotSchema.parse({
    moduleId: "screen-effects",
    paused: snapshot.modulePaused,
    current: snapshot.current === null ? null : mapRow(snapshot.current, null),
    queued: snapshot.queued.map((item, index) => mapRow(item, index + 1)),
    recent: snapshot.recent.map((item) => mapRow(item, null))
  });
}

function humanize(value: string): string {
  return bounded(value.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" "), 120);
}

function bounded(value: string, limit: number): string {
  return value.slice(0, limit);
}
