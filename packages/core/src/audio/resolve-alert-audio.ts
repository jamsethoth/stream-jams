import type { AlertEditorDocument } from "../management/contracts.js";
import type { ResolvedAlertAudio } from "./types.js";
import { resolveMediaAudioSources, type MediaAudioCandidate } from "./media-audio.js";

// Callers decide whether a document is eligible for live playback or a draft test.
// Visual profiles and Browser Source connectivity do not affect device audio.
export function resolveAlertAudio(
  document: AlertEditorDocument,
  visualAssetMediaTypes: Readonly<Record<string, "image" | "gif" | "video">> = {}
): ResolvedAlertAudio | null {
  const candidates = [...document.layers]
    .sort((left, right) => left.order - right.order)
    .flatMap((layer): MediaAudioCandidate[] => {
      if (layer.type === "audio") return [{ layerId: layer.id, assetId: layer.assetId, volume: layer.volume, enabled: layer.visible, sourceKind: "audio" }];
      if (layer.type === "video") {
        const mediaType = visualAssetMediaTypes[layer.assetId];
        return [{
          layerId: layer.id,
          assetId: layer.assetId,
          volume: layer.audioVolume,
          enabled: layer.visible && layer.playEmbeddedAudio && (mediaType === undefined || mediaType === "video"),
          sourceKind: "video-soundtrack"
        }];
      }
      return [];
    });
  const layers = resolveMediaAudioSources(candidates);
  if (layers.length === 0) return null;
  return {
    documentId: document.id,
    durationMs: document.durationMs,
    outputs: structuredClone(document.outputs),
    layers
  };
}
