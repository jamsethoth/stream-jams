import type { DatabaseSync } from "node:sqlite";
import { assetRecordSchema, type AssetRecord, type AssetRepository } from "@stream-jams/core";

interface AssetRecordRow {
  readonly id: unknown;
  readonly original_file_name: unknown;
  readonly media_type: unknown;
  readonly mime_type: unknown;
  readonly size_bytes: unknown;
  readonly checksum: unknown;
  readonly storage_path: unknown;
}

export class SqliteAssetRepository implements AssetRepository {
  readonly #connection: DatabaseSync;

  constructor(connection: DatabaseSync) {
    this.#connection = connection;
  }

  async save(record: AssetRecord): Promise<AssetRecord> {
    const parsed = assetRecordSchema.parse(record);
    this.#connection
      .prepare(
        `INSERT INTO asset_metadata (id, original_file_name, media_type, mime_type, size_bytes, checksum, storage_path)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           original_file_name = excluded.original_file_name,
           media_type = excluded.media_type,
           mime_type = excluded.mime_type,
           size_bytes = excluded.size_bytes,
           checksum = excluded.checksum,
           storage_path = excluded.storage_path`
      )
      .run(
        parsed.id,
        parsed.originalFileName,
        parsed.mediaType,
        parsed.mimeType,
        parsed.sizeBytes,
        parsed.checksum,
        parsed.storagePath
      );
    return parsed;
  }

  async findById(assetId: string): Promise<AssetRecord | null> {
    const row = this.#connection
      .prepare(
        `SELECT id, original_file_name, media_type, mime_type, size_bytes, checksum, storage_path
         FROM asset_metadata
         WHERE id = ?`
      )
      .get(assetId);

    return row === undefined ? null : mapAssetRecordRow(row as unknown as AssetRecordRow);
  }

  async findManyByIds(assetIds: readonly string[]): Promise<ReadonlyMap<string, AssetRecord>> {
    const ids = Array.from(new Set(assetIds));
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.#connection
      .prepare(
        `SELECT id, original_file_name, media_type, mime_type, size_bytes, checksum, storage_path
         FROM asset_metadata
         WHERE id IN (${placeholders})`
      )
      .all(...ids);
    return new Map(rows.map((row) => {
      const asset = mapAssetRecordRow(row as unknown as AssetRecordRow);
      return [asset.id, asset];
    }));
  }

  async list(): Promise<readonly AssetRecord[]> {
    return this.#connection
      .prepare(
        `SELECT id, original_file_name, media_type, mime_type, size_bytes, checksum, storage_path
         FROM asset_metadata
         ORDER BY id`
      )
      .all()
      .map((row) => mapAssetRecordRow(row as unknown as AssetRecordRow));
  }

  async delete(assetId: string): Promise<void> {
    this.#connection.prepare("DELETE FROM asset_metadata WHERE id = ?").run(assetId);
  }
}

function mapAssetRecordRow(row: AssetRecordRow): AssetRecord {
  return assetRecordSchema.parse({
    id: String(row.id),
    originalFileName: String(row.original_file_name),
    mediaType: row.media_type,
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes),
    checksum: String(row.checksum),
    storagePath: String(row.storage_path)
  });
}
