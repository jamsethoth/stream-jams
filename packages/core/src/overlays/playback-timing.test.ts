import { expect, it } from "vitest";
import { playbackOffsetMs, playbackTimingSchema } from "./playback-timing.js";

it("waits for future starts, seeks late attachments and never extends expired playback", () => {
  const timing = { startsAtEpochMs: 1000, endsAtEpochMs: 11000 };
  expect(playbackOffsetMs(timing, 500)).toBe(0);
  expect(playbackOffsetMs(timing, 4000)).toBe(3000);
  expect(playbackOffsetMs(timing, 11000)).toBeNull();
  expect(playbackOffsetMs(timing, 12000)).toBeNull();
});

it.each([
  { startsAtEpochMs: 1, endsAtEpochMs: 1 },
  { startsAtEpochMs: 2, endsAtEpochMs: 1 },
  { startsAtEpochMs: 0, endsAtEpochMs: 120001 },
  { startsAtEpochMs: 0.5, endsAtEpochMs: 1000 },
  { startsAtEpochMs: Infinity, endsAtEpochMs: Infinity },
  { startsAtEpochMs: 0, endsAtEpochMs: Number.MAX_SAFE_INTEGER + 1 }
])("rejects invalid occurrence timing %j", timing => {
  expect(playbackTimingSchema.safeParse(timing).success).toBe(false);
  expect(() => playbackOffsetMs(timing, 0)).toThrow();
});

it("accepts the maximum duration and rejects invalid clocks and extra timing fields", () => {
  expect(playbackOffsetMs({ startsAtEpochMs: 0, endsAtEpochMs: 120000 }, 119999)).toBe(119999);
  expect(() => playbackOffsetMs({ startsAtEpochMs: 0, endsAtEpochMs: 1000 }, NaN)).toThrow();
  expect(playbackTimingSchema.safeParse({ startsAtEpochMs: 0, endsAtEpochMs: 1000, loop: true }).success).toBe(false);
});
