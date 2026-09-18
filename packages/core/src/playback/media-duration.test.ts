import { describe, expect, it } from "vitest";
import { collectAlertDurationAssetIds, collectEffectDurationAssetIds, resolveMediaDuration } from "./media-duration.js";

describe("resolveMediaDuration", () => {
  const candidate = (assetId: string, durationMs: number | null, eligible = true) => ({
    assetId, label: assetId, mediaType: "video" as const, durationMs, eligible
  });

  it("uses custom duration without media contributors", () => {
    expect(resolveMediaDuration({ mode: "custom", customDurationMs: 4_000, fallbackDurationMs: 5_000, maximumDurationMs: 120_000, candidates: [candidate("long", 8_000)] }))
      .toEqual({ durationMs: 4_000, contributingAssetIds: [], warning: null });
  });

  it("uses every tied longest eligible timed asset in authoring order", () => {
    expect(resolveMediaDuration({ mode: "media", customDurationMs: 4_000, fallbackDurationMs: 5_000, maximumDurationMs: 120_000, candidates: [candidate("short", 2_000), candidate("a", 8_000), candidate("hidden", 20_000, false), candidate("b", 8_000)] }))
      .toEqual({ durationMs: 8_000, contributingAssetIds: ["a", "b"], warning: null });
  });

  it("falls back without positive eligible metadata and truncates long media", () => {
    expect(resolveMediaDuration({ mode: "media", customDurationMs: 1_000, fallbackDurationMs: 5_000, maximumDurationMs: 120_000, candidates: [candidate("unknown", null)] }).warning).toBe("fallback");
    expect(resolveMediaDuration({ mode: "media", customDurationMs: 1_000, fallbackDurationMs: 5_000, maximumDurationMs: 120_000, candidates: [candidate("long", 150_000)] }))
      .toEqual({ durationMs: 120_000, contributingAssetIds: ["long"], warning: "truncated" });
  });
});

describe("duration asset collectors", () => {
  it("collects unique visible Alert audio/video IDs", () => {
    expect(collectAlertDurationAssetIds({ layers: [
      { id: "1", name: "one", visible: true, order: 0, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" }, type: "audio", assetId: "audio", volume: 1 },
      { id: "2", name: "two", visible: false, order: 1, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" }, type: "video", assetId: "hidden", playEmbeddedAudio: false, audioVolume: 1 },
      { id: "3", name: "three", visible: true, order: 2, animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" }, type: "video", assetId: "audio", playEmbeddedAudio: false, audioVolume: 1 }
    ] })).toEqual(["audio"]);
  });

  it("collects a variant video and separate sound", () => {
    expect(collectEffectDurationAssetIds({
      visual: { mediaType: "video", assetId: "video", layout: { x: 0, y: 0, width: 1, height: 1, zIndex: 0 }, playEmbeddedAudio: false, audioVolume: 1 },
      sound: { assetId: "sound", volume: 1 }
    })).toEqual(["video", "sound"]);
  });
});
