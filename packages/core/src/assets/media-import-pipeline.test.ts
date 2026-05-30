import type { AssetRepository } from "./repository.js";
import type { AssetRecord } from "./types.js";
import type { AssetStorageWrite, MediaAssetStore } from "./media-import-pipeline.js";
import { describe, expect, it } from "vitest";
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
    const pipeline = new DefaultMediaImportPipeline({
      validator: new DefaultAssetValidator(),
      repository,
      store,
      transcoder: new NoopMediaTranscodingStage(),
      generateId: () => "asset_1",
      calculateChecksum: () => "sha256:abc123"
    });
    const bytes = new Uint8Array([1, 2, 3]);

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
      sizeBytes: 3,
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
        bytes: new Uint8Array([1, 2, 3])
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
      storagePath: `${input.mediaType}/${input.assetId}${input.normalizedExtension}`
    };
  }
}
