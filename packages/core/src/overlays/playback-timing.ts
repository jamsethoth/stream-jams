import { z } from "zod";

const epochSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const playbackTimingSchema = z.object({
  startsAtEpochMs: epochSchema,
  endsAtEpochMs: epochSchema
}).strict().refine(timing => timing.endsAtEpochMs > timing.startsAtEpochMs &&
  timing.endsAtEpochMs - timing.startsAtEpochMs <= 120_000, "Occurrence duration must be between 1 and 120000 ms");

export type PlaybackTiming = z.infer<typeof playbackTimingSchema>;

/** Zero before start is an offset, not permission to start early. */
export function playbackOffsetMs(candidate: PlaybackTiming, nowEpochMs: number): number | null {
  const timing = playbackTimingSchema.parse(candidate);
  const now = epochSchema.parse(nowEpochMs);
  return now >= timing.endsAtEpochMs ? null : Math.max(0, now - timing.startsAtEpochMs);
}
