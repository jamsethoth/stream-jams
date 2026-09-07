import type { AlertEditorDocument } from "../management/contracts.js";
import type { ResolvedAlertAudio } from "./types.js";

// Callers decide whether a document is eligible for live playback or a draft test.
// Visual profiles and Browser Source connectivity do not affect device audio.
export function resolveAlertAudio(document: AlertEditorDocument): ResolvedAlertAudio | null {
  const layers = [...document.layers]
    .sort((left, right) => left.order - right.order)
    .flatMap(layer => layer.type === "audio" && layer.visible
      ? [{ layerId: layer.id, assetId: layer.assetId, volume: layer.volume }]
      : []);
  if (layers.length === 0) return null;
  return {
    documentId: document.id,
    durationMs: document.durationMs,
    outputs: structuredClone(document.outputs),
    layers
  };
}
