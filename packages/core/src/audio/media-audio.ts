import { z } from "zod";
import { audioRouteIdSchema } from "./schemas.js";
import type { ResolvedAudioLayer } from "./types.js";

export type MediaAudioKind = "audio" | "video-soundtrack";
export interface MediaAudioCandidate {
  readonly layerId: string;
  readonly assetId: string;
  readonly volume: number;
  readonly enabled: boolean;
  readonly sourceKind: MediaAudioKind;
}
export type ResolvedMediaAudioSource = ResolvedAudioLayer & { readonly sourceKind: MediaAudioKind };

const sourcesSchema = z.array(z.object({
  layerId: audioRouteIdSchema,
  assetId: audioRouteIdSchema,
  volume: z.number().finite().min(0).max(1),
  enabled: z.boolean(),
  sourceKind: z.enum(["audio", "video-soundtrack"])
}).strict()).refine(sources => new Set(sources.map(source => source.layerId)).size === sources.length,
  "Each logical audio layer must occur once");

/** Normalize before visual expansion. Shared bytes do not merge distinct layers. */
export function resolveMediaAudioSources(candidates: readonly MediaAudioCandidate[]): ResolvedMediaAudioSource[] {
  return sourcesSchema.parse(candidates).filter(source => source.enabled)
    .map(({ layerId, assetId, volume, sourceKind }) => ({ layerId, assetId, volume, sourceKind }));
}
