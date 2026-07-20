import type { DatabaseSync } from "node:sqlite";
import { providerKindSchema, targetProfileIdSchema } from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";
import type {
  AlertRuleManagementMetadata,
  AlertSetMetadata,
  AlertSetMetadataRepository
} from "./alert-set-management-service.js";

interface AlertSetMetadataRow {
  readonly set_id: unknown;
  readonly starter: unknown;
  readonly starter_review_state: unknown;
  readonly landscape_enabled: unknown;
  readonly landscape_review_state: unknown;
  readonly vertical_enabled: unknown;
  readonly vertical_review_state: unknown;
}

interface AlertRuleManagementMetadataRow {
  readonly rule_id: unknown;
  readonly provider_kind: unknown;
  readonly review_state: unknown;
  readonly target_profile_ids_json: unknown;
}

export class SqliteAlertSetMetadataRepository implements AlertSetMetadataRepository {
  readonly #connection: DatabaseSync;

  constructor(connection: DatabaseSync) {
    this.#connection = connection;
  }

  async findSet(setId: string): Promise<AlertSetMetadata | null> {
    const row = this.#connection
      .prepare(
        `SELECT set_id, starter, starter_review_state, landscape_enabled, landscape_review_state,
                vertical_enabled, vertical_review_state
         FROM alert_set_metadata
         WHERE set_id = ?`
      )
      .get(setId);
    return row === undefined ? null : mapSetMetadata(row as unknown as AlertSetMetadataRow);
  }

  async findSets(setIds: readonly string[]): Promise<ReadonlyMap<string, AlertSetMetadata>> {
    const ids = Array.from(new Set(setIds));
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.#connection
      .prepare(
        `SELECT set_id, starter, starter_review_state, landscape_enabled, landscape_review_state,
                vertical_enabled, vertical_review_state
         FROM alert_set_metadata
         WHERE set_id IN (${placeholders})`
      )
      .all(...ids);
    return new Map(rows.map((row) => {
      const metadata = mapSetMetadata(row as unknown as AlertSetMetadataRow);
      return [metadata.setId, metadata];
    }));
  }

  async saveSet(metadata: AlertSetMetadata): Promise<AlertSetMetadata> {
    return this.saveSetSync(metadata);
  }

  saveSetSync(metadata: AlertSetMetadata): AlertSetMetadata {
    this.#connection
      .prepare(
        `INSERT INTO alert_set_metadata (
           set_id, starter, starter_review_state, landscape_enabled, landscape_review_state,
           vertical_enabled, vertical_review_state
         ) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(set_id) DO UPDATE SET
           starter = excluded.starter,
           starter_review_state = excluded.starter_review_state,
           landscape_enabled = excluded.landscape_enabled,
           landscape_review_state = excluded.landscape_review_state,
           vertical_enabled = excluded.vertical_enabled,
           vertical_review_state = excluded.vertical_review_state`
      )
      .run(
        metadata.setId,
        toInteger(metadata.starter),
        metadata.starterReviewState,
        toInteger(metadata.landscapeEnabled),
        metadata.landscapeReviewState,
        toInteger(metadata.verticalEnabled),
        metadata.verticalReviewState
      );
    return metadata;
  }

  async deleteSet(setId: string): Promise<void> {
    this.deleteSetSync(setId);
  }

  deleteSetSync(setId: string): void {
    this.#connection.prepare("DELETE FROM alert_set_metadata WHERE set_id = ?").run(setId);
  }

  async findRule(ruleId: string): Promise<AlertRuleManagementMetadata | null> {
    const row = this.#connection
      .prepare(
        `SELECT rule_id, provider_kind, review_state, target_profile_ids_json
         FROM alert_rule_management_metadata
         WHERE rule_id = ?`
      )
      .get(ruleId);
    return row === undefined ? null : mapRuleMetadata(row as unknown as AlertRuleManagementMetadataRow);
  }

