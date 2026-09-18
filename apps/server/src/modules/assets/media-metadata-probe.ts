import { parseBuffer } from "music-metadata";
import type { MediaMetadataProbe, MediaMetadataProbeInput } from "@stream-jams/core";

export class MusicMetadataProbe implements MediaMetadataProbe {
  async inspect(input: MediaMetadataProbeInput): Promise<{ readonly durationMs: number | null }> {
    const metadata = await parseBuffer(input.bytes, {
      mimeType: input.mimeType,
      size: input.sizeBytes
    }, { duration: true, skipCovers: true });
    const seconds = metadata.format.duration;
    const durationMs = seconds === undefined ? null : Math.round(seconds * 1000);
    return { durationMs: durationMs !== null && Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null };
  }
}
