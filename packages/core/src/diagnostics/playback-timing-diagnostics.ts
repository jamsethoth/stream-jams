import { z } from "zod";

/** Renderer-observed milestones; absent onset means no onset was observed. */
export const playbackTimingMilestoneSchema = z.object({
  preparationDurationMs: z.number().finite().nonnegative().max(300_000).optional(),
  scheduledStartEpochMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  actualStartEpochMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional()
}).strict();
export type PlaybackTimingMilestone = z.infer<typeof playbackTimingMilestoneSchema>;

export const playbackTimingDiagnosticsSchema = playbackTimingMilestoneSchema.extend({
  terminalOutcome: z.enum(["completed", "failed", "stopped", "timed-out"]),
  completionReason: z.enum(["natural-end", "configured-duration", "stalled"]).optional()
}).strict();
export type PlaybackTimingDiagnostics = z.infer<typeof playbackTimingDiagnosticsSchema>;
