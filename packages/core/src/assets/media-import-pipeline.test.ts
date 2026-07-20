import type { AssetRepository } from "./repository.js";
import type { AssetRecord } from "./types.js";
import type { AssetStorageWrite, MediaAssetStore } from "./media-import-pipeline.js";
import { describe, expect, it, vi } from "vitest";
import {
  DefaultMediaImportPipeline,
  InvalidMediaImportError,
  NoopMediaTranscodingStage
} from "./media-import-pipeline.js";
import { DefaultAssetValidator } from "./asset-validator.js";

describe("DefaultMediaImportPipeline", () => {
  it("validates, stores, and persists accepted media imports", async () => {
    const repository = new RecordingAssetRepository();
    const store = new RecordingMediaAssetStore();
    const generateId = vi.fn(() => "asset_1");
    const pipeline = new DefaultMediaImportPipeline({
      validator: new DefaultAssetValidator(),
      repository,
      store,
      transcoder: new NoopMediaTranscodingStage(),
      generateId,
      calculateChecksum: () => "sha256:abc123"
    });
    const bytes = pngBytes;

    await expect(
      pipeline.importMedia({
        originalFileName: "Alert.PNG",
        mimeType: "image/png",
        bytes
      })
    ).resolves.toEqual({
      id: "asset_1",
      originalFileName: "Alert.PNG",
      mediaType: "image",
      mimeType: "image/png",
      sizeBytes: pngBytes.byteLength,
      checksum: "sha256:abc123",
      storagePath: "image/asset_1.png"
    });
    expect(store.writes).toEqual([
      {
        assetId: "asset_1",
        originalFileName: "Alert.PNG",
        mediaType: "image",
        normalizedExtension: ".png",
        bytes
      }
    ]);
    expect(repository.records).toHaveLength(1);
    expect(generateId).toHaveBeenCalledOnce();
  });

  it("uses a supplied asset ID without generating a replacement ID", async () => {
    const repository = new RecordingAssetRepository();
    const store = new RecordingMediaAssetStore();
    const generateId = vi.fn(() => "generated_asset");
    const pipeline = new DefaultMediaImportPipeline({
      validator: new DefaultAssetValidator(),
      repository,
      store,
      transcoder: new NoopMediaTranscodingStage(),
      generateId,
      calculateChecksum: () => "sha256:abc123"
    });

    await expect(
      pipeline.importMedia({
        assetId: "existing_asset",
        originalFileName: "Replacement.PNG",
        mimeType: "image/png",
        bytes: pngBytes
      })
    ).resolves.toMatchObject({
      id: "existing_asset",
      storagePath: "image/existing_asset-sha256_abc123.png"
    });
    expect(store.writes[0]?.assetId).toBe("existing_asset");
    expect(store.writes[0]?.storageVersion).toBe("sha256:abc123");
    expect(generateId).not.toHaveBeenCalled();
  });

  it("rejects invalid media before storage or repository writes", async () => {
    const repository = new RecordingAssetRepository();
    const store = new RecordingMediaAssetStore();
    const pipeline = new DefaultMediaImportPipeline({
      validator: new DefaultAssetValidator(),
      repository,
      store,
      transcoder: new NoopMediaTranscodingStage(),
      generateId: () => "asset_1",
      calculateChecksum: () => "sha256:abc123"
    });

    await expect(
      pipeline.importMedia({
        originalFileName: "photo.png",
        mimeType: "image/jpeg",
        bytes: pngBytes
      })
    ).rejects.toEqual(new InvalidMediaImportError("File extension does not match media type"));
    expect(store.writes).toEqual([]);
    expect(repository.records).toEqual([]);
  });

  it("keeps MVP transcoding as a replaceable no-op stage", async () => {
    const transcoder = new NoopMediaTranscodingStage();
    const bytes = new Uint8Array([5, 6, 7]);

    await expect(
      transcoder.transcode({
        originalFileName: "sound.mp3",
        mimeType: "audio/mpeg",
        mediaType: "audio",
        normalizedExtension: ".mp3",
        bytes
      })
    ).resolves.toEqual({
      originalFileName: "sound.mp3",
      mimeType: "audio/mpeg",
      mediaType: "audio",
      normalizedExtension: ".mp3",
      bytes
    });
  });
});

class RecordingAssetRepository implements AssetRepository {
  readonly records: AssetRecord[] = [];

  async save(record: AssetRecord): Promise<AssetRecord> {
    this.records.push(record);
    return record;
  }

  async findById(): Promise<AssetRecord | null> {
    return null;
  }

  async findManyByIds(): Promise<ReadonlyMap<string, AssetRecord>> {
    return new Map();
  }

  async list(): Promise<readonly AssetRecord[]> {
    return this.records;
  }

  async delete(): Promise<void> {}
}

class RecordingMediaAssetStore implements MediaAssetStore {
  readonly writes: AssetStorageWrite[] = [];

  async write(input: AssetStorageWrite): Promise<{ readonly storagePath: string }> {
    this.writes.push(input);
    return {
      storagePath: `${input.mediaType}/${input.assetId}${
        input.storageVersion === undefined ? "" : `-${input.storageVersion.replace(/[^A-Za-z0-9_-]/g, "_")}`
      }${input.normalizedExtension}`
    };
  }
}

const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