  async findRules(ruleIds: readonly string[]): Promise<ReadonlyMap<string, AlertRuleManagementMetadata>> {
    const ids = Array.from(new Set(ruleIds));
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => "?").join(", ");
    const rows = this.#connection
      .prepare(
        `SELECT rule_id, provider_kind, review_state, target_profile_ids_json
         FROM alert_rule_management_metadata
         WHERE rule_id IN (${placeholders})`
      )
      .all(...ids);
    return new Map(rows.map((row) => {
      const metadata = mapRuleMetadata(row as unknown as AlertRuleManagementMetadataRow);
      return [metadata.ruleId, metadata];
    }));
  }

  async saveRule(metadata: AlertRuleManagementMetadata): Promise<AlertRuleManagementMetadata> {
    return this.saveRuleSync(metadata);
  }

  saveRuleSync(metadata: AlertRuleManagementMetadata): AlertRuleManagementMetadata {
    const providerKind = providerKindSchema.parse(metadata.providerKind);
    const targetProfileIds = metadata.targetProfileIds.map((profileId) => targetProfileIdSchema.parse(profileId));
    this.#connection
      .prepare(
        `INSERT INTO alert_rule_management_metadata (rule_id, provider_kind, review_state, target_profile_ids_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(rule_id) DO UPDATE SET
           provider_kind = excluded.provider_kind,
           review_state = excluded.review_state,
           target_profile_ids_json = excluded.target_profile_ids_json`
      )
      .run(metadata.ruleId, providerKind, metadata.reviewState, JSON.stringify(targetProfileIds));
    return { ...metadata, providerKind, targetProfileIds };
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.deleteRuleSync(ruleId);
  }

  deleteRuleSync(ruleId: string): void {
    this.#connection.prepare("DELETE FROM alert_rule_management_metadata WHERE rule_id = ?").run(ruleId);
  }

  async activateSet(setId: string): Promise<string | null> {
    return runInTransaction(this.#connection, () => {
      const current = this.#connection
        .prepare("SELECT id FROM alert_collections WHERE enabled = 1")
        .get() as { readonly id?: unknown } | undefined;
      this.#connection.prepare("UPDATE alert_collections SET enabled = 0 WHERE enabled = 1").run();
      const result = this.#connection.prepare("UPDATE alert_collections SET enabled = 1 WHERE id = ?").run(setId);
      if (Number(result.changes) === 0) {
        throw new Error(`Alert set "${setId}" was not found`);
      }
      const replacedSetId = current?.id === undefined ? null : String(current.id);
      return replacedSetId === setId ? null : replacedSetId;
    });
  }
}

function mapSetMetadata(row: AlertSetMetadataRow): AlertSetMetadata {
  return {
    setId: String(row.set_id),
    starter: toBoolean(row.starter),
    starterReviewState: row.starter_review_state === "pending" ? "pending" : "complete",
    landscapeEnabled: toBoolean(row.landscape_enabled),
    landscapeReviewState: row.landscape_review_state === "needs-review" ? "needs-review" : "ready",
    verticalEnabled: toBoolean(row.vertical_enabled),
    verticalReviewState: row.vertical_review_state === "ready" ? "ready" : "needs-review"
  };
}

function mapRuleMetadata(row: AlertRuleManagementMetadataRow): AlertRuleManagementMetadata {
  const parsedProfiles = JSON.parse(String(row.target_profile_ids_json)) as unknown;
  if (!Array.isArray(parsedProfiles)) {
    throw new TypeError("Alert rule target profiles must be an array");
  }
  return {
    ruleId: String(row.rule_id),
    providerKind: providerKindSchema.parse(row.provider_kind),
    reviewState: row.review_state === "needs-review" ? "needs-review" : "ready",
    targetProfileIds: parsedProfiles.map((profileId) => targetProfileIdSchema.parse(profileId))
  };
}

function toInteger(value: boolean): number {
  return value ? 1 : 0;
}

function toBoolean(value: unknown): boolean {
  return Number(value) === 1;
}
