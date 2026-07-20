import type { AssetRecord } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteAssetRepository } from "./sqlite-asset-repository.js";

describe("SqliteAssetRepository", () => {
  it("saves, updates, finds, lists, and deletes asset metadata records", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteAssetRepository(database.connection);
    const asset: AssetRecord = {
      id: "asset-image-1",
      originalFileName: "alert.png",
      mediaType: "image",
      mimeType: "image/png",
      sizeBytes: 1024,
      checksum: "sha256:abc",
      storagePath: "assets/asset-image-1.png"
    };
    const updatedAsset: AssetRecord = {
      ...asset,
      originalFileName: "alert-updated.png",
      sizeBytes: 2048,
      checksum: "sha256:def"
    };

    await expect(repository.findById("asset-image-1")).resolves.toBeNull();

    await repository.save(asset);
    await expect(repository.findById("asset-image-1")).resolves.toEqual(asset);
    await expect(repository.findManyByIds([])).resolves.toEqual(new Map());
    await expect(repository.findManyByIds([asset.id, asset.id, "missing"])).resolves.toEqual(
      new Map([[asset.id, asset]])
    );
    await expect(repository.list()).resolves.toEqual([asset]);

    await repository.save(updatedAsset);
    await expect(repository.findById("asset-image-1")).resolves.toEqual(updatedAsset);

    database.connection.prepare(
      "INSERT INTO asset_library_metadata (asset_id, display_name, tags_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).run(asset.id, "Alert", "[]", "2026-07-20T00:00:00.000Z", "2026-07-20T00:00:00.000Z");

    await repository.delete("asset-image-1");
    await expect(repository.findById("asset-image-1")).resolves.toBeNull();
    expect(database.connection.prepare("SELECT asset_id FROM asset_library_metadata").all()).toEqual([]);
  });
});
