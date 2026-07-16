import type { DatabaseSync } from "node:sqlite";
import {
  alertCollectionSchema,
  alertRuleSchema,
  type AlertCollection,
  type AlertCondition,
  type AlertRepository,
  type AlertRule,
  type AlertTtsConfig,
  type AlertVariant,
  type OverlayElementLayout,
  type StreamEventType
} from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";

interface AlertCollectionRow {
  readonly id: unknown;
  readonly name: unknown;
  readonly enabled: unknown;
}

interface AlertRuleRow {
  readonly id: unknown;
  readonly name: unknown;
  readonly event_type: unknown;
  readonly enabled: unknown;
  readonly cooldown_seconds: unknown;
  readonly priority: unknown;
}

interface AlertConditionRow {
  readonly field: unknown;
  readonly operator: unknown;
  readonly value_json: unknown;
}

interface AlertVariantRow {
  readonly id: unknown;
  readonly name: unknown;
  readonly enabled: unknown;
  readonly weight: unknown;
  readonly conditions_json: unknown;
  readonly priority: unknown;
  readonly visual_asset_id: unknown;
  readonly audio_asset_id: unknown;
  readonly text_template: unknown;
  readonly tts_config_json: unknown;
  readonly duration_ms: unknown;
  readonly layout_json: unknown;
}

export class SqliteAlertRepository implements AlertRepository {
  readonly #connection: DatabaseSync;

  constructor(connection: DatabaseSync) {
    this.#connection = connection;
  }

