import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, runInTransaction } from "./database.js";
import { variantAlertEditorDocumentsMigration } from "./migrations/010-variant-alert-editor-documents.js";
import { revokeUnsupportedOverlayKeysMigration } from "./migrations/012-revoke-unsupported-overlay-keys.js";
import { alertVariantAssetForeignKeysMigration } from "./migrations/015-alert-variant-asset-foreign-keys.js";
import { overlayKeyLookupIndexesMigration } from "./migrations/016-overlay-key-lookup-indexes.js";

const expectedMigrations = [
  "001-initial-schema",
  "002-alert-variant-selection",
  "003-twitch-accounts",
  "004-overlay-key-secret-ref",
  "005-provider-registrations",
  "006-overlay-key-target-profile",
  "007-alert-set-management",
  "008-asset-library-metadata",
  "009-alert-editor-documents",
  "010-variant-alert-editor-documents",
  "011-alert-variant-order",
  "012-revoke-unsupported-overlay-keys",
  "013-alert-read-indexes",
  "014-diagnostic-order-indexes",
  "015-alert-variant-asset-foreign-keys",
  "016-overlay-key-lookup-indexes"
] as const;

const expectedTables = [
  "alert_collections",
  "alert_editor_documents",
  "alert_match_logs",
  "alert_rule_collections",
  "alert_rule_conditions",
  "alert_rule_management_metadata",
  "alert_rules",
  "alert_set_metadata",
  "alert_variants",
  "asset_library_metadata",
  "asset_metadata",
  "event_logs",
  "overlay_keys",
  "overlay_module_config",
  "playback_logs",
  "provider_registrations",
  "schema_migrations",
  "twitch_accounts"
];

