import { createHash } from "node:crypto";
import { defaultAssetValidationPolicy, desktopVisualAssetSchema, desktopVisualBatchSchema, maxDesktopVisualTransferBytes, visualMediaType, type AssetRepository, type DesktopVisualBatch } from "@stream-jams/core";
export interface DesktopVisualAssetResolverDependencies {
  readonly assetRepository: Pick<AssetRepository, "findManyByIds">;
  readonly assetStore: { readBounded(storagePath: string, maxBytes: number): Promise<Uint8Array> };
}

export class DesktopVisualAssetResolver {
  constructor(private readonly dependencies: DesktopVisualAssetResolverDependencies) {}
  async resolve(candidate: Omit<DesktopVisualBatch, "assets">): Promise<DesktopVisualBatch> {
    // Reuse the existing field schemas before reads, without placeholder media.
    if (candidate === null || typeof candidate !== "object" || Object.keys(candidate).some(key => !["key", "timing", "instructions"].includes(key))) throw unavailable();
    const input = {
      key: desktopVisualBatchSchema.shape.key.parse(candidate.key),
      timing: desktopVisualBatchSchema.shape.timing.parse(candidate.timing),
      instructions: desktopVisualBatchSchema.shape.instructions.parse(candidate.instructions)
    };
    const instructionIds = new Set<string>();
    const referenced = new Map<string, "image" | "gif" | "video">();
    for (const instruction of input.instructions) {
      if (instructionIds.has(instruction.id) || instruction.moduleId !== input.key.moduleId ||
        instruction.durationMs !== input.timing.endsAtEpochMs - input.timing.startsAtEpochMs) throw unavailable();
      instructionIds.add(instruction.id);
      if (instruction.visual === null) continue;
      const { assetId, mediaType } = instruction.visual;
      if (referenced.has(assetId) && referenced.get(assetId) !== mediaType) throw unavailable();
      referenced.set(assetId, mediaType);
    }
    if (referenced.size === 0) return desktopVisualBatchSchema.parse({ ...input, assets: [] });
    const records = await this.dependencies.assetRepository.findManyByIds([...referenced.keys()]);
    let totalBytes = 0;
    const reads = [];
    for (const [assetId, mediaType] of referenced) {
      const record = records.get(assetId);
      if (record === undefined || record.id !== assetId || record.mediaType !== mediaType) throw unavailable();
      const mime = desktopVisualAssetSchema.shape.mimeType.safeParse(record.mimeType);
      if (!mime.success || visualMediaType(mime.data) !== mediaType || !Number.isSafeInteger(record.sizeBytes) ||
        record.sizeBytes <= 0 || record.sizeBytes > defaultAssetValidationPolicy[mediaType].maxSizeBytes ||
        !/^(?:sha256:)?[a-f0-9]{64}$/i.test(record.checksum)) throw unavailable();
      totalBytes += record.sizeBytes;
      if (totalBytes > maxDesktopVisualTransferBytes) throw unavailable();
      reads.push({ ...record, checksum: record.checksum.replace(/^sha256:/i, "").toLowerCase(), mimeType: mime.data });
    }
    const assets: DesktopVisualBatch["assets"] = [];
    // Sequential reads cap outstanding allocations to one bounded asset read.
    for (const record of reads) {
      const bytes = await this.dependencies.assetStore.readBounded(record.storagePath, record.sizeBytes);
      if (bytes.byteLength !== record.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== record.checksum.toLowerCase()) throw unavailable();
      assets.push({ assetId: record.id, mimeType: record.mimeType, bytes: new Uint8Array(bytes) });
    }
    return desktopVisualBatchSchema.parse({ ...input, assets });
  }
}
function unavailable(): Error { return new Error("Desktop visual asset is unavailable or invalid"); }
