import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  alertCollectionSchema,
  alertEditorDocumentSchema,
  alertRuleSchema,
  assetMetadataUpdateInputSchema,
  assetRecordSchema,
  overlayPurposeSchema,
  overlayModuleConfigSchema,
  providerCapabilitySchema,
  providerConnectionStateSchema,
  providerIntakeStateSchema,
  providerKindSchema,
  registeredProviderDetailSchema,
  targetProfileIdSchema,
  type ConfigurationBackupArchive,
  type ConfigurationBackupOutput
} from "@stream-jams/core";
import { runInTransaction } from "../db/database.js";
import type { ConfigurationSnapshotRepository } from "./configuration-backup-service.js";

type BackupConfiguration = ConfigurationBackupArchive["configuration"];
type BackupRow = Record<string, unknown>;

interface TableDefinition {
  readonly name: string;
  readonly columns: readonly string[];
  readonly orderBy: readonly string[];
  readonly jsonColumns?: readonly string[];
  readonly select?: string;
}

const tableDefinitions = [
  table("overlay_module_config", ["module_id", "enabled", "config_json", "updated_at"], ["module_id"], ["config_json"]),
  table("alert_collections", ["id", "name", "enabled"], ["id"]),
  table("alert_rules", ["id", "name", "event_type", "enabled", "cooldown_seconds", "priority"], ["id"]),
  table("asset_metadata", ["id", "original_file_name", "media_type", "mime_type", "size_bytes", "checksum"], ["id"]),
  table(
    "provider_registrations",
    ["id", "name", "kind", "capability", "non_secret_config_json", "active", "connection_state", "intake_state", "validated_at", "error_json", "available_voices_json", "tts_safety_json", "created_at", "updated_at"],
    ["capability", "name", "id"],
    ["non_secret_config_json", "available_voices_json", "tts_safety_json"],
    `SELECT id, name, kind, capability, non_secret_config_json, active,
            'disconnected' AS connection_state,
            CASE WHEN capability = 'event-source' THEN 'inactive' ELSE NULL END AS intake_state,
            NULL AS validated_at, NULL AS error_json, '[]' AS available_voices_json,
            tts_safety_json, created_at, updated_at
     FROM provider_registrations`
  ),
  table("alert_rule_collections", ["rule_id", "collection_id"], ["rule_id", "collection_id"]),
  table("alert_rule_conditions", ["rule_id", "position", "field", "operator", "value_json"], ["rule_id", "position"], ["value_json"]),
  table("alert_variants", ["id", "rule_id", "name", "enabled", "weight", "visual_asset_id", "audio_asset_id", "text_template", "tts_config_json", "duration_ms", "layout_json", "conditions_json", "priority", "variant_order"], ["rule_id", "variant_order", "id"], ["tts_config_json", "layout_json", "conditions_json"]),
  table("alert_set_metadata", ["set_id", "starter", "starter_review_state", "landscape_enabled", "landscape_review_state", "vertical_enabled", "vertical_review_state"], ["set_id"]),
  table("alert_rule_management_metadata", ["rule_id", "provider_kind", "review_state", "target_profile_ids_json"], ["rule_id"], ["target_profile_ids_json"]),
  table("asset_library_metadata", ["asset_id", "display_name", "tags_json", "created_at", "updated_at"], ["asset_id"], ["tags_json"]),
  table("alert_editor_documents", ["alert_id", "document_json", "updated_at"], ["alert_id"], ["document_json"])
] as const satisfies readonly TableDefinition[];

const definitionsByName = new Map(tableDefinitions.map((definition) => [definition.name, definition]));
const nullableJsonColumns = new Set(["tts_config_json", "tts_safety_json"]);
const restorePointMarker = Symbol("configuration-restore-point");

interface SqliteConfigurationRestorePoint {
  readonly marker: typeof restorePointMarker;
  readonly tables: Readonly<Record<string, readonly BackupRow[]>>;
}

export class SqliteConfigurationSnapshotRepository implements ConfigurationSnapshotRepository {
  constructor(private readonly connection: DatabaseSync) {}

