import { z } from "zod";

const epochSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const playbackTimingSchema = z.object({
  startsAtEpochMs: epochSchema,
  endsAtEpochMs: epochSchema
}).strict().refine(timing => timing.endsAtEpochMs > timing.startsAtEpochMs &&
  timing.endsAtEpochMs - timing.startsAtEpochMs <= 120_000, "Occurrence duration must be between 1 and 120000 ms");

export type PlaybackTiming = z.infer<typeof playbackTimingSchema>;
