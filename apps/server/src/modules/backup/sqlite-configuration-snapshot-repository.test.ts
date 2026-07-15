import type { ConfigurationBackupArchive } from "@stream-jams/core";
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
      "alert_editor_documents"
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
    expect(snapshot.overlayOutputs).toEqual([
      { overlayId: "default", scope: "module", moduleId: "alerts", purpose: "live", targetProfileId: "landscape" }
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("credential/provider-token");
    expect(JSON.stringify(snapshot)).not.toContain("route-hash");
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
    durationMs: 5_000,
    layers: [],
    targetProfiles: [
      { id: "landscape", enabled: true, reviewState: "ready", layerLayouts: [] },
      { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [] }
    ],
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: { userName: "James" } }]
  };
}
