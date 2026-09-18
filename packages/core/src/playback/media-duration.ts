import type { AlertEditorDocument } from "../management/contracts.js";
import type { EffectVariant } from "../screen-effects/types.js";

export type PlaybackDurationMode = "media" | "custom";

export interface MediaDurationCandidate {
  readonly assetId: string;
  readonly label: string;
  readonly mediaType: "image" | "gif" | "video" | "audio";
  readonly durationMs: number | null;
  readonly eligible: boolean;
}

export interface MediaDurationResolution {
  readonly durationMs: number;
  readonly contributingAssetIds: readonly string[];
  readonly warning: "fallback" | "truncated" | null;
}

export function resolveMediaDuration(input: {
  readonly mode: PlaybackDurationMode;
  readonly customDurationMs: number;
  readonly fallbackDurationMs: number;
  readonly maximumDurationMs: number;
  readonly candidates: readonly MediaDurationCandidate[];
}): MediaDurationResolution {
  if (input.mode === "custom") {
    return {
      durationMs: Math.min(input.customDurationMs, input.maximumDurationMs),
      contributingAssetIds: [],
      warning: input.customDurationMs > input.maximumDurationMs ? "truncated" : null
    };
  }
  const eligible = input.candidates.filter((candidate) =>
    candidate.eligible
    && (candidate.mediaType === "audio" || candidate.mediaType === "video")
    && candidate.durationMs !== null
    && candidate.durationMs > 0
  );
  const longest = Math.max(0, ...eligible.map((candidate) => candidate.durationMs ?? 0));
  if (longest === 0) {
    return { durationMs: input.fallbackDurationMs, contributingAssetIds: [], warning: "fallback" };
  }
  return {
    durationMs: Math.min(longest, input.maximumDurationMs),
    contributingAssetIds: eligible
      .filter((candidate) => candidate.durationMs === longest)
      .map((candidate) => candidate.assetId),
    warning: longest > input.maximumDurationMs ? "truncated" : null
  };
}

export function collectAlertDurationAssetIds(document: Pick<AlertEditorDocument, "layers">): readonly string[] {
  return unique(document.layers.flatMap((layer) =>
    layer.visible && (layer.type === "audio" || layer.type === "video") ? [layer.assetId] : []
  ));
}

export function collectEffectDurationAssetIds(variant: Pick<EffectVariant, "visual" | "sound">): readonly string[] {
  return unique([
    ...(variant.visual?.mediaType === "video" ? [variant.visual.assetId] : []),
    ...(variant.sound === null ? [] : [variant.sound.assetId])
  ]);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
