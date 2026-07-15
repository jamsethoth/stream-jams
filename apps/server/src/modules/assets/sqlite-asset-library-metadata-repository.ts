import type { DatabaseSync } from "node:sqlite";
import type { AssetLibraryMetadata, AssetLibraryMetadataRepository } from "./asset-library-service.js";

interface AssetLibraryMetadataRow {
  readonly asset_id: unknown;
  readonly display_name: unknown;
  readonly tags_json: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

export class SqliteAssetLibraryMetadataRepository implements AssetLibraryMetadataRepository {
  readonly #connection: DatabaseSync;

  constructor(connection: DatabaseSync) {
    this.#connection = connection;
  }

  async find(assetId: string): Promise<AssetLibraryMetadata | null> {
    const row = this.#connection
      .prepare(
        `SELECT asset_id, display_name, tags_json, created_at, updated_at
         FROM asset_library_metadata
         WHERE asset_id = ?`
      )
      .get(assetId);
    return row === undefined ? null : mapMetadata(row as unknown as AssetLibraryMetadataRow);
  }

  async save(metadata: AssetLibraryMetadata): Promise<AssetLibraryMetadata> {
    this.#connection
      .prepare(
        `INSERT INTO asset_library_metadata (asset_id, display_name, tags_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(asset_id) DO UPDATE SET
           display_name = excluded.display_name,
           tags_json = excluded.tags_json,
           updated_at = excluded.updated_at`
      )
      .run(metadata.assetId, metadata.displayName, JSON.stringify(metadata.tags), metadata.createdAt, metadata.updatedAt);
    return metadata;
  }

  async delete(assetId: string): Promise<void> {
    this.#connection.prepare("DELETE FROM asset_library_metadata WHERE asset_id = ?").run(assetId);
  }
}

function mapMetadata(row: AssetLibraryMetadataRow): AssetLibraryMetadata {
  const tags = JSON.parse(String(row.tags_json)) as unknown;
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === "string")) {
    throw new TypeError("Asset tags must be a string array");
  }
  return {
    assetId: String(row.asset_id),
    displayName: String(row.display_name),
    tags,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}
