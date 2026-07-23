import { z } from "zod";
import { normalizedStreamEventSchema } from "../events/schemas.js";
import { overlayInstructionSchema } from "../overlays/schemas.js";
import { isoDateTimeSchema, nonEmptyStringSchema } from "../shared/schemas.js";

export const resolvedAlertSchema = z.object({
  id: nonEmptyStringSchema,
  sourceEventId: nonEmptyStringSchema,
  ruleId: nonEmptyStringSchema,
  variantId: nonEmptyStringSchema,
  overlayInstruction: overlayInstructionSchema
});

export const playbackQueueItemSchema = z.object({
  id: nonEmptyStringSchema,
  sourceEvent: normalizedStreamEventSchema,
  alerts: z.array(resolvedAlertSchema),
  priority: z.number().int(),
  status: z.enum(["queued", "playing", "completed", "skipped"]),
  enqueuedAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable()
});

export const playbackSafetyStateSchema = z.object({
  paused: z.boolean(),
  muted: z.boolean(),
  doNotDisturb: z.boolean()
});

export const playbackQueueSnapshotSchema = z.object({
  current: playbackQueueItemSchema.nullable(),
  queued: z.array(playbackQueueItemSchema),
  recent: z.array(playbackQueueItemSchema),
  ...playbackSafetyStateSchema.shape
});
