import type { AssetRecord } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteAssetRepository } from "./sqlite-asset-repository.js";
import { SqliteAssetLibraryMetadataRepository } from "./sqlite-asset-library-metadata-repository.js";

describe("SqliteAssetLibraryMetadataRepository", () => {
  it("saves, updates, and cascades library metadata with its asset", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const assets = new SqliteAssetRepository(database.connection);
    const metadata = new SqliteAssetLibraryMetadataRepository(database.connection);
    await assets.save(assetRecord);

    await metadata.save({
      assetId: assetRecord.id,
      displayName: "Seasonal follow",
      tags: ["seasonal", "follow"],
      createdAt: "2026-07-15T08:00:00.000Z",
      updatedAt: "2026-07-15T08:00:00.000Z"
    });
    await expect(metadata.find(assetRecord.id)).resolves.toEqual({
      assetId: assetRecord.id,
      displayName: "Seasonal follow",
      tags: ["seasonal", "follow"],
      createdAt: "2026-07-15T08:00:00.000Z",
      updatedAt: "2026-07-15T08:00:00.000Z"
    });

    await metadata.save({
      assetId: assetRecord.id,
      displayName: "Updated follow",
      tags: ["follow"],
      createdAt: "2026-07-15T08:00:00.000Z",
      updatedAt: "2026-07-15T09:00:00.000Z"
    });
    await assets.delete(assetRecord.id);

    await expect(metadata.find(assetRecord.id)).resolves.toBeNull();
  });
});

const assetRecord: AssetRecord = {
  id: "asset-image-1",
  originalFileName: "follow.png",
  mediaType: "image",
  mimeType: "image/png",
  sizeBytes: 1024,
  checksum: "sha256:asset",
  storagePath: "image/asset-image-1.png"
};
