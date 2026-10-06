import type { MediaDurationCandidate } from "@stream-jams/core";

export function projectMediaDurationCandidates(
  assetIds: readonly string[],
  records: ReadonlyMap<string, { readonly originalFileName: string; readonly mediaType: MediaDurationCandidate["mediaType"]; readonly durationMs: number | null }>
): readonly MediaDurationCandidate[] {
  return assetIds.flatMap(assetId => {
    const record = records.get(assetId);
    return record === undefined ? [] : [{ assetId, label: record.originalFileName, mediaType: record.mediaType, durationMs: record.durationMs, eligible: true }];
  });
}
