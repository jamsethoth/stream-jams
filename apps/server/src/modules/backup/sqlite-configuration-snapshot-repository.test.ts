import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type ConfigurationBackupArchive
} from "@stream-jams/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { SqliteConfigurationSnapshotRepository } from "./sqlite-configuration-snapshot-repository.js";

describe("SqliteConfigurationSnapshotRepository", () => {
  let database: StreamJamsDatabase;

  beforeEach(() => {
    database = createInMemoryStreamJamsDatabase();
    seed(database);
  });

  afterEach(() => database.close());

  it("snapshots the explicit allowlist without provider or route-key secrets", () => {
    const snapshot = new SqliteConfigurationSnapshotRepository(database.connection).snapshot();

    expect(Object.keys(snapshot.tables)).toEqual([
      "overlay_module_config",
      "alert_collections",
      "alert_rules",
      "asset_metadata",
      "provider_registrations",
      "alert_rule_collections",
      "alert_rule_conditions",
      "alert_variants",
      "alert_set_metadata",
      "alert_rule_management_metadata",
      "asset_library_metadata",
      "alert_editor_documents",
      "alert_moderation_settings"
    ]);
    expect(snapshot.tables.provider_registrations?.[0]).toMatchObject({
      id: "provider-twitch",
      active: 1,
      connection_state: "disconnected",
      intake_state: "inactive",
      validated_at: null,
      error_json: null
    });
    expect(snapshot.tables.provider_registrations?.[0]).not.toHaveProperty("secret_ref_json");
    expect(snapshot.tables.asset_metadata?.[0]).not.toHaveProperty("storage_path");
    expect(snapshot.tables.alert_moderation_settings).toEqual([{
      id: 1,
      rendered_max_length: 240,
      rendered_blocked_terms_json: "[]",
      rendered_strip_urls: 0,
      tts_max_length: 180,
      tts_blocked_terms_json: "[]",
      tts_strip_urls: 1
    }]);
    expect(snapshot.overlayOutputs).toEqual([
      { overlayId: "default", scope: "module", moduleId: "alerts", purpose: "live", targetProfileId: "landscape" }
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("credential/provider-token");
    expect(JSON.stringify(snapshot)).not.toContain("route-hash");
    expect(JSON.parse(String(snapshot.tables.alert_editor_documents?.[0]?.document_json))).toMatchObject({
      layers: [{
        textStyle: compatibilityAlertTextStyle,
        boxStyle: compatibilityAlertTextBoxStyle
      }]
    });
  });

  it("round-trips non-default text and box styles through a portable snapshot", () => {
    const expected = styledEditorDocument();
    database.connection.prepare(
      "UPDATE alert_editor_documents SET document_json = ? WHERE alert_id = ?"
    ).run(JSON.stringify(expected), expected.id);
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();
    const configuration: ConfigurationBackupArchive["configuration"] = {
      appConfig: {},
      ...snapshot
    };

    expect(repository.validate(configuration)).toEqual([]);
    repository.replace({
      tables: snapshot.tables,
      assets: [seededAsset()]
    });

    const row = database.connection.prepare(
      "SELECT document_json FROM alert_editor_documents WHERE alert_id = ?"
    ).get(expected.id) as { readonly document_json: string } | undefined;
    expect(row).toBeDefined();
    expect(JSON.parse(String(row?.document_json))).toEqual(expected);
  });

  it("keeps Twitch account state only in operational rollback points", () => {
    database.connection.prepare(
      "INSERT INTO twitch_accounts (account_id, login, display_name, scopes_json, connected_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("old-account", "old", "Old", "[]", "2026-07-15T04:00:00.000Z", "2026-07-15T04:00:00.000Z");
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const portable = repository.snapshot();
    const restorePoint = repository.captureRestorePoint();

    expect(portable.tables).not.toHaveProperty("twitch_accounts");
    repository.replace({
      tables: portable.tables,
      assets: [seededAsset()]
    });
    expect(database.connection.prepare("SELECT account_id FROM twitch_accounts").all()).toEqual([]);

    repository.restoreRestorePoint(restorePoint);
    expect(database.connection.prepare("SELECT account_id FROM twitch_accounts").all()).toEqual([
      { account_id: "old-account" }
    ]);
  });

  it("preserves saved variant order when ids sort differently", () => {
    database.connection.prepare(
      `INSERT INTO alert_variants (
        id, rule_id, name, enabled, weight, visual_asset_id, audio_asset_id,
        text_template, tts_config_json, duration_ms, layout_json,
        conditions_json, priority, variant_order
      )
      SELECT ?, rule_id, ?, enabled, weight, visual_asset_id, audio_asset_id,
        text_template, tts_config_json, duration_ms, layout_json,
        conditions_json, priority, ?
      FROM alert_variants WHERE id = ?`
    ).run("variant-aaa", "Later", 1, "variant-follow");

    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();

    expect(snapshot.tables.alert_variants).toEqual([
      expect.objectContaining({ id: "variant-follow", variant_order: 0 }),
      expect.objectContaining({ id: "variant-aaa", variant_order: 1 })
    ]);

    repository.replace({
      tables: snapshot.tables,
      assets: [seededAsset()]
    });
    expect(database.connection.prepare(
      "SELECT id, variant_order FROM alert_variants ORDER BY variant_order, id"
    ).all()).toEqual([
      { id: "variant-follow", variant_order: 0 },
      { id: "variant-aaa", variant_order: 1 }
    ]);
  });

  it("keeps portable table mappings aligned with migrated columns", () => {
    const snapshot = new SqliteConfigurationSnapshotRepository(database.connection).snapshot();
    const intentionallyExcludedColumns = new Map([
      ["asset_metadata", new Set(["storage_path"])],
      ["provider_registrations", new Set(["secret_ref_json"])],
      ["alert_moderation_settings", new Set(["updated_at"])]
    ]);

    for (const [tableName, rows] of Object.entries(snapshot.tables)) {
      const firstRow = rows[0];
      if (firstRow === undefined) throw new Error(`Seeded row required for ${tableName}`);
      const excluded = intentionallyExcludedColumns.get(tableName) ?? new Set<string>();
      const migratedColumns = database.connection
        .prepare(`PRAGMA table_xinfo(${tableName})`)
        .all()
        .map((row) => String(row.name))
        .filter((name) => !excluded.has(name));

      expect(Object.keys(firstRow), tableName).toEqual(migratedColumns);
    }
  });

  it("round-trips nullable JSON columns as SQL null", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();
    const configuration: ConfigurationBackupArchive["configuration"] = {
      appConfig: {},
      ...snapshot
    };

    expect(snapshot.tables.alert_variants?.[0]?.tts_config_json).toBeNull();
    expect(repository.validate(configuration)).toEqual([]);
    repository.replace({ tables: snapshot.tables, assets: [seededAsset()] });
    expect(database.connection.prepare("SELECT tts_config_json FROM alert_variants").get()).toEqual({
      tts_config_json: null
    });
  });

  it("reports unknown tables, invalid columns, and broken soft asset references", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();
    const configuration: ConfigurationBackupArchive["configuration"] = {
      appConfig: {},
      ...snapshot,
      tables: {
        ...snapshot.tables,
        alert_variants: snapshot.tables.alert_variants?.map((row) => ({ ...row, visual_asset_id: "missing-asset", extra: true })) ?? [],
        provider_registrations: snapshot.tables.provider_registrations?.map((row) => ({ ...row, non_secret_config_json: '{"accessToken":"must-not-export"}' })) ?? [],
        unexpected: []
      }
    };

    expect(repository.validate(configuration)).toEqual(expect.arrayContaining([
      expect.stringContaining("unexpected"),
      expect.stringContaining("extra"),
      expect.stringContaining("missing-asset"),
      expect.stringContaining("accessToken")
    ]));
  });

  it("rejects missing, duplicate, malformed, and secret-shaped moderation policy rows", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();
    const [policy] = snapshot.tables.alert_moderation_settings ?? [];
    if (policy === undefined) throw new Error("Seeded moderation policy is required");
    const configuration: ConfigurationBackupArchive["configuration"] = {
      appConfig: {},
      ...snapshot,
      tables: {
        ...snapshot.tables,
        alert_moderation_settings: [
          { ...policy, id: 2, rendered_max_length: 10_001, rendered_strip_urls: 2, rendered_blocked_terms_json: "[1]", credential: "viewer-secret" },
          { ...policy, tts_max_length: 1.5, tts_strip_urls: -1, tts_blocked_terms_json: "{}" }
        ]
      }
    };

    expect(repository.validate(configuration)).toEqual(expect.arrayContaining([
      expect.stringContaining("unsupported columns: credential"),
      expect.stringContaining("must contain exactly one row"),
      expect.stringContaining("id must equal 1"),
      expect.stringContaining("invalid moderation settings")
    ]));

    const missing = {
      ...configuration,
      tables: { ...configuration.tables, alert_moderation_settings: [] }
    };
    expect(repository.validate(missing)).toContain("alert_moderation_settings must contain exactly one row.");
  });

  it("rejects negative and duplicate per-rule variant order values", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();
    const [variant] = snapshot.tables.alert_variants ?? [];
    if (variant === undefined) throw new Error("Seeded variant is required");
    const configuration: ConfigurationBackupArchive["configuration"] = {
      appConfig: {},
      ...snapshot,
      tables: {
        ...snapshot.tables,
        alert_variants: [
          { ...variant, variant_order: -1 },
          { ...variant, id: "variant-second", variant_order: -1 }
        ]
      }
    };

    expect(repository.validate(configuration)).toEqual(expect.arrayContaining([
      expect.stringContaining("variant_order must be a non-negative integer"),
      expect.stringContaining("duplicates the unique key (rule_id, variant_order)")
    ]));
  });

  it("rejects semantically invalid alert, editor, provider, and asset metadata rows", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();
    const configuration: ConfigurationBackupArchive["configuration"] = {
      appConfig: {},
      ...snapshot,
      tables: {
        ...snapshot.tables,
        alert_rules: snapshot.tables.alert_rules?.map((row) => ({ ...row, event_type: "not-an-event" })) ?? [],
        alert_editor_documents: snapshot.tables.alert_editor_documents?.map((row) => ({ ...row, document_json: "{}" })) ?? [],
        asset_library_metadata: snapshot.tables.asset_library_metadata?.map((row) => ({ ...row, tags_json: '{"not":"tags"}' })) ?? [],
        provider_registrations: snapshot.tables.provider_registrations?.map((row) => ({ ...row, kind: "unknown-provider" })) ?? []
      }
    };

    expect(repository.validate(configuration)).toEqual(expect.arrayContaining([
      expect.stringContaining("alert_rules"),
      expect.stringContaining("alert_editor_documents"),
      expect.stringContaining("asset_library_metadata"),
      expect.stringContaining("provider_registrations")
    ]));
  });

  it("validates and restores a variation-keyed editor document", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();
    const variationDocument = {
      ...editorDocument(),
      id: "variant-follow",
      kind: "variation",
      parentAlertId: "alert-follow"
    };
    const tables = {
      ...snapshot.tables,
      alert_editor_documents: [
        ...(snapshot.tables.alert_editor_documents ?? []),
        {
          alert_id: "variant-follow",
          document_json: JSON.stringify(variationDocument),
          updated_at: "2026-07-15T04:00:00.000Z"
        }
      ]
    };
    const configuration: ConfigurationBackupArchive["configuration"] = {
      appConfig: {},
      tables,
      providerReconnectMetadata: [],
      overlayOutputs: []
    };

    expect(repository.validate(configuration)).toEqual([]);
    repository.replace({ tables, assets: [seededAsset()] });
    expect(database.connection.prepare("SELECT alert_id FROM alert_editor_documents ORDER BY alert_id").all()).toEqual([
      { alert_id: "alert-follow" },
      { alert_id: "variant-follow" }
    ]);
  });

  it("rejects duplicate keys and multiple active sets or providers before insertion", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();
    const [firstCollection] = snapshot.tables.alert_collections ?? [];
    const [firstProvider] = snapshot.tables.provider_registrations ?? [];
    if (firstCollection === undefined || firstProvider === undefined) {
      throw new Error("Seeded collection and provider are required");
    }
    const configuration: ConfigurationBackupArchive["configuration"] = {
      appConfig: {},
      ...snapshot,
      tables: {
        ...snapshot.tables,
        alert_collections: [
          firstCollection,
          { ...firstCollection, id: "set-second", name: "EVERYDAY", enabled: 1 }
        ],
        provider_registrations: [
          firstProvider,
          { ...firstProvider, id: "provider-second", name: "Second Twitch", active: 1 }
        ]
      }
    };

    expect(repository.validate(configuration)).toEqual(expect.arrayContaining([
      expect.stringContaining("name case-insensitively"),
      expect.stringContaining("more than one active alert set"),
      expect.stringContaining("active provider for capability")
    ]));
  });

  it("requires at least one alert set and exactly one active alert set", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();
    const withoutSets: ConfigurationBackupArchive["configuration"] = {
      appConfig: {},
      ...snapshot,
      tables: {
        ...snapshot.tables,
        alert_collections: [],
        alert_rule_collections: [],
        alert_set_metadata: []
      }
    };
    const withoutActiveSet: ConfigurationBackupArchive["configuration"] = {
      appConfig: {},
      ...snapshot,
      tables: {
        ...snapshot.tables,
        alert_collections: snapshot.tables.alert_collections?.map((row) => ({ ...row, enabled: 0 })) ?? []
      }
    };

    expect(repository.validate(withoutSets)).toEqual(expect.arrayContaining([
      "alert_collections must contain at least one alert set.",
      "alert_collections must contain exactly one active alert set."
    ]));
    expect(repository.validate(withoutActiveSet)).toContain(
      "alert_collections must contain exactly one active alert set."
    );
  });

  it("replaces all owned rows in one transaction and removes existing route keys", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const snapshot = repository.snapshot();
    const tables = structuredClone(snapshot.tables);
    tables.alert_collections = [{ id: "set-restored", name: "Restored", enabled: 1 }];
    tables.alert_rules = [];
    tables.alert_rule_collections = [];
    tables.alert_rule_conditions = [];
    tables.alert_variants = [];
    tables.alert_set_metadata = [{ set_id: "set-restored", starter: 0, starter_review_state: "complete", landscape_enabled: 1, landscape_review_state: "ready", vertical_enabled: 0, vertical_review_state: "needs-review" }];
    tables.alert_rule_management_metadata = [];
    tables.alert_editor_documents = [];
    tables.asset_metadata = [{ id: "asset-restored", original_file_name: "restored.png", media_type: "image", mime_type: "image/png", size_bytes: 8, checksum: `sha256:${"a".repeat(64)}` }];
    tables.asset_library_metadata = [{ asset_id: "asset-restored", display_name: "Restored", tags_json: "[]", created_at: "2026-07-15T05:00:00.000Z", updated_at: "2026-07-15T05:00:00.000Z" }];

    repository.replace({
      tables,
      assets: [{ id: "asset-restored", originalFileName: "restored.png", mediaType: "image", mimeType: "image/png", sizeBytes: 8, checksum: `sha256:${"a".repeat(64)}`, storagePath: "image/asset-restored-restore.png" }]
    });

    expect(database.connection.prepare("SELECT id FROM alert_collections").all()).toEqual([{ id: "set-restored" }]);
    expect(database.connection.prepare("SELECT id, storage_path FROM asset_metadata").all()).toEqual([{ id: "asset-restored", storage_path: "image/asset-restored-restore.png" }]);
    expect(database.connection.prepare("SELECT id FROM overlay_keys").all()).toEqual([]);
  });

  it("restores a rollback point with provider secret mappings and overlay route keys intact", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const restorePoint = repository.captureRestorePoint();

    database.connection.prepare("DELETE FROM overlay_keys").run();
    database.connection.prepare("UPDATE provider_registrations SET secret_ref_json = '{}', connection_state = 'disconnected'").run();
    repository.restoreRestorePoint(restorePoint);

    expect(database.connection.prepare("SELECT secret_ref_json, connection_state FROM provider_registrations").get()).toEqual({
      secret_ref_json: '{"namespace":"provider","name":"token"}',
      connection_state: "connected"
    });
    expect(database.connection.prepare("SELECT key_hash, route_key_secret_ref_json FROM overlay_keys").get()).toEqual({
      key_hash: "route-hash",
      route_key_secret_ref_json: '{"namespace":"overlay-route-key","name":"key-live"}'
    });
  });

  it("replaces moderation policy with configuration rows and restores its prior row from a rollback point", () => {
    const repository = new SqliteConfigurationSnapshotRepository(database.connection);
    const restorePoint = repository.captureRestorePoint();
    const snapshot = repository.snapshot();
    const tables = structuredClone(snapshot.tables);
    tables.alert_moderation_settings = [{
      id: 1,
      rendered_max_length: 320,
      rendered_blocked_terms_json: '["rendered-blocked"]',
      rendered_strip_urls: 1,
      tts_max_length: 200,
      tts_blocked_terms_json: '["tts-blocked"]',
      tts_strip_urls: 0
    }];

    repository.replace({ tables, assets: [seededAsset()] });
    expect(database.connection.prepare(
      "SELECT rendered_max_length, rendered_blocked_terms_json, rendered_strip_urls, tts_max_length, tts_blocked_terms_json, tts_strip_urls FROM alert_moderation_settings"
    ).get()).toEqual({
      rendered_max_length: 320,
      rendered_blocked_terms_json: '["rendered-blocked"]',
      rendered_strip_urls: 1,
      tts_max_length: 200,
      tts_blocked_terms_json: '["tts-blocked"]',
      tts_strip_urls: 0
    });

    repository.restoreRestorePoint(restorePoint);
    expect(database.connection.prepare(
      "SELECT rendered_max_length, rendered_blocked_terms_json, rendered_strip_urls, tts_max_length, tts_blocked_terms_json, tts_strip_urls FROM alert_moderation_settings"
    ).get()).toEqual({
      rendered_max_length: 240,
      rendered_blocked_terms_json: "[]",
      rendered_strip_urls: 0,
      tts_max_length: 180,
      tts_blocked_terms_json: "[]",
      tts_strip_urls: 1
    });
  });
});