  snapshot(): Omit<BackupConfiguration, "appConfig"> {
    const tables: BackupConfiguration["tables"] = {};
    for (const definition of tableDefinitions) {
      const select = definition.select ?? `SELECT ${definition.columns.join(", ")} FROM ${definition.name}`;
      const rows = this.connection.prepare(`${select} ORDER BY ${definition.orderBy.join(", ")}`).all();
      tables[definition.name] = rows.map(toPlainRecord);
    }

    const providerReconnectMetadata = this.connection
      .prepare("SELECT id, name, kind FROM provider_registrations ORDER BY capability, name, id")
      .all()
      .map((row) => {
        const record = toPlainRecord(row);
        return { id: String(record.id), name: String(record.name), kind: providerKindSchema.parse(record.kind) };
      });
    const overlayOutputs = this.connection
      .prepare(
        `SELECT DISTINCT overlay_id, scope, module_id, purpose, target_profile_id
         FROM overlay_keys
         WHERE revoked_at IS NULL
         ORDER BY overlay_id, scope, module_id, target_profile_id, purpose`
      )
      .all()
      .map(mapOutput);
    return { tables, providerReconnectMetadata, overlayOutputs };
  }

  captureRestorePoint(): SqliteConfigurationRestorePoint {
    return {
      marker: restorePointMarker,
      tables: Object.fromEntries(
        [...tableDefinitions.map((definition) => definition.name), "overlay_keys", "twitch_accounts"].map((name) => [
          name,
          this.connection.prepare(`SELECT * FROM ${name}`).all().map(toPlainRecord)
        ])
      )
    };
  }

  restoreRestorePoint(restorePoint: unknown): void {
    if (!isSqliteRestorePoint(restorePoint)) {
      throw new TypeError("Configuration restore point is invalid");
    }

    runInTransaction(this.connection, () => {
      this.connection.prepare("DELETE FROM overlay_keys").run();
      this.connection.prepare("DELETE FROM twitch_accounts").run();
      for (const definition of [...tableDefinitions].reverse()) {
        this.connection.prepare(`DELETE FROM ${definition.name}`).run();
      }
      for (const definition of tableDefinitions) {
        insertCapturedRows(this.connection, definition.name, restorePoint.tables[definition.name] ?? []);
      }
      insertCapturedRows(this.connection, "overlay_keys", restorePoint.tables.overlay_keys ?? []);
      insertCapturedRows(this.connection, "twitch_accounts", restorePoint.tables.twitch_accounts ?? []);
    });
  }

  validate(configuration: BackupConfiguration): readonly string[] {
    const errors: string[] = [];
    const tableNames = Object.keys(configuration.tables);
    for (const name of tableNames) {
      if (!definitionsByName.has(name)) errors.push(`Unknown backup table "${name}".`);
    }
    for (const definition of tableDefinitions) {
      const rows = configuration.tables[definition.name];
      if (rows === undefined) {
        errors.push(`Required backup table "${definition.name}" is missing.`);
        continue;
      }
      for (const [index, row] of rows.entries()) {
        const actualColumns = Object.keys(row).sort();
        const expectedColumns = [...definition.columns].sort();
        const missing = expectedColumns.filter((column) => !actualColumns.includes(column));
        const extra = actualColumns.filter((column) => !expectedColumns.includes(column));
        if (missing.length > 0) errors.push(`${definition.name}[${index}] is missing columns: ${missing.join(", ")}.`);
        if (extra.length > 0) errors.push(`${definition.name}[${index}] contains unsupported columns: ${extra.join(", ")}.`);
        for (const [column, value] of Object.entries(row)) {
          if (value !== null && typeof value !== "string" && typeof value !== "number") {
            errors.push(`${definition.name}[${index}].${column} must be a string, number, or null.`);
          }
        }
        for (const column of definition.jsonColumns ?? []) {
          const value = row[column];
          if (value === null && nullableJsonColumns.has(column)) continue;
          if (typeof value !== "string" || !isJson(value)) errors.push(`${definition.name}[${index}].${column} must contain valid JSON.`);
        }
        if (definition.name === "provider_registrations" && typeof row.non_secret_config_json === "string") {
          const forbiddenPath = findForbiddenSecretField(row.non_secret_config_json);
          if (forbiddenPath !== null) errors.push(`provider_registrations[${index}].non_secret_config_json contains forbidden secret field "${forbiddenPath}".`);
        }
      }
    }
    errors.push(...validateUniqueConstraints(configuration.tables));
    errors.push(...validateReferences(configuration.tables));
    errors.push(...validateDomainRows(configuration.tables));
    for (const [index, output] of configuration.overlayOutputs.entries()) {
      if (output.scope !== "unified" && output.scope !== "module") errors.push(`overlayOutputs[${index}].scope is invalid.`);
      if (output.scope === "module" && output.moduleId === null) errors.push(`overlayOutputs[${index}].moduleId is required for module scope.`);
      if (output.scope === "unified" && (output.moduleId !== null || output.targetProfileId !== null)) errors.push(`overlayOutputs[${index}] contains module-only fields for unified scope.`);
    }
    return errors;
  }

