import { expect, it } from "vitest";
import { alertEditorDocumentSchema } from "../management/contracts.js";
import { resolveAlertAudio } from "./resolve-alert-audio.js";

const animation = { mode: "preset", entrance: "none", exit: "none", durationMs: 0, delayMs: 0, easing: "linear" };
function document() {
  return alertEditorDocumentSchema.parse({
    schemaVersion: 1, id: "alert", setId: "set", providerKind: "twitch", eventType: "follow", kind: "default", parentAlertId: null,
    name: "Follow", enabled: true, conditions: [], durationMs: 5000,
    layers: [
      { id: "video", name: "Video", type: "video", assetId: "clip", visible: true, order: 2, animation, playEmbeddedAudio: true, audioVolume: 0.4 },
      { id: "sound", name: "Sound", type: "audio", assetId: "tone", visible: true, order: 1, animation, volume: 0.8 },
      { id: "another-video", name: "Another video", type: "video", assetId: "clip", visible: true, order: 3, animation, playEmbeddedAudio: true, audioVolume: 0 }
    ],
    targetProfiles: ["landscape", "vertical"].map(id => ({ id, enabled: false, reviewState: "needs-review", layerLayouts: [] })),
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: {} }]
  });
}

it("resolves independent ordered sounds and enabled video soundtracks without expanding profiles", () => {
  const input = document();
  expect(resolveAlertAudio(input)).toEqual({ documentId: "alert", durationMs: 5000, outputs: input.outputs, layers: [
    { layerId: "sound", assetId: "tone", volume: 0.8, sourceKind: "audio" },
    { layerId: "video", assetId: "clip", volume: 0.4, sourceKind: "video-soundtrack" },
    { layerId: "another-video", assetId: "clip", volume: 0, sourceKind: "video-soundtrack" }
  ] });
});

it.each([
  { browserSource: true, deviceRouteIds: [] },
  { browserSource: false, deviceRouteIds: ["private"] },
  { browserSource: true, deviceRouteIds: ["private", "stream"] },
  { browserSource: false, deviceRouteIds: [] }
])("retains explicit item destinations %j", outputs => {
  const input = { ...document(), outputs };
  const result = resolveAlertAudio(input);
  expect(result?.outputs).toEqual(outputs);
  expect(result?.outputs).not.toBe(outputs);
  expect(result?.layers).toHaveLength(3);
});

it("omits hidden sounds and disabled soundtracks without affecting other layers", () => {
  const input = document();
  input.layers = input.layers.map(layer => layer.type === "video" ? { ...layer, playEmbeddedAudio: false } : { ...layer, visible: false });
  expect(resolveAlertAudio(input)).toBeNull();
});

it("never resolves a hidden video soundtrack", () => {
  const input = document();
  input.layers = input.layers.map(layer => ({ ...layer, visible: false }));
  expect(resolveAlertAudio(input)).toBeNull();
});
