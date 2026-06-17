import type { DatabaseSync } from "node:sqlite";
import type {
  OverlayAccessKey,
  OverlayAccessKeyCreateRecordInput,
  OverlayAccessKeyRepository,
  OverlayPurpose,
  OverlayScope
} from "@stream-jams/core";

interface OverlayAccessKeyRow {
  readonly id: unknown;
  readonly overlay_id: unknown;
  readonly module_id: unknown;
  readonly purpose: unknown;
  readonly scope: unknown;
  readonly key_hash: unknown;
  readonly route_key_secret_ref_json: unknown;
  readonly created_at: unknown;
  readonly revoked_at: unknown;
}

export class SqliteOverlayAccessKeyRepository implements OverlayAccessKeyRepository {
  readonly #connection: DatabaseSync;

  constructor(connection: DatabaseSync) {
    this.#connection = connection;
  }

  async create(input: OverlayAccessKeyCreateRecordInput): Promise<OverlayAccessKey> {
    this.#connection
      .prepare(
        `INSERT INTO overlay_keys (id, overlay_id, module_id, purpose, scope, key_hash, route_key_secret_ref_json, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        input.id,
        input.overlayId,
        input.moduleId,
        input.purpose,
        input.scope,
        input.keyHash,
        input.routeKeySecretRef === null ? null : JSON.stringify(input.routeKeySecretRef),
        input.createdAt
      );

    return {
      ...input,
      revokedAt: null
    };
  }

  async findById(keyId: string): Promise<OverlayAccessKey | null> {
    const row = this.#connection
      .prepare(
        `SELECT id, overlay_id, module_id, purpose, scope, key_hash, route_key_secret_ref_json, created_at, revoked_at
         FROM overlay_keys
         WHERE id = ?`
      )
      .get(keyId);

    return row === undefined ? null : mapOverlayAccessKeyRow(row as unknown as OverlayAccessKeyRow);
  }

  async findCandidates(overlayId: string): Promise<readonly OverlayAccessKey[]> {
    return this.#connection
      .prepare(
        `SELECT id, overlay_id, module_id, purpose, scope, key_hash, route_key_secret_ref_json, created_at, revoked_at
         FROM overlay_keys
         WHERE overlay_id = ?
         ORDER BY created_at, id`
      )
      .all(overlayId)
      .map((row) => mapOverlayAccessKeyRow(row as unknown as OverlayAccessKeyRow));
  }

  async findByOutput(input: {
    readonly overlayId: string;
    readonly moduleId: string | null;
    readonly purpose: OverlayPurpose;
    readonly scope: OverlayScope;
  }): Promise<readonly OverlayAccessKey[]> {
    return this.#connection
      .prepare(
        `SELECT id, overlay_id, module_id, purpose, scope, key_hash, route_key_secret_ref_json, created_at, revoked_at
         FROM overlay_keys
         WHERE overlay_id = ?
           AND module_id IS ?
           AND purpose = ?
           AND scope = ?
         ORDER BY created_at, id`
      )
      .all(input.overlayId, input.moduleId, input.purpose, input.scope)
      .map((row) => mapOverlayAccessKeyRow(row as unknown as OverlayAccessKeyRow));
  }

  async update(record: OverlayAccessKey): Promise<OverlayAccessKey | null> {
    const result = this.#connection
      .prepare(
        `UPDATE overlay_keys
         SET overlay_id = ?,
             module_id = ?,
             purpose = ?,
             scope = ?,
             key_hash = ?,
             route_key_secret_ref_json = ?,
             created_at = ?,
             revoked_at = ?
         WHERE id = ?`
      )
      .run(
        record.overlayId,
        record.moduleId,
        record.purpose,
        record.scope,
        record.keyHash,
        record.routeKeySecretRef === null ? null : JSON.stringify(record.routeKeySecretRef),
        record.createdAt,
        record.revokedAt,
        record.id
      );

    if (Number(result.changes) === 0) {
      return null;
    }

    return record;
  }
}

function mapOverlayAccessKeyRow(row: OverlayAccessKeyRow): OverlayAccessKey {
  return {
    id: String(row.id),
    overlayId: String(row.overlay_id),
    moduleId: row.module_id === null ? null : String(row.module_id),
    purpose: row.purpose as OverlayPurpose,
    scope: row.scope as OverlayScope,
    keyHash: String(row.key_hash),
    routeKeySecretRef: parseSecretRef(row.route_key_secret_ref_json),
    createdAt: String(row.created_at),
    revokedAt: row.revoked_at === null ? null : String(row.revoked_at)
  };
}

function parseSecretRef(value: unknown): OverlayAccessKey["routeKeySecretRef"] {
  return typeof value === "string" ? (JSON.parse(value) as OverlayAccessKey["routeKeySecretRef"]) : null;
}