  replace(input: { readonly tables: BackupConfiguration["tables"]; readonly assets: readonly import("@stream-jams/core").AssetRecord[] }): void {
    const validationConfiguration: BackupConfiguration = {
      appConfig: {},
      tables: input.tables,
      providerReconnectMetadata: [],
      overlayOutputs: []
    };
    const errors = this.validate(validationConfiguration).filter((error) => !error.startsWith("overlayOutputs"));
    if (errors.length > 0) throw new TypeError(`Invalid backup configuration: ${errors.join(" ")}`);

    runInTransaction(this.connection, () => {
      this.connection.prepare("DELETE FROM overlay_keys").run();
      this.connection.prepare("DELETE FROM twitch_accounts").run();
      for (const definition of [...tableDefinitions].reverse()) {
        this.connection.prepare(`DELETE FROM ${definition.name}`).run();
      }
      for (const definition of tableDefinitions) {
        if (definition.name === "asset_metadata") {
          for (const asset of input.assets) {
            this.connection.prepare(
              "INSERT INTO asset_metadata (id, original_file_name, media_type, mime_type, size_bytes, checksum, storage_path) VALUES (?, ?, ?, ?, ?, ?, ?)"
            ).run(asset.id, asset.originalFileName, asset.mediaType, asset.mimeType, asset.sizeBytes, asset.checksum, asset.storagePath);
          }
          continue;
        }
        const placeholders = definition.columns.map(() => "?").join(", ");
        const statement = this.connection.prepare(`INSERT INTO ${definition.name} (${definition.columns.join(", ")}) VALUES (${placeholders})`);
        for (const row of input.tables[definition.name] ?? []) {
          statement.run(...definition.columns.map((column) => row[column] as SQLInputValue));
        }
      }
    });
  }
}

function isSqliteRestorePoint(value: unknown): value is SqliteConfigurationRestorePoint {
  return typeof value === "object" && value !== null && "marker" in value && value.marker === restorePointMarker && "tables" in value;
}

function insertCapturedRows(connection: DatabaseSync, tableName: string, rows: readonly BackupRow[]): void {
  for (const row of rows) {
    const columns = Object.keys(row);
    if (columns.length === 0 || columns.some((column) => !/^[a-z_]+$/u.test(column))) {
      throw new TypeError(`Restore point for ${tableName} contains invalid columns`);
    }
    const placeholders = columns.map(() => "?").join(", ");
    connection.prepare(`INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`)
      .run(...columns.map((column) => row[column] as SQLInputValue));
  }
}

function table(
  name: string,
  columns: readonly string[],
  orderBy: readonly string[],
  jsonColumns?: readonly string[],
  select?: string
): TableDefinition {
  return { name, columns, orderBy, ...(jsonColumns === undefined ? {} : { jsonColumns }), ...(select === undefined ? {} : { select }) };
}

function toPlainRecord(row: unknown): BackupRow {
  return Object.fromEntries(Object.entries(row as Record<string, unknown>));
}

function mapOutput(row: unknown): ConfigurationBackupOutput {
  const record = toPlainRecord(row);
  return {
    overlayId: String(record.overlay_id),
    scope: String(record.scope),
    moduleId: record.module_id === null ? null : String(record.module_id),
    purpose: overlayPurposeSchema.parse(record.purpose),
    targetProfileId: targetProfileIdSchema.nullable().parse(record.target_profile_id)
  };
}

