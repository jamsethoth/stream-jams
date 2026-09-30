import { expect, it } from "vitest";
import { playbackTimingDiagnosticsSchema } from "./playback-timing-diagnostics.js";
it("accepts observed timing and rejects unbounded or identifying fields", () => {
  expect(playbackTimingDiagnosticsSchema.parse({ preparationDurationMs: 40, scheduledStartEpochMs: 100, actualStartEpochMs: 110, terminalOutcome: "completed", completionReason: "natural-end" })).toMatchObject({ actualStartEpochMs: 110 });
  for (const invalid of [{ preparationDurationMs: 300001 }, { actualStartEpochMs: -1 }, { actualStartEpochMs: Infinity }, { deviceName: "private" }]) {
    expect(playbackTimingDiagnosticsSchema.safeParse({ terminalOutcome: "failed", ...invalid }).success).toBe(false);
  }
  expect(playbackTimingDiagnosticsSchema.parse({ terminalOutcome: "failed" })).not.toHaveProperty("actualStartEpochMs");
});