describe("Stream Jams SQLite database", () => {
  it("initializes deterministic tables and records each migration once", () => {
    using database = createInMemoryStreamJamsDatabase();

    expect(listTables(database.connection)).toEqual(expectedTables);
    expect(listAppliedMigrations(database.connection)).toEqual(expectedMigrations);

    database.runMigrations();

    expect(listAppliedMigrations(database.connection)).toEqual(expectedMigrations);

    expect(
      database.connection.prepare("PRAGMA table_info(overlay_keys)").all().map((column) => String(column.name))
    ).toContain("target_profile_id");
  });

  it("enforces foreign keys for child records", () => {
    using database = createInMemoryStreamJamsDatabase();

    expect(() =>
      database.connection
        .prepare(
          `INSERT INTO alert_variants (
            id,
            rule_id,
            name,
            enabled,
            weight,
            visual_asset_id,
            audio_asset_id,
            text_template,
            tts_config_json,
            duration_ms,
            layout_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "variant-missing-rule",
          "rule-missing",
          "Default",
          1,
          1,
          null,
          null,
          "Thanks!",
          null,
          5000,
          JSON.stringify({ x: 0, y: 0, width: 100, height: 100, zIndex: 1 })
        )
    ).toThrow(/foreign key/i);
  });

  it("uses collection-first and deterministic variant-order indexes for hot alert reads", () => {
    using database = createInMemoryStreamJamsDatabase();

    const membershipPlan = database.connection
      .prepare("EXPLAIN QUERY PLAN SELECT rule_id FROM alert_rule_collections WHERE collection_id = ?")
      .all("set-default")
      .map((row) => String(row.detail));
    const activeRulePlan = database.connection
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT rules.id, rules.name, rules.event_type, rules.enabled,
                rules.cooldown_seconds, rules.priority
         FROM alert_collections AS collections
         JOIN alert_rule_collections AS memberships ON memberships.collection_id = collections.id
         JOIN alert_rules AS rules ON rules.id = memberships.rule_id
         WHERE collections.enabled = 1
           AND rules.enabled = 1
           AND rules.event_type = ?
         ORDER BY memberships.rule_id`
      )
      .all("follow")
      .map((row) => String(row.detail));
    const variantPlan = database.connection
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT id FROM alert_variants WHERE rule_id = ? ORDER BY variant_order, id`
      )
      .all("alert-follow")
      .map((row) => String(row.detail));

    expect(membershipPlan.join("\n")).toContain("alert_rule_collections_collection_rule_idx");
    const activeRulePlanText = activeRulePlan.join("\n");
    expect(activeRulePlanText).toContain("alert_collections_one_active_set");
    expect(activeRulePlanText).toContain("alert_rule_collections_collection_rule_idx");
    expect(activeRulePlanText).toContain("sqlite_autoindex_alert_rules_1");
    expect(activeRulePlanText).not.toContain("USE TEMP B-TREE");
    expect(variantPlan.join("\n")).toContain("alert_variants_rule_order_idx");
    expect(variantPlan.join("\n")).not.toContain("USE TEMP B-TREE");
  });

  it("uses composite diagnostic indexes for newest-first reads and retention cutoffs", () => {
    using database = createInMemoryStreamJamsDatabase();
    const cases = [
      ["event_logs", "received_at", "event_logs_received_order_idx"],
      ["alert_match_logs", "matched_at", "alert_match_logs_matched_order_idx"],
      ["playback_logs", "occurred_at", "playback_logs_occurred_order_idx"]
    ] as const;

    for (const [table, timestampColumn, index] of cases) {
      const newestPlan = database.connection
        .prepare(`EXPLAIN QUERY PLAN SELECT id FROM ${table} ORDER BY ${timestampColumn} DESC, id DESC LIMIT ?`)
        .all(200)
        .map((row) => String(row.detail));
      const cutoffPlan = database.connection
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT id FROM ${table}
           WHERE ${timestampColumn} < ?
           ORDER BY ${timestampColumn}, id
           LIMIT ?`
        )
        .all("2026-07-01T00:00:00.000Z", 500)
        .map((row) => String(row.detail));

      expect(newestPlan.join("\n")).toContain(index);
      expect(newestPlan.join("\n")).not.toContain("USE TEMP B-TREE");
      expect(cutoffPlan.join("\n")).toContain(index);
      expect(cutoffPlan.join("\n")).not.toContain("USE TEMP B-TREE");
    }
  });

  it("uses exact overlay hash and output-history indexes without redundant prefixes", () => {
    using database = createInMemoryStreamJamsDatabase();
    const db = database.connection;
    const hashPlan = db
      .prepare("EXPLAIN QUERY PLAN SELECT id FROM overlay_keys WHERE key_hash = ?")
      .all("sha256:test")
      .map((row) => String(row.detail));
    const outputPlan = db
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT id FROM overlay_keys
         WHERE overlay_id = ?
           AND module_id IS ?
           AND purpose = ?
           AND scope = ?
           AND target_profile_id IS ?
         ORDER BY created_at, id`
      )
      .all("default", "alerts", "live", "module", null)
      .map((row) => String(row.detail));
    const indexes = db.prepare("PRAGMA index_list(overlay_keys)").all();

    expect(hashPlan.join("\n")).toContain("overlay_keys_key_hash_unique");
    expect(outputPlan.join("\n")).toContain("overlay_keys_output_history_idx");
    expect(outputPlan.join("\n")).not.toContain("USE TEMP B-TREE");
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "overlay_keys_key_hash_unique", unique: 1 }),
      expect.objectContaining({ name: "overlay_keys_output_history_idx" })
    ]));
    expect(indexes.map((row) => String(row.name))).not.toEqual(expect.arrayContaining([
      "overlay_keys_overlay_id_idx",
      "overlay_keys_output_idx"
    ]));
  });

  it("rejects duplicate overlay key hashes", () => {
    using database = createInMemoryStreamJamsDatabase();
    const insert = database.connection.prepare(
      `INSERT INTO overlay_keys (
         id, overlay_id, module_id, purpose, scope, target_profile_id,
         key_hash, route_key_secret_ref_json, created_at, revoked_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run(
      "key-1",
      "default",
      "alerts",
      "live",
      "module",
      null,
      "sha256:same",
      null,
      "2026-07-20T00:00:00.000Z",
      null
    );

    expect(() =>
      insert.run(
        "key-2",
        "default",
        "alerts",
        "live",
        "module",
        null,
        "sha256:same",
        null,
        "2026-07-20T00:01:00.000Z",
        null
      )
    ).toThrow(/unique/i);
  });

  it("aborts overlay hash hardening before changing indexes when duplicate hashes exist", () => {
    const connection = new DatabaseSync(":memory:");
    try {
      connection.exec(`
        CREATE TABLE overlay_keys (
          id TEXT PRIMARY KEY NOT NULL,
          overlay_id TEXT NOT NULL,
          module_id TEXT,
          purpose TEXT NOT NULL,
          scope TEXT NOT NULL,
          target_profile_id TEXT,
          key_hash TEXT NOT NULL,
          route_key_secret_ref_json TEXT,
          created_at TEXT NOT NULL,
          revoked_at TEXT
        );
        CREATE INDEX overlay_keys_overlay_id_idx ON overlay_keys(overlay_id);
        CREATE INDEX overlay_keys_output_idx
          ON overlay_keys(overlay_id, scope, module_id, target_profile_id, purpose);
        INSERT INTO overlay_keys (
          id, overlay_id, module_id, purpose, scope, key_hash, created_at
        ) VALUES
          ('key-1', 'default', 'alerts', 'live', 'module', 'sha256:same', '2026-07-20T00:00:00.000Z'),
          ('key-2', 'default', 'alerts', 'live', 'module', 'sha256:same', '2026-07-20T00:01:00.000Z');
        BEGIN IMMEDIATE;
      `);

      expect(() => connection.exec(overlayKeyLookupIndexesMigration.sql)).toThrow(/check constraint/i);
      connection.exec("ROLLBACK");
      expect(connection.prepare("PRAGMA index_list(overlay_keys)").all().map((row) => String(row.name))).toEqual(
        expect.arrayContaining(["overlay_keys_overlay_id_idx", "overlay_keys_output_idx"])
      );
    } finally {
      connection.close();
    }
  });

  it.each([
    {
      name: "a future migration ID",
      mutate(connection: DatabaseSync) {
        connection.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
          .run("999-future-migration", "2026-07-20T00:00:00.000Z");
      }
    },
    {
      name: "an unknown migration ID",
      mutate(connection: DatabaseSync) {
        connection.prepare("UPDATE schema_migrations SET id = ? WHERE id = ?")
          .run("015-local-unknown", "015-alert-variant-asset-foreign-keys");
      }
    },
    {
      name: "a gap",
      mutate(connection: DatabaseSync) {
        connection.prepare("DELETE FROM schema_migrations WHERE id = ?").run("015-alert-variant-asset-foreign-keys");
      }
    },
    {
      name: "reordered IDs",
      mutate(connection: DatabaseSync) {
        const update = connection.prepare("UPDATE schema_migrations SET id = ? WHERE id = ?");
        update.run("migration-swap", "015-alert-variant-asset-foreign-keys");
        update.run("015-alert-variant-asset-foreign-keys", "016-overlay-key-lookup-indexes");
        update.run("016-overlay-key-lookup-indexes", "migration-swap");
      }
    }
  ])("rejects $name before applying another migration", ({ mutate }) => {
    using database = createInMemoryStreamJamsDatabase();
    mutate(database.connection);
    const countStatement = database.connection.prepare("SELECT COUNT(*) AS count FROM schema_migrations");
    const countBefore = Number(countStatement.get()?.count);

    expect(() => database.runMigrations()).toThrow(/migration history/i);
    expect(Number(countStatement.get()?.count)).toBe(countBefore);
  });

  it("upgrades a valid migration prefix and reopens idempotently", () => {
    using database = createInMemoryStreamJamsDatabase();
    database.connection.exec(`
      DROP INDEX overlay_keys_key_hash_unique;
      DROP INDEX overlay_keys_output_history_idx;
      CREATE INDEX overlay_keys_overlay_id_idx ON overlay_keys(overlay_id);
      CREATE INDEX overlay_keys_output_idx
        ON overlay_keys(overlay_id, scope, module_id, target_profile_id, purpose);
      DELETE FROM schema_migrations WHERE id = '016-overlay-key-lookup-indexes';
    `);

    database.runMigrations();
    database.runMigrations();

    expect(listAppliedMigrations(database.connection)).toEqual(expectedMigrations);
    expect(database.connection.prepare("PRAGMA index_list(overlay_keys)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "overlay_keys_key_hash_unique", unique: 1 }),
      expect.objectContaining({ name: "overlay_keys_output_history_idx" })
    ]));
  });

  it("allows editor documents for rules or variants and removes them with their owner", () => {
    using database = createInMemoryStreamJamsDatabase();
    const db = database.connection;
    db.prepare("INSERT INTO alert_collections (id, name, enabled) VALUES (?, ?, ?)").run("set-default", "Default", 1);
    db.prepare("INSERT INTO alert_rules (id, name, event_type, enabled, cooldown_seconds, priority) VALUES (?, ?, ?, ?, ?, ?)")
      .run("alert-follow", "Follow", "follow", 1, 0, 0);
    db.prepare(
      `INSERT INTO alert_variants (
        id, rule_id, name, enabled, weight, visual_asset_id, audio_asset_id,
        text_template, tts_config_json, duration_ms, layout_json, conditions_json, priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("variant-follow", "alert-follow", "Default", 1, 1, null, null, "{userName}", null, 5_000, "{}", "[]", 0);

    const insertDocument = db.prepare(
      "INSERT INTO alert_editor_documents (alert_id, document_json, updated_at) VALUES (?, ?, ?)"
    );
    insertDocument.run("alert-follow", "{}", "2026-07-18T00:00:00.000Z");
    insertDocument.run("variant-follow", "{}", "2026-07-18T00:00:00.000Z");
    expect(() => insertDocument.run("missing", "{}", "2026-07-18T00:00:00.000Z")).toThrow(/alert editor document owner/i);

    db.prepare("DELETE FROM alert_variants WHERE id = ?").run("variant-follow");
    expect(db.prepare("SELECT alert_id FROM alert_editor_documents ORDER BY alert_id").all()).toEqual([{ alert_id: "alert-follow" }]);

    db.prepare("DELETE FROM alert_rules WHERE id = ?").run("alert-follow");
    expect(db.prepare("SELECT alert_id FROM alert_editor_documents").all()).toEqual([]);
  });

  it("enforces restrictive variant asset references and preserves rebuilt indexes and triggers", () => {
    using database = createInMemoryStreamJamsDatabase();
    const db = database.connection;
    db.prepare("INSERT INTO alert_collections (id, name, enabled) VALUES (?, ?, ?)").run("set-default", "Default", 1);
    db.prepare("INSERT INTO alert_rules (id, name, event_type, enabled, cooldown_seconds, priority) VALUES (?, ?, ?, ?, ?, ?)")
      .run("alert-follow", "Follow", "follow", 1, 0, 0);
    db.prepare(
      "INSERT INTO asset_metadata (id, original_file_name, media_type, mime_type, size_bytes, checksum, storage_path) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run("asset-visual", "visual.png", "image", "image/png", 1, "sha256:test", "visual.png");
    db.prepare(
      `INSERT INTO alert_variants (
         id, rule_id, name, enabled, weight, visual_asset_id, audio_asset_id,
         text_template, tts_config_json, duration_ms, layout_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("variant-follow", "alert-follow", "Default", 1, 1, "asset-visual", null, "Thanks", null, 5_000, "{}");

    expect(() => db.prepare("DELETE FROM asset_metadata WHERE id = ?").run("asset-visual")).toThrow(/foreign key/i);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("PRAGMA foreign_key_list(alert_variants)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: "visual_asset_id", table: "asset_metadata", on_delete: "RESTRICT" }),
      expect.objectContaining({ from: "audio_asset_id", table: "asset_metadata", on_delete: "RESTRICT" })
    ]));
    const indexes = db.prepare("PRAGMA index_list(alert_variants)").all().map((row) => String(row.name));
    expect(indexes).toEqual(expect.arrayContaining([
      "alert_variants_rule_order_idx",
      "alert_variants_visual_asset_idx",
      "alert_variants_audio_asset_idx"
    ]));
    const triggers = db.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'alert_editor_documents_%' ORDER BY name"
    ).all().map((row) => String(row.name));
    expect(triggers).toEqual([
      "alert_editor_documents_delete_rule",
      "alert_editor_documents_delete_variant",
      "alert_editor_documents_validate_owner_insert",
      "alert_editor_documents_validate_owner_update"
    ]);
  });

  it("aborts the asset-reference rebuild before destructive DDL when dangling references exist", () => {
    const connection = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    try {
      connection.exec(`
        CREATE TABLE alert_rules (id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE asset_metadata (id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE alert_variants (
          id TEXT PRIMARY KEY NOT NULL,
          rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
          weight INTEGER NOT NULL CHECK (weight > 0),
          visual_asset_id TEXT,
          audio_asset_id TEXT,
          text_template TEXT NOT NULL,
          tts_config_json TEXT,
          duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
          layout_json TEXT NOT NULL,
          conditions_json TEXT NOT NULL DEFAULT '[]',
          priority INTEGER NOT NULL DEFAULT 0,
          variant_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX alert_variants_rule_order_idx ON alert_variants(rule_id, variant_order, id);
        CREATE TABLE alert_editor_documents (alert_id TEXT PRIMARY KEY NOT NULL);
        CREATE TRIGGER alert_editor_documents_validate_owner_insert BEFORE INSERT ON alert_editor_documents BEGIN SELECT 1; END;
        CREATE TRIGGER alert_editor_documents_validate_owner_update BEFORE UPDATE ON alert_editor_documents BEGIN SELECT 1; END;
        CREATE TRIGGER alert_editor_documents_delete_variant AFTER DELETE ON alert_variants BEGIN SELECT 1; END;
        INSERT INTO alert_rules (id) VALUES ('alert-follow');
        INSERT INTO alert_variants (
          id, rule_id, name, enabled, weight, visual_asset_id, audio_asset_id,
          text_template, duration_ms, layout_json
        ) VALUES ('variant-follow', 'alert-follow', 'Default', 1, 1, 'missing-asset', NULL, 'Thanks', 5000, '{}');
        BEGIN IMMEDIATE;
      `);

      expect(() => connection.exec(alertVariantAssetForeignKeysMigration.sql)).toThrow(/check constraint/i);
      connection.exec("ROLLBACK");
      expect(connection.prepare("SELECT visual_asset_id FROM alert_variants").get()).toEqual({
        visual_asset_id: "missing-asset"
      });
      expect(connection.prepare("PRAGMA foreign_key_list(alert_variants)").all()).toEqual([
        expect.objectContaining({ from: "rule_id", table: "alert_rules" })
      ]);
    } finally {
      connection.close();
    }
  });

  it("migrates existing rule documents without losing them before allowing variation documents", () => {
    const connection = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    try {
      connection.exec(`
        CREATE TABLE alert_rules (id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE alert_variants (
          id TEXT PRIMARY KEY NOT NULL,
          rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE
        );
        CREATE TABLE alert_editor_documents (
          alert_id TEXT PRIMARY KEY NOT NULL,
          document_json TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (alert_id) REFERENCES alert_rules(id) ON DELETE CASCADE
        );
        INSERT INTO alert_rules (id) VALUES ('alert-follow');
        INSERT INTO alert_variants (id, rule_id) VALUES ('variant-follow', 'alert-follow');
        INSERT INTO alert_editor_documents (alert_id, document_json, updated_at)
        VALUES ('alert-follow', '{"id":"alert-follow"}', '2026-07-18T00:00:00.000Z');
      `);

      connection.exec(variantAlertEditorDocumentsMigration.sql);
      connection.prepare("INSERT INTO alert_editor_documents (alert_id, document_json, updated_at) VALUES (?, ?, ?)")
        .run("variant-follow", '{"id":"variant-follow"}', "2026-07-18T00:00:00.000Z");

      expect(connection.prepare("SELECT alert_id FROM alert_editor_documents ORDER BY alert_id").all()).toEqual([
        { alert_id: "alert-follow" },
        { alert_id: "variant-follow" }
      ]);
    } finally {
      connection.close();
    }
  });

  it("revokes active overlay keys that use unsupported legacy purposes", () => {
    const connection = new DatabaseSync(":memory:");
    try {
      connection.exec(`
        CREATE TABLE overlay_keys (
          id TEXT PRIMARY KEY NOT NULL,
          purpose TEXT NOT NULL,
          created_at TEXT NOT NULL,
          revoked_at TEXT
        );
        INSERT INTO overlay_keys (id, purpose, created_at, revoked_at) VALUES
          ('legacy-active', 'module-only', '2026-06-17T18:48:37.949Z', NULL),
          ('legacy-revoked', 'module-only', '2026-06-17T18:48:35.898Z', '2026-06-18T00:00:00.000Z'),
          ('live-active', 'live', '2026-07-20T00:00:00.000Z', NULL),
          ('test-active', 'test', '2026-07-20T00:00:00.000Z', NULL);
      `);

      connection.exec(revokeUnsupportedOverlayKeysMigration.sql);

      expect(connection.prepare("SELECT id, revoked_at FROM overlay_keys ORDER BY id").all()).toEqual([
        { id: "legacy-active", revoked_at: "2026-06-17T18:48:37.949Z" },
        { id: "legacy-revoked", revoked_at: "2026-06-18T00:00:00.000Z" },
        { id: "live-active", revoked_at: null },
        { id: "test-active", revoked_at: null }
      ]);
    } finally {
      connection.close();
    }
  });

  it("rolls back transaction writes when work throws", () => {
    using database = createInMemoryStreamJamsDatabase();

    expect(() =>
      runInTransaction(database.connection, () => {
        database.connection
          .prepare("INSERT INTO alert_collections (id, name, enabled) VALUES (?, ?, ?)")
          .run("collection-1", "Alerts", 1);
        throw new Error("stop");
      })
    ).toThrow("stop");

    expect(
      database.connection.prepare("SELECT COUNT(*) AS total FROM alert_collections").get()
    ).toEqual({ total: 0 });
  });

  it("rolls back nested synchronous work with the outer transaction", () => {
    using database = createInMemoryStreamJamsDatabase();

    expect(() =>
      runInTransaction(database.connection, () => {
        database.connection
          .prepare("INSERT INTO alert_collections (id, name, enabled) VALUES (?, ?, ?)")
          .run("collection-outer", "Outer", 1);
        runInTransaction(database.connection, () => {
          database.connection
            .prepare("INSERT INTO alert_collections (id, name, enabled) VALUES (?, ?, ?)")
            .run("collection-inner", "Inner", 0);
        });
        throw new Error("stop outer");
      })
    ).toThrow("stop outer");

    expect(database.connection.prepare("SELECT COUNT(*) AS total FROM alert_collections").get()).toEqual({ total: 0 });
  });

});

function listTables(connection: { prepare(sql: string): { all(): Record<string, unknown>[] } }): string[] {
  return connection
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => String(row.name));
}

function listAppliedMigrations(connection: { prepare(sql: string): { all(): Record<string, unknown>[] } }): string[] {
  return connection
    .prepare("SELECT id FROM schema_migrations ORDER BY rowid")
    .all()
    .map((row) => String(row.id));
}
