import type { AlertEditorDocument } from "../management/contracts.js";
import type { ResolvedAlertAudio } from "./types.js";
import { resolveMediaAudioSources, type MediaAudioCandidate } from "./media-audio.js";

// Callers decide whether a document is eligible for live playback or a draft test.
// Visual profiles and Browser Source connectivity do not affect device audio.
export function resolveAlertAudio(
  document: AlertEditorDocument,
  visualAssetMediaTypes: Readonly<Record<string, "image" | "gif" | "video">> = {},
  assetDurations: Readonly<Record<string, number | null>> = {},
  objectDurationMs = document.durationMs
): ResolvedAlertAudio | null {
  const candidates = [...document.layers]
    .sort((left, right) => left.order - right.order)
    .flatMap((layer): MediaAudioCandidate[] => {
      if (layer.type === "audio") return [{
        layerId: layer.id, assetId: layer.assetId, volume: layer.volume, enabled: layer.visible, sourceKind: "audio",
        fadeInMs: layer.fadeInMs ?? 0, fadeOutMs: layer.fadeOutMs ?? 0,
        playbackDurationMs: Math.min(assetDurations[layer.assetId] ?? objectDurationMs, objectDurationMs)
      }];
      if (layer.type === "video") {
        const mediaType = visualAssetMediaTypes[layer.assetId];
        return [{
          layerId: layer.id,
          assetId: layer.assetId,
          volume: layer.audioVolume,
          enabled: layer.visible && layer.playEmbeddedAudio && (mediaType === undefined || mediaType === "video"),
          sourceKind: "video-soundtrack"
          ,fadeInMs: layer.audioFadeInMs ?? 0
          ,fadeOutMs: layer.audioFadeOutMs ?? 0
          ,playbackDurationMs: Math.min(assetDurations[layer.assetId] ?? objectDurationMs, objectDurationMs)
        }];
      }
      return [];
    });
  const layers = resolveMediaAudioSources(candidates);
  if (layers.length === 0) return null;
  return {
    documentId: document.id,
    durationMs: objectDurationMs,
    outputs: structuredClone(document.outputs),
    layers
  };
}
