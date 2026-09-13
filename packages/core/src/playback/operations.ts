import { z } from "zod";
import { nonEmptyStringSchema } from "../shared/schemas.js";
import { playbackSafetyStateSchema } from "./schemas.js";
import type { PlaybackSafetyState } from "./types.js";

export const operationStatusSchema = z.enum([
  "queued",
  "playing",
  "completed",
  "skipped",
  "failed"
]);

export const operationRowSchema = z.object({
  moduleId: nonEmptyStringSchema.max(120),
  occurrenceId: nonEmptyStringSchema.max(256),
  name: nonEmptyStringSchema.max(120),
  summary: z.string().max(256),
  status: operationStatusSchema,
  enqueuedAtMs: z.number().int().nonnegative(),
  completedAtMs: z.number().int().nonnegative().nullable(),
  sequence: z.number().int().nonnegative(),
  moduleQueuePosition: z.number().int().positive().nullable()
}).strict();

export const ownerOperationsSnapshotSchema = z.object({
  moduleId: nonEmptyStringSchema.max(120),
  paused: z.boolean(),
  current: operationRowSchema.nullable(),
  queued: z.array(operationRowSchema),
  recent: z.array(operationRowSchema).max(25)
}).strict();

export const mergedOperationsSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  owners: z.array(z.object({
    moduleId: nonEmptyStringSchema.max(120),
    paused: z.boolean()
  }).strict()),
  current: z.array(operationRowSchema),
  queued: z.array(operationRowSchema),
  recent: z.array(operationRowSchema),
  ...playbackSafetyStateSchema.shape
}).strict();

export type OperationRow = z.infer<typeof operationRowSchema>;
export type OwnerOperationsSnapshot = z.infer<typeof ownerOperationsSnapshotSchema>;
export type MergedOperationsSnapshot = z.infer<typeof mergedOperationsSnapshotSchema>;

export interface QueueOwner {
  readonly moduleId: string;
  snapshot(): OwnerOperationsSnapshot;
  skip(occurrenceId: string): Promise<boolean>;
  remove(occurrenceId: string): Promise<boolean>;
  replay(occurrenceId: string): Promise<boolean>;
  clearPending(): Promise<number>;
  setPaused(paused: boolean): Promise<void>;
}

export function mergeOperations(
  owners: readonly OwnerOperationsSnapshot[],
  safety: PlaybackSafetyState,
  revision: number
): MergedOperationsSnapshot {
  const parsedOwners = owners.map((owner) => ownerOperationsSnapshotSchema.parse(owner));
  const stableOwners = [...parsedOwners].sort(compareModule);
  const current = stableOwners
    .flatMap((owner) => owner.current === null ? [] : [owner.current])
    .sort(compareModuleRow);
  const queued = stableOwners
    .flatMap((owner) => owner.queued)
    .sort(compareQueuedRows);
  const recent = stableOwners
    .flatMap((owner) => owner.recent)
    .sort(compareRecentRows);
  return mergedOperationsSnapshotSchema.parse({
    revision,
    owners: stableOwners.map(({ moduleId, paused }) => ({ moduleId, paused })),
    current,
    queued,
    recent,
    ...playbackSafetyStateSchema.parse(safety)
  });
}

function compareModule(left: OwnerOperationsSnapshot, right: OwnerOperationsSnapshot): number {
  return compareText(left.moduleId, right.moduleId);
}

function compareModuleRow(left: OperationRow, right: OperationRow): number {
  return compareText(left.moduleId, right.moduleId) || compareText(left.occurrenceId, right.occurrenceId);
}

function compareQueuedRows(left: OperationRow, right: OperationRow): number {
  return left.enqueuedAtMs - right.enqueuedAtMs
    || compareText(left.moduleId, right.moduleId)
    || left.sequence - right.sequence
    || compareText(left.occurrenceId, right.occurrenceId);
}

function compareRecentRows(left: OperationRow, right: OperationRow): number {
  return (right.completedAtMs ?? -1) - (left.completedAtMs ?? -1)
    || compareText(left.moduleId, right.moduleId)
    || left.sequence - right.sequence
    || compareText(left.occurrenceId, right.occurrenceId);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