  async saveCollection(collection: AlertCollection): Promise<AlertCollection> {
    const parsed = alertCollectionSchema.parse(collection);
    runInTransaction(this.#connection, () => {
      if (parsed.enabled) {
        this.#connection
          .prepare("UPDATE alert_collections SET enabled = 0 WHERE enabled = 1 AND id != ?")
          .run(parsed.id);
      }
      this.#connection
        .prepare(
          `INSERT INTO alert_collections (id, name, enabled)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             enabled = excluded.enabled`
        )
        .run(parsed.id, parsed.name, booleanToInteger(parsed.enabled));
    });
    return parsed;
  }

  async findCollectionById(collectionId: string): Promise<AlertCollection | null> {
    const row = this.#connection
      .prepare("SELECT id, name, enabled FROM alert_collections WHERE id = ?")
      .get(collectionId);
    return row === undefined ? null : mapCollectionRow(row as unknown as AlertCollectionRow);
  }

  async listCollections(): Promise<readonly AlertCollection[]> {
    return this.#connection
      .prepare("SELECT id, name, enabled FROM alert_collections ORDER BY id")
      .all()
      .map((row) => mapCollectionRow(row as unknown as AlertCollectionRow));
  }

  async deleteCollection(collectionId: string): Promise<void> {
    this.#connection.prepare("DELETE FROM alert_collections WHERE id = ?").run(collectionId);
  }

  async saveRule(rule: AlertRule): Promise<AlertRule> {
    return this.saveRuleSync(rule);
  }

  saveRuleSync(rule: AlertRule): AlertRule {
    const parsed = alertRuleSchema.parse(rule);

    runInTransaction(this.#connection, () => {
      this.#connection
        .prepare(
          `INSERT INTO alert_rules (id, name, event_type, enabled, cooldown_seconds, priority)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             event_type = excluded.event_type,
             enabled = excluded.enabled,
             cooldown_seconds = excluded.cooldown_seconds,
             priority = excluded.priority`
        )
        .run(
          parsed.id,
          parsed.name,
          parsed.eventType,
          booleanToInteger(parsed.enabled),
          parsed.cooldownSeconds,
          parsed.priority
        );

      this.#connection.prepare("DELETE FROM alert_rule_collections WHERE rule_id = ?").run(parsed.id);
      this.#connection.prepare("DELETE FROM alert_rule_conditions WHERE rule_id = ?").run(parsed.id);
      this.#connection.prepare("DELETE FROM alert_variants WHERE rule_id = ?").run(parsed.id);

      const insertCollection = this.#connection.prepare(
        "INSERT INTO alert_rule_collections (rule_id, collection_id) VALUES (?, ?)"
      );
      for (const collectionId of parsed.collectionIds) {
        insertCollection.run(parsed.id, collectionId);
      }

      const insertCondition = this.#connection.prepare(
        `INSERT INTO alert_rule_conditions (rule_id, position, field, operator, value_json)
         VALUES (?, ?, ?, ?, ?)`
      );
      parsed.conditions.forEach((condition, position) => {
        insertCondition.run(parsed.id, position, condition.field, condition.operator, JSON.stringify(condition.value));
      });

      const insertVariant = this.#connection.prepare(
        `INSERT INTO alert_variants (
          id,
          rule_id,
          name,
          enabled,
          weight,
          conditions_json,
          priority,
          visual_asset_id,
          audio_asset_id,
          text_template,
          tts_config_json,
          duration_ms,
          layout_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const variant of parsed.variants) {
        insertVariant.run(
          variant.id,
          parsed.id,
          variant.name,
          booleanToInteger(variant.enabled),
          variant.weight,
          JSON.stringify(variant.conditions ?? []),
          variant.priority ?? 0,
          variant.visualAssetId,
          variant.audioAssetId,
          variant.textTemplate,
          variant.ttsConfig === null ? null : JSON.stringify(variant.ttsConfig),
          variant.durationMs,
          JSON.stringify(variant.layout)
        );
      }
    });

    return parsed;
  }

  async findRuleById(ruleId: string): Promise<AlertRule | null> {
    return this.#findRuleById(ruleId);
  }

  async listRules(): Promise<readonly AlertRule[]> {
    const rows = this.#connection
      .prepare(
        `SELECT id, name, event_type, enabled, cooldown_seconds, priority
         FROM alert_rules
         ORDER BY id`
      )
      .all();

    return rows.map((row) => this.#mapRuleRow(row as unknown as AlertRuleRow));
  }

  async deleteRule(ruleId: string): Promise<void> {
    this.#connection.prepare("DELETE FROM alert_rules WHERE id = ?").run(ruleId);
  }

  #findRuleById(ruleId: string): AlertRule | null {
    const row = this.#connection
      .prepare(
        `SELECT id, name, event_type, enabled, cooldown_seconds, priority
         FROM alert_rules
         WHERE id = ?`
      )
      .get(ruleId);

    return row === undefined ? null : this.#mapRuleRow(row as unknown as AlertRuleRow);
  }

  #mapRuleRow(row: AlertRuleRow): AlertRule {
    const ruleId = String(row.id);
    return alertRuleSchema.parse({
      id: ruleId,
      name: String(row.name),
      eventType: row.event_type as StreamEventType,
      enabled: integerToBoolean(row.enabled),
      collectionIds: this.#listCollectionIdsForRule(ruleId),
      conditions: this.#listConditionsForRule(ruleId),
      variants: this.#listVariantsForRule(ruleId),
      cooldownSeconds: Number(row.cooldown_seconds),
      priority: Number(row.priority)
    });
  }

  #listCollectionIdsForRule(ruleId: string): readonly string[] {
    return this.#connection
      .prepare(
        `SELECT collection_id
         FROM alert_rule_collections
         WHERE rule_id = ?
         ORDER BY collection_id`
      )
      .all(ruleId)
      .map((row) => String(row.collection_id));
  }

  #listConditionsForRule(ruleId: string): readonly AlertCondition[] {
    return this.#connection
      .prepare(
        `SELECT field, operator, value_json
         FROM alert_rule_conditions
         WHERE rule_id = ?
         ORDER BY position`
      )
      .all(ruleId)
      .map((row) => mapConditionRow(row as unknown as AlertConditionRow));
  }

  #listVariantsForRule(ruleId: string): readonly AlertVariant[] {
    return this.#connection
      .prepare(
        `SELECT id, name, enabled, weight, conditions_json, priority, visual_asset_id, audio_asset_id, text_template, tts_config_json, duration_ms, layout_json
         FROM alert_variants
         WHERE rule_id = ?
         ORDER BY id`
      )
      .all(ruleId)
      .map((row) => mapVariantRow(row as unknown as AlertVariantRow));
  }
}

function mapCollectionRow(row: AlertCollectionRow): AlertCollection {
  return alertCollectionSchema.parse({
    id: String(row.id),
    name: String(row.name),
    enabled: integerToBoolean(row.enabled)
  });
}

function mapConditionRow(row: AlertConditionRow): AlertCondition {
  return {
    field: String(row.field),
    operator: row.operator as AlertCondition["operator"],
    value: JSON.parse(String(row.value_json)) as AlertCondition["value"]
  };
}

function mapVariantRow(row: AlertVariantRow): AlertVariant {
  const conditions = JSON.parse(String(row.conditions_json)) as readonly AlertCondition[];
  const priority = Number(row.priority);

  return {
    id: String(row.id),
    name: String(row.name),
    enabled: integerToBoolean(row.enabled),
    weight: Number(row.weight),
    ...(conditions.length > 0 ? { conditions } : {}),
    ...(priority !== 0 ? { priority } : {}),
    visualAssetId: row.visual_asset_id === null ? null : String(row.visual_asset_id),
    audioAssetId: row.audio_asset_id === null ? null : String(row.audio_asset_id),
    textTemplate: String(row.text_template),
    ttsConfig: row.tts_config_json === null ? null : (JSON.parse(String(row.tts_config_json)) as AlertTtsConfig),
    durationMs: Number(row.duration_ms),
    layout: JSON.parse(String(row.layout_json)) as OverlayElementLayout
  };
}

function booleanToInteger(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function integerToBoolean(value: unknown): boolean {
  return Number(value) === 1;
}
