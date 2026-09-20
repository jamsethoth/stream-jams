import { z } from "zod";
import { audioRouteIdSchema, mediaVolumeSchema } from "./schemas.js";
import type { ResolvedAudioLayer } from "./types.js";

export type MediaAudioKind = "audio" | "video-soundtrack";
export interface MediaAudioCandidate {
  readonly layerId: string;
  readonly assetId: string;
  readonly volume: number;
  readonly enabled: boolean;
  readonly sourceKind: MediaAudioKind;
  readonly fadeInMs?: number | undefined;
  readonly fadeOutMs?: number | undefined;
  readonly playbackDurationMs?: number | undefined;
}
export type ResolvedMediaAudioSource = ResolvedAudioLayer & { readonly sourceKind: MediaAudioKind };

const sourcesSchema = z.array(z.object({
  layerId: audioRouteIdSchema,
  assetId: audioRouteIdSchema,
  volume: mediaVolumeSchema,
  enabled: z.boolean(),
  sourceKind: z.enum(["audio", "video-soundtrack"]),
  fadeInMs: z.number().int().min(0).max(120_000).optional(),
  fadeOutMs: z.number().int().min(0).max(120_000).optional(),
  playbackDurationMs: z.number().int().min(1).max(120_000).optional()
}).strict()).refine(sources => new Set(sources.map(source => source.layerId)).size === sources.length,
  "Each logical audio layer must occur once");

/** Normalize before visual expansion. Shared bytes do not merge distinct layers. */
export function resolveMediaAudioSources(candidates: readonly MediaAudioCandidate[]): ResolvedMediaAudioSource[] {
  return sourcesSchema.parse(candidates).filter(source => source.enabled)
    .map(({ layerId, assetId, volume, sourceKind, fadeInMs, fadeOutMs, playbackDurationMs }) => ({
      layerId,
      assetId,
      volume,
      sourceKind,
      ...(fadeInMs === undefined ? {} : { fadeInMs }),
      ...(fadeOutMs === undefined ? {} : { fadeOutMs }),
      ...(playbackDurationMs === undefined ? {} : { playbackDurationMs })
    }));
}