function seed(database: StreamJamsDatabase): void {
  const db = database.connection;
  db.prepare("INSERT INTO overlay_module_config VALUES (?, ?, ?, ?)").run("alerts", 1, "{}", "2026-07-15T04:00:00.000Z");
  db.prepare("INSERT INTO alert_collections VALUES (?, ?, ?)").run("set-default", "Everyday", 1);
  db.prepare("INSERT INTO alert_rules VALUES (?, ?, ?, ?, ?, ?)").run("alert-follow", "Follow", "follow", 1, 0, 0);
  db.prepare("INSERT INTO alert_rule_collections VALUES (?, ?)").run("alert-follow", "set-default");
  db.prepare("INSERT INTO alert_rule_conditions VALUES (?, ?, ?, ?, ?)").run("alert-follow", 0, "actor.id", "equals", '"actor-1"');
  db.prepare("INSERT INTO asset_metadata VALUES (?, ?, ?, ?, ?, ?, ?)").run("asset-follow", "follow.png", "image", "image/png", 8, `sha256:${"a".repeat(64)}`, "image/asset-follow.png");
  db.prepare("INSERT INTO alert_variants (id, rule_id, name, enabled, weight, visual_asset_id, audio_asset_id, text_template, tts_config_json, duration_ms, layout_json, conditions_json, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("variant-follow", "alert-follow", "Default", 1, 1, "asset-follow", null, "Thanks", null, 5000, '{"x":0,"y":0,"width":100,"height":100,"zIndex":0}', "[]", 0);
  db.prepare("INSERT INTO alert_set_metadata VALUES (?, ?, ?, ?, ?, ?, ?)").run("set-default", 0, "complete", 1, "ready", 0, "needs-review");
  db.prepare("INSERT INTO alert_rule_management_metadata VALUES (?, ?, ?, ?)").run("alert-follow", "twitch", "ready", '["landscape"]');
  db.prepare("INSERT INTO asset_library_metadata VALUES (?, ?, ?, ?, ?)").run("asset-follow", "Follow", '["seasonal"]', "2026-07-15T04:00:00.000Z", "2026-07-15T04:00:00.000Z");
  db.prepare("INSERT INTO alert_editor_documents VALUES (?, ?, ?)").run("alert-follow", JSON.stringify(editorDocument()), "2026-07-15T04:00:00.000Z");
  db.prepare("INSERT INTO provider_registrations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("provider-twitch", "Twitch", "twitch", "event-source", "{}", '{"namespace":"provider","name":"token"}', 1, "connected", "active", "2026-07-15T04:00:00.000Z", '{"cause":"oauth"}', "[]", null, "2026-07-15T04:00:00.000Z", "2026-07-15T04:00:00.000Z");
  db.prepare("INSERT INTO overlay_keys (id, overlay_id, module_id, purpose, scope, key_hash, created_at, revoked_at, route_key_secret_ref_json, target_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("key-live", "default", "alerts", "live", "module", "route-hash", "2026-07-15T04:00:00.000Z", null, '{"namespace":"overlay-route-key","name":"key-live"}', "landscape");
}

function editorDocument() {
  return {
    id: "alert-follow",
    setId: "set-default",
    providerKind: "twitch",
    eventType: "follow",
    kind: "default",
    parentAlertId: null,
    name: "Follow",
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: 0,
    rulePriority: 0,
    durationMs: 5_000,
    layers: [{
      id: "layer-text",
      name: "Message",
      type: "text",
      visible: true,
      order: 0,
      template: "Thanks",
      textStyle: structuredClone(compatibilityAlertTextStyle),
      boxStyle: structuredClone(compatibilityAlertTextBoxStyle),
      animation: {
        mode: "preset",
        entrance: "fade",
        exit: "fade",
        durationMs: 300,
        delayMs: 0,
        easing: "ease-out"
      }
    }],
    targetProfiles: [
      {
        id: "landscape",
        enabled: true,
        reviewState: "ready",
        layerLayouts: [{ layerId: "layer-text", x: 0, y: 0, width: 100, height: 100, zIndex: 0 }]
      },
      {
        id: "vertical",
        enabled: false,
        reviewState: "needs-review",
        layerLayouts: [{ layerId: "layer-text", x: 0, y: 0, width: 100, height: 100, zIndex: 0 }]
      }
    ],
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: { userName: "James" } }]
  };
}

function styledEditorDocument() {
  const document = editorDocument();
  return {
    ...document,
    layers: document.layers.map((layer) => layer.type === "text" ? {
      ...layer,
      textStyle: {
        fontPreset: "serif" as const,
        fontSizePx: 64,
        fontWeight: 700 as const,
        lineHeight: 1.3,
        horizontalAlign: "left" as const,
        verticalAlign: "bottom" as const,
        color: "#FFCC00BF" as const,
        shadow: { offsetX: -4, offsetY: 6, blur: 12, color: "#00000080" as const }
      },
      boxStyle: {
        backgroundColor: "#102030BF" as const,
        paddingPx: 24,
        cornerRadiusPx: 18,
        shadow: { offsetX: 4, offsetY: 8, blur: 20, color: "#ABCDEF66" as const }
      }
    } : layer)
  };
}

function seededAsset() {
  return {
    id: "asset-follow",
    originalFileName: "follow.png",
    mediaType: "image" as const,
    mimeType: "image/png",
    sizeBytes: 8,
    checksum: `sha256:${"a".repeat(64)}`,
    storagePath: "image/asset-follow.png"
  };
}
