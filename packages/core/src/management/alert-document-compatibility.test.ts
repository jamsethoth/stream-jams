import { expect, it } from "vitest";
import { alertEditorDocumentSchema } from "./contracts.js";
import { createVideoAudioSettings, parseStoredAlertEditorDocument, readLegacyVideoAudioSettings } from "./alert-document-compatibility.js";

const video = { id: "video", name: "Video", type: "video", assetId: "asset", visible: true, order: 0,
  animation: { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" } };
const legacy = { id: "alert", setId: "set", providerKind: "twitch", eventType: "follow", kind: "default", parentAlertId: null,
  name: "Follow", enabled: false, conditions: [], durationMs: 5000, layers: [video],
  outputs: { browserSource: false, deviceRouteIds: ["private"] },
  targetProfiles: ["landscape", "vertical"].map(id => ({ id, enabled: true, reviewState: "ready", layerLayouts: [] })),
  samplePayloads: [{ id: "sample", label: "Sample", kind: "built-in", payload: {} }] };

it("keeps legacy videos silent while explicitly new video settings enable audio", () => {
  expect(readLegacyVideoAudioSettings({})).toEqual({ playEmbeddedAudio: false, audioVolume: 1 });
  expect(createVideoAudioSettings()).toEqual({ playEmbeddedAudio: true, audioVolume: 1 });
  const parsed = parseStoredAlertEditorDocument(legacy);
  expect(parsed).toMatchObject({ schemaVersion: 1, outputs: legacy.outputs, layers: [{ ...video, playEmbeddedAudio: false, audioVolume: 1 }] });
  expect(parseStoredAlertEditorDocument(parsed)).toEqual(parsed);
  expect(legacy.layers[0]).not.toHaveProperty("playEmbeddedAudio");
});

it("preserves explicit legacy and current settings", () => {
  const configured = { ...legacy, layers: [{ ...video, playEmbeddedAudio: true, audioVolume: 0.25 }] };
  expect(parseStoredAlertEditorDocument(configured).layers[0]).toMatchObject({ playEmbeddedAudio: true, audioVolume: 0.25 });
  expect(parseStoredAlertEditorDocument({ ...configured, schemaVersion: 1 }).layers[0]).toMatchObject({ playEmbeddedAudio: true, audioVolume: 0.25 });
});

it.each([{ playEmbeddedAudio: "yes" }, { audioVolume: -1 }, { audioVolume: 1.1 }, { audioVolume: Infinity }, { audioVolume: NaN }, { audioVolume: null }])("rejects invalid settings %j", settings => {
  expect(() => readLegacyVideoAudioSettings(settings)).toThrow();
  expect(() => parseStoredAlertEditorDocument({ ...legacy, layers: [{ ...video, ...settings }] })).toThrow();
});

it("requires current fields on HTTP documents and rejects future or malformed stored documents", () => {
  expect(alertEditorDocumentSchema.safeParse(legacy).success).toBe(false);
  expect(() => parseStoredAlertEditorDocument({ ...legacy, schemaVersion: 1 })).toThrow();
  expect(() => parseStoredAlertEditorDocument({ ...legacy, schemaVersion: 2 })).toThrow();
  expect(() => parseStoredAlertEditorDocument({ ...legacy, layers: [{ type: "video" }] })).toThrow();
  expect(() => parseStoredAlertEditorDocument({ ...legacy, targetProfiles: [] })).toThrow();
});
