import type { DatabaseSync } from "node:sqlite";
import type {
  OverlayAccessKey,
  OverlayAccessKeyCreateRecordInput,
  OverlayAccessKeyRepository,
  OverlayPurpose,
  OverlayScope,
  OverlayTargetProfileId
} from "@stream-jams/core";
import type { RetiredOutputKeyRepository } from "./retired-output-secrets.js";

/** The stored identity an active (unrevoked) key authorizes, for synchronous recipient policy checks. */
export interface ActiveOverlayRecipientIdentity {
  readonly overlayId: string;
  readonly moduleId: string | null;
  readonly purpose: string;
  readonly scope: string;
  readonly targetProfileId: string | null;
}

interface OverlayAccessKeyRow {
  readonly id: unknown;
  readonly overlay_id: unknown;
  readonly module_id: unknown;
  readonly purpose: unknown;
  readonly scope: unknown;
  readonly target_profile_id: unknown;
  readonly key_hash: unknown;
  readonly route_key_secret_ref_json: unknown;
  readonly created_at: unknown;
  readonly revoked_at: unknown;
}

export class SqliteOverlayAccessKeyRepository implements OverlayAccessKeyRepository, RetiredOutputKeyRepository {
  readonly #connection: DatabaseSync;
  #activeRecipientStatement: ReturnType<DatabaseSync["prepare"]> | undefined;

  constructor(connection: DatabaseSync) {
    this.#connection = connection;
  }

  /** Synchronous lookup for the overlay gateway's per-recipient policy; revoked or unknown keys return null. */
  findActiveRecipientIdentity(keyId: string): ActiveOverlayRecipientIdentity | null {
    this.#activeRecipientStatement ??= this.#connection.prepare(
      "SELECT overlay_id, module_id, purpose, scope, target_profile_id FROM overlay_keys WHERE id = ? AND revoked_at IS NULL"
    );
    const row = this.#activeRecipientStatement.get(keyId);
    if (row === undefined) return null;
    return {
      overlayId: String(row.overlay_id),
      moduleId: row.module_id === null ? null : String(row.module_id),
      purpose: String(row.purpose),
      scope: String(row.scope),
      targetProfileId: row.target_profile_id === null ? null : String(row.target_profile_id)
    };
  }

  revokeRetiredPublicOutputs(): void {
    this.#connection.prepare("UPDATE overlay_keys SET revoked_at = COALESCE(revoked_at, created_at) WHERE purpose = 'test' OR scope = 'unified'").run();
  }

  listRevokedSecretReferences(): readonly { readonly id: string; readonly secretRefJson: string }[] {
    return this.#connection
      .prepare("SELECT id, route_key_secret_ref_json FROM overlay_keys WHERE revoked_at IS NOT NULL AND route_key_secret_ref_json IS NOT NULL ORDER BY rowid")
      .all()
      .map(row => ({ id: String(row.id), secretRefJson: String(row.route_key_secret_ref_json) }));
  }

  clearRevokedSecretReference(keyId: string): void {
    this.#connection.prepare("UPDATE overlay_keys SET route_key_secret_ref_json = NULL WHERE id = ? AND revoked_at IS NOT NULL").run(keyId);
  }

  async list(): Promise<readonly OverlayAccessKey[]> {
    return this.#connection.prepare("SELECT * FROM overlay_keys WHERE scope = 'module' AND purpose = 'live' AND revoked_at IS NULL ORDER BY created_at, id").all()
      .map(row => mapOverlayAccessKeyRow(row as unknown as OverlayAccessKeyRow));
  }

  async create(input: OverlayAccessKeyCreateRecordInput): Promise<OverlayAccessKey> {
    this.#connection
      .prepare(
        `INSERT INTO overlay_keys (id, overlay_id, module_id, purpose, scope, target_profile_id, key_hash, route_key_secret_ref_json, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .run(
        input.id,
        input.overlayId,
        input.moduleId,
        input.purpose,
        input.scope,
        input.targetProfileId ?? null,
        input.keyHash,
        input.routeKeySecretRef === null ? null : JSON.stringify(input.routeKeySecretRef),
        input.createdAt
      );

    return {
      ...input,
      targetProfileId: input.targetProfileId ?? null,
      revokedAt: null
    };
  }

  async findById(keyId: string): Promise<OverlayAccessKey | null> {
    const row = this.#connection
      .prepare(
        `SELECT id, overlay_id, module_id, purpose, scope, target_profile_id, key_hash, route_key_secret_ref_json, created_at, revoked_at
         FROM overlay_keys
         WHERE id = ?`
      )
      .get(keyId);

    return row === undefined ? null : mapOverlayAccessKeyRow(row as unknown as OverlayAccessKeyRow);
  }

  async findByHash(keyHash: string): Promise<OverlayAccessKey | null> {
    const row = this.#connection
      .prepare(
        `SELECT id, overlay_id, module_id, purpose, scope, target_profile_id, key_hash, route_key_secret_ref_json, created_at, revoked_at
         FROM overlay_keys
         WHERE key_hash = ?`
      )
      .get(keyHash);

    return row === undefined ? null : mapOverlayAccessKeyRow(row as unknown as OverlayAccessKeyRow);
  }

  async hasOutput(input: {
    readonly overlayId: string;
    readonly moduleId: string | null;
    readonly purpose: OverlayPurpose;
    readonly scope: OverlayScope;
    readonly targetProfileId?: OverlayTargetProfileId | null;
  }): Promise<boolean> {
    return this.#connection
      .prepare(
        `SELECT 1
         FROM overlay_keys
         WHERE overlay_id = ?
           AND module_id IS ?
           AND purpose = ?
           AND scope = ?
           AND target_profile_id IS ?
         LIMIT 1`
      )
      .get(input.overlayId, input.moduleId, input.purpose, input.scope, input.targetProfileId ?? null) !== undefined;
  }

  async findByOutput(input: {
    readonly overlayId: string;
    readonly moduleId: string | null;
    readonly purpose: OverlayPurpose;
    readonly scope: OverlayScope;
    readonly targetProfileId?: OverlayTargetProfileId | null;
  }): Promise<readonly OverlayAccessKey[]> {
    return this.#connection
      .prepare(
        `SELECT id, overlay_id, module_id, purpose, scope, target_profile_id, key_hash, route_key_secret_ref_json, created_at, revoked_at
         FROM overlay_keys
         WHERE overlay_id = ?
           AND module_id IS ?
           AND purpose = ?
           AND scope = ?
           AND target_profile_id IS ?
         ORDER BY created_at, id`
      )
      .all(input.overlayId, input.moduleId, input.purpose, input.scope, input.targetProfileId ?? null)
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
             target_profile_id = ?,
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
        record.targetProfileId ?? null,
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
    targetProfileId: row.target_profile_id === null ? null : (String(row.target_profile_id) as OverlayTargetProfileId),
    keyHash: String(row.key_hash),
    routeKeySecretRef: parseSecretRef(row.route_key_secret_ref_json),
    createdAt: String(row.created_at),
    revokedAt: row.revoked_at === null ? null : String(row.revoked_at)
  };
}

function parseSecretRef(value: unknown): OverlayAccessKey["routeKeySecretRef"] {
  return typeof value === "string" ? (JSON.parse(value) as OverlayAccessKey["routeKeySecretRef"]) : null;
}
