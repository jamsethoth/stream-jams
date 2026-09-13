import { expect, it } from "vitest";
import { playbackTimingSchema } from "./playback-timing.js";

it.each([
  { startsAtEpochMs: 1, endsAtEpochMs: 1 },
  { startsAtEpochMs: 2, endsAtEpochMs: 1 },
  { startsAtEpochMs: 0, endsAtEpochMs: 120001 },
  { startsAtEpochMs: 0.5, endsAtEpochMs: 1000 },
  { startsAtEpochMs: Infinity, endsAtEpochMs: Infinity },
  { startsAtEpochMs: 0, endsAtEpochMs: Number.MAX_SAFE_INTEGER + 1 }
])("rejects invalid occurrence timing %j", timing => {
  expect(playbackTimingSchema.safeParse(timing).success).toBe(false);
});

it("accepts the maximum duration and rejects extra timing fields", () => {
  expect(playbackTimingSchema.safeParse({ startsAtEpochMs: 0, endsAtEpochMs: 120000 }).success).toBe(true);
  expect(playbackTimingSchema.safeParse({ startsAtEpochMs: 0, endsAtEpochMs: 1000, loop: true }).success).toBe(false);
});
