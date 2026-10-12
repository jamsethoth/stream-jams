import { classifyRetiredOverlayOutput } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { RetiredOutputAttemptTracker } from "./retired-output-attempts.js";

describe("RetiredOutputAttemptTracker", () => {
  it("keeps one bounded row per retired kind with the latest time and a count", () => {
    let now = new Date("2026-10-11T12:00:00.000Z");
    const tracker = new RetiredOutputAttemptTracker(() => now);
    expect(tracker.list()).toEqual([]);
    tracker.record("unified");
    now = new Date("2026-10-11T12:05:00.000Z");
    tracker.record("unified");
    tracker.record("module-test");
    expect(tracker.list()).toEqual([
      { kind: "module-test", lastSeenAt: "2026-10-11T12:05:00.000Z", count: 1 },
      { kind: "unified", lastSeenAt: "2026-10-11T12:05:00.000Z", count: 2 }
    ]);
    for (let index = 0; index < 1_000; index += 1) tracker.record("module-test");
    expect(tracker.list()).toHaveLength(2);
  });

  it("classifies only retired test and unified outputs", () => {
    expect(classifyRetiredOverlayOutput({ scope: "unified", purpose: "live" })).toBe("unified");
    expect(classifyRetiredOverlayOutput({ scope: "unified", purpose: "test" })).toBe("unified");
    expect(classifyRetiredOverlayOutput({ scope: "module", purpose: "test" })).toBe("module-test");
    expect(classifyRetiredOverlayOutput({ scope: "module", purpose: "live" })).toBeNull();
    expect(classifyRetiredOverlayOutput({ scope: "module", purpose: null })).toBeNull();
  });
});
