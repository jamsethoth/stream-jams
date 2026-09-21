import { describe, expect, it } from "vitest";
import {
  collectAlertDurationAssetIds,
  collectEffectDurationAssetIds,
  resolveAlertLayerDurationMs,
  resolveMediaDuration
} from "./media-duration.js";

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

describe("resolveAlertLayerDurationMs", () => {
  const fade = { mode: "preset" as const, entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" };

  it("keeps matched media visible before running a visual layer exit animation", () => {
    const document = { durationMode: "media" as const, durationMs: 3_971 };
    const image = { id: "image", name: "Image", visible: true, order: 0, animation: fade, type: "image" as const, assetId: "image" };
    const audio = { id: "audio", name: "Audio", visible: true, order: 1, animation: fade, type: "audio" as const, assetId: "audio", volume: 1 };

    expect(resolveAlertLayerDurationMs(document, image)).toBe(4_271);
    expect(resolveAlertLayerDurationMs(document, audio)).toBe(3_971);
  });

  it("keeps custom duration inclusive of exit animations", () => {
    const document = { durationMode: "custom" as const, durationMs: 3_971 };
    const image = { id: "image", name: "Image", visible: true, order: 0, animation: fade, type: "image" as const, assetId: "image" };

    expect(resolveAlertLayerDurationMs(document, image)).toBe(3_971);
  });
});