function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function findForbiddenSecretField(json: string): string | null {
  try {
    return visitJson(JSON.parse(json) as unknown, []);
  } catch {
    return null;
  }
}

function visitJson(value: unknown, path: readonly string[]): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = visitJson(item, path);
      if (found !== null) return found;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value)) {
    const canonical = key.replace(/[^a-z0-9]/giu, "").toLocaleLowerCase();
    if (/(?:password|credential|token|authorization|secret|routekey|keyhash|rawkey|accesskey)/u.test(canonical)) return [...path, key].join(".");
    const found = visitJson(nested, [...path, key]);
    if (found !== null) return found;
  }
  return null;
}

function validateDomainRows(tables: BackupConfiguration["tables"]): readonly string[] {
  const errors: string[] = [];

  for (const [index, row] of (tables.overlay_module_config ?? []).entries()) {
    pushSchemaError(errors, `overlay_module_config[${index}]`, overlayModuleConfigSchema.safeParse({
      moduleId: row.module_id,
      enabled: sqlBoolean(row.enabled),
      config: parseJsonValue(row.config_json),
      updatedAt: row.updated_at
    }));
  }

  for (const [index, row] of (tables.alert_collections ?? []).entries()) {
    pushSchemaError(errors, `alert_collections[${index}]`, alertCollectionSchema.safeParse({
      id: row.id,
      name: row.name,
      enabled: sqlBoolean(row.enabled)
    }));
  }

  for (const [index, row] of (tables.alert_rules ?? []).entries()) {
    const ruleId = String(row.id);
    const conditions = (tables.alert_rule_conditions ?? [])
      .filter((candidate) => candidate.rule_id === row.id)
      .sort((left, right) => Number(left.position) - Number(right.position))
      .map((condition) => ({
        field: condition.field,
        operator: condition.operator,
        value: parseJsonValue(condition.value_json)
      }));
    const variants = (tables.alert_variants ?? [])
      .filter((candidate) => candidate.rule_id === row.id)
      .sort((left, right) => Number(left.variant_order) - Number(right.variant_order) || String(left.id).localeCompare(String(right.id)))
      .map((variant) => ({
        id: variant.id,
        name: variant.name,
        enabled: sqlBoolean(variant.enabled),
        weight: variant.weight,
        conditions: parseJsonValue(variant.conditions_json),
        priority: variant.priority,
        visualAssetId: variant.visual_asset_id,
        audioAssetId: variant.audio_asset_id,
        textTemplate: variant.text_template,
        ttsConfig: variant.tts_config_json === null ? null : parseJsonValue(variant.tts_config_json),
        durationMs: variant.duration_ms,
        layout: parseJsonValue(variant.layout_json)
      }));
    pushSchemaError(errors, `alert_rules[${index}]`, alertRuleSchema.safeParse({
      id: row.id,
      name: row.name,
      eventType: row.event_type,
      enabled: sqlBoolean(row.enabled),
      collectionIds: (tables.alert_rule_collections ?? [])
        .filter((candidate) => candidate.rule_id === row.id)
        .map((candidate) => candidate.collection_id),
      conditions,
      variants,
      cooldownSeconds: row.cooldown_seconds,
      priority: row.priority
    }));
    if (ruleId.trim() === "") errors.push(`alert_rules[${index}].id must not be empty.`);
  }

  for (const [index, row] of (tables.asset_metadata ?? []).entries()) {
    pushSchemaError(errors, `asset_metadata[${index}]`, assetRecordSchema.safeParse({
      id: row.id,
      originalFileName: row.original_file_name,
      mediaType: row.media_type,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      checksum: row.checksum,
      storagePath: `backup/${String(row.id)}`
    }));
  }

  for (const [index, row] of (tables.alert_variants ?? []).entries()) {
    if (!Number.isInteger(row.variant_order) || Number(row.variant_order) < 0) {
      errors.push(`alert_variants[${index}].variant_order must be a non-negative integer.`);
    }
  }

  for (const [index, row] of (tables.provider_registrations ?? []).entries()) {
    const capability = providerCapabilitySchema.safeParse(row.capability);
    const connectionState = providerConnectionStateSchema.safeParse(row.connection_state);
    const intakeState = row.intake_state === null
      ? { success: true as const, data: null }
      : providerIntakeStateSchema.safeParse(row.intake_state);
    const kind = providerKindSchema.safeParse(row.kind);
    if (!capability.success || !connectionState.success || !intakeState.success || !kind.success) {
      errors.push(`provider_registrations[${index}] contains an unsupported provider kind, capability, or runtime state.`);
      continue;
    }
    pushSchemaError(errors, `provider_registrations[${index}]`, registeredProviderDetailSchema.safeParse({
      provider: {
        id: row.id,
        name: row.name,
        kind: kind.data,
        capability: capability.data,
        active: sqlBoolean(row.active),
        connectionState: connectionState.data,
        intakeState: intakeState.data,
        validatedAt: row.validated_at,
        error: row.error_json === null ? null : parseJsonValue(row.error_json),
        usedByAlertCount: 0
      },
      configuration: parseJsonValue(row.non_secret_config_json),
      availableVoices: parseJsonValue(row.available_voices_json),
      ttsSafety: row.tts_safety_json === null ? null : parseJsonValue(row.tts_safety_json)
    }));
  }

  for (const [index, row] of (tables.alert_set_metadata ?? []).entries()) {
    if (
      typeof sqlBoolean(row.starter) !== "boolean" ||
      typeof sqlBoolean(row.landscape_enabled) !== "boolean" ||
      typeof sqlBoolean(row.vertical_enabled) !== "boolean" ||
      (row.starter_review_state !== "pending" && row.starter_review_state !== "complete") ||
      (row.landscape_review_state !== "ready" && row.landscape_review_state !== "needs-review") ||
      (row.vertical_review_state !== "ready" && row.vertical_review_state !== "needs-review")
    ) {
      errors.push(`alert_set_metadata[${index}] contains an invalid review or enabled state.`);
    }
  }

  for (const [index, row] of (tables.alert_rule_management_metadata ?? []).entries()) {
    const profiles = parseJsonValue(row.target_profile_ids_json);
    if (
      !providerKindSchema.safeParse(row.provider_kind).success ||
      (row.review_state !== "ready" && row.review_state !== "needs-review") ||
      !Array.isArray(profiles) ||
      profiles.some((profile) => !targetProfileIdSchema.safeParse(profile).success)
    ) {
      errors.push(`alert_rule_management_metadata[${index}] contains invalid provider, review, or target-profile metadata.`);
    }
  }

  for (const [index, row] of (tables.asset_library_metadata ?? []).entries()) {
    pushSchemaError(errors, `asset_library_metadata[${index}]`, assetMetadataUpdateInputSchema.safeParse({
      displayName: row.display_name,
      tags: parseJsonValue(row.tags_json)
    }));
  }

  for (const [index, row] of (tables.alert_editor_documents ?? []).entries()) {
    const result = alertEditorDocumentSchema.safeParse(parseJsonValue(row.document_json));
    pushSchemaError(errors, `alert_editor_documents[${index}]`, result);
    if (result.success && result.data.id !== row.alert_id) {
      errors.push(`alert_editor_documents[${index}].alert_id does not match document_json.id.`);
    }
  }

  return errors;
}

