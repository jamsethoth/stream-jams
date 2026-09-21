import { describe, expect, it } from "vitest";
import { resolveAudioEnvelope } from "./audio-envelope.js";

describe("resolveAudioEnvelope", () => {
  const gain = (elapsedMs: number, overrides: Partial<Parameters<typeof resolveAudioEnvelope>[0]> = {}) =>
    resolveAudioEnvelope({ volume: 0.8, elapsedMs, playbackDurationMs: 4_000, fadeInMs: 1_000, fadeOutMs: 1_000, muted: false, ...overrides });

  it("calculates linear gain from absolute elapsed time", () => {
    expect(gain(0)).toBe(0);
    expect(gain(500)).toBeCloseTo(0.4);
    expect(gain(2_000)).toBeCloseTo(0.8);
    expect(gain(3_500)).toBeCloseTo(0.4);
    expect(gain(4_000)).toBe(0);
  });

  it("returns zero while muted", () => expect(gain(2_000, { muted: true })).toBe(0));

  it("proportionally clamps overlapping fades", () => {
    expect(gain(1_000, { playbackDurationMs: 2_000, fadeInMs: 2_000, fadeOutMs: 2_000 })).toBeCloseTo(0.8);
    expect(gain(500, { playbackDurationMs: 2_000, fadeInMs: 2_000, fadeOutMs: 2_000 })).toBeCloseTo(0.4);
  });
});
