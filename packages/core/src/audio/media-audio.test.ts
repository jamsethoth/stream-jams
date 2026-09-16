import { expect, it } from "vitest";
import { resolveMediaAudioSources } from "./media-audio.js";

const source = { layerId: "video", assetId: "clip", volume: 0.4, enabled: true, sourceKind: "video-soundtrack" as const };

it("keeps enabled audio and soundtrack layers independent even when they share bytes", () => {
  expect(resolveMediaAudioSources([
    source,
    { ...source, layerId: "second-video", volume: 0.7 },
    { layerId: "sound", assetId: "clip", volume: 0, enabled: true, sourceKind: "audio" },
    { ...source, layerId: "off", enabled: false }
  ])).toEqual([
    { layerId: "video", assetId: "clip", volume: 0.4, sourceKind: "video-soundtrack" },
    { layerId: "second-video", assetId: "clip", volume: 0.7, sourceKind: "video-soundtrack" },
    { layerId: "sound", assetId: "clip", volume: 0, sourceKind: "audio" }
  ]);
});

it("does not disable a soundtrack when a separate sound is added", () => {
  expect(resolveMediaAudioSources([source, { ...source, layerId: "sound", sourceKind: "audio" }])).toHaveLength(2);
});

it("rejects repeated logical layer identities, including a disabled duplicate", () => {
  expect(() => resolveMediaAudioSources([source, { ...source, assetId: "other" }])).toThrow();
  expect(() => resolveMediaAudioSources([source, { ...source, enabled: false }])).toThrow();
});

it.each([
  { volume: -0.01 }, { volume: 1.01 }, { volume: Number.NaN }, { volume: Number.POSITIVE_INFINITY },
  { layerId: "" }, { layerId: " video " }, { assetId: "" }, { enabled: "yes" }, { sourceKind: "tts" }, { url: "https://example.com/sound" }
])("rejects invalid source fields without converting them to a playable default: %j", patch => {
  const candidate = { ...source, ...patch } as Parameters<typeof resolveMediaAudioSources>[0][number];
  expect(() => resolveMediaAudioSources([candidate])).toThrow();
});

it("returns independent values and leaves input untouched", () => {
  const candidate = Object.freeze({ ...source });
  expect(resolveMediaAudioSources([candidate])[0]).not.toBe(candidate);
  expect(candidate).toEqual(source);
  expect(resolveMediaAudioSources([])).toEqual([]);
  expect(resolveMediaAudioSources([{ ...source, enabled: false }])).toEqual([]);
});