function validateUniqueConstraints(tables: BackupConfiguration["tables"]): readonly string[] {
  const errors: string[] = [];
  const constraints = [
    ["overlay_module_config", ["module_id"]],
    ["alert_collections", ["id"]],
    ["alert_rules", ["id"]],
    ["asset_metadata", ["id"]],
    ["provider_registrations", ["id"]],
    ["alert_rule_collections", ["rule_id", "collection_id"]],
    ["alert_rule_conditions", ["rule_id", "position"]],
    ["alert_variants", ["id"]],
    ["alert_variants", ["rule_id", "variant_order"]],
    ["alert_set_metadata", ["set_id"]],
    ["alert_rule_management_metadata", ["rule_id"]],
    ["asset_library_metadata", ["asset_id"]],
    ["alert_editor_documents", ["alert_id"]]
  ] as const;
  for (const [tableName, columns] of constraints) {
    const seen = new Set<string>();
    for (const [index, row] of (tables[tableName] ?? []).entries()) {
      const key = JSON.stringify(columns.map((column) => row[column]));
      if (seen.has(key)) {
        errors.push(`${tableName}[${index}] duplicates the unique key (${columns.join(", ")}).`);
      }
      seen.add(key);
    }
  }

  const collectionNames = new Set<string>();
  let activeCollectionCount = 0;
  const alertCollections = tables.alert_collections ?? [];
  for (const [index, row] of alertCollections.entries()) {
    const normalizedName = typeof row.name === "string" ? row.name.trim().toLocaleLowerCase() : String(row.name);
    if (collectionNames.has(normalizedName)) {
      errors.push(`alert_collections[${index}] duplicates another set name case-insensitively.`);
    }
    collectionNames.add(normalizedName);
    if (row.enabled === 1) activeCollectionCount += 1;
  }
  if (alertCollections.length === 0) {
    errors.push("alert_collections must contain at least one alert set.");
  }
  if (activeCollectionCount === 0) {
    errors.push("alert_collections must contain exactly one active alert set.");
  } else if (activeCollectionCount > 1) {
    errors.push("alert_collections contains more than one active alert set.");
  }

  const activeProviderCapabilities = new Set<unknown>();
  for (const [index, row] of (tables.provider_registrations ?? []).entries()) {
    if (row.active !== 1) continue;
    if (activeProviderCapabilities.has(row.capability)) {
      errors.push(`provider_registrations[${index}] duplicates the active provider for capability "${String(row.capability)}".`);
    }
    activeProviderCapabilities.add(row.capability);
  }
  return errors;
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function sqlBoolean(value: unknown): boolean | unknown {
  if (value === 1) return true;
  if (value === 0) return false;
  return value;
}

function pushSchemaError(
  errors: string[],
  location: string,
  result: { readonly success: boolean; readonly error?: { readonly issues: readonly { readonly message: string }[] } }
): void {
  if (result.success) return;
  const detail = result.error?.issues[0]?.message ?? "value does not match the supported schema";
  errors.push(`${location} failed domain validation: ${detail}.`);
}

function validateReferences(tables: BackupConfiguration["tables"]): readonly string[] {
  const errors: string[] = [];
  const ids = (tableName: string, column: string) => new Set((tables[tableName] ?? []).map((row) => String(row[column])));
  const collectionIds = ids("alert_collections", "id");
  const ruleIds = ids("alert_rules", "id");
  const variantIds = ids("alert_variants", "id");
  const alertEditorDocumentIds = new Set([...ruleIds, ...variantIds]);
  const assetIds = ids("asset_metadata", "id");
  checkReferences(errors, tables.alert_rule_collections, "rule_id", ruleIds, "alert_rules");
  checkReferences(errors, tables.alert_rule_collections, "collection_id", collectionIds, "alert_collections");
  checkReferences(errors, tables.alert_rule_conditions, "rule_id", ruleIds, "alert_rules");
  checkReferences(errors, tables.alert_variants, "rule_id", ruleIds, "alert_rules");
  checkReferences(errors, tables.alert_set_metadata, "set_id", collectionIds, "alert_collections");
  checkReferences(errors, tables.alert_rule_management_metadata, "rule_id", ruleIds, "alert_rules");
  checkReferences(errors, tables.asset_library_metadata, "asset_id", assetIds, "asset_metadata");
  checkReferences(errors, tables.alert_editor_documents, "alert_id", alertEditorDocumentIds, "alert_rules or alert_variants");
  for (const [index, row] of (tables.alert_variants ?? []).entries()) {
    for (const column of ["visual_asset_id", "audio_asset_id"] as const) {
      const value = row[column];
      if (value !== null && value !== undefined && !assetIds.has(String(value))) {
        errors.push(`alert_variants[${index}].${column} references missing asset_metadata "${String(value)}".`);
      }
    }
  }
  return errors;
}

function checkReferences(
  errors: string[],
  rows: readonly BackupRow[] | undefined,
  column: string,
  targets: ReadonlySet<string>,
  targetTable: string
): void {
  for (const [index, row] of (rows ?? []).entries()) {
    const value = String(row[column]);
    if (!targets.has(value)) errors.push(`${targetTable} does not contain ${column} "${value}" referenced by row ${index}.`);
  }
}
