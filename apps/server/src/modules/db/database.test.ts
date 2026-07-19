import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, runInTransaction, runInTransactionAsync } from "./database.js";
import { variantAlertEditorDocumentsMigration } from "./migrations/010-variant-alert-editor-documents.js";

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
    expect(listAppliedMigrations(database.connection)).toEqual([
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
      "011-alert-variant-order"
    ]);

    database.runMigrations();

    expect(listAppliedMigrations(database.connection)).toEqual([
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
      "011-alert-variant-order"
    ]);

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

  it("keeps async work inside the transaction until it resolves", async () => {
    using database = createInMemoryStreamJamsDatabase();

    await expect(runInTransactionAsync(database.connection, async () => {
      database.connection
        .prepare("INSERT INTO alert_collections (id, name, enabled) VALUES (?, ?, ?)")
        .run("collection-async", "Async", 1);
      await Promise.resolve();
      throw new Error("stop async");
    })).rejects.toThrow("stop async");

    expect(database.connection.prepare("SELECT COUNT(*) AS total FROM alert_collections").get()).toEqual({ total: 0 });
  });

  it("serializes async transactions so one rollback cannot erase another request", async () => {
    using database = createInMemoryStreamJamsDatabase();
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let secondStarted = false;

    const first = runInTransactionAsync(database.connection, async () => {
      database.connection.prepare("INSERT INTO alert_collections (id, name, enabled) VALUES (?, ?, ?)")
        .run("collection-first", "First", 1);
      await firstCanFinish;
      throw new Error("rollback first");
    });
    const second = runInTransactionAsync(database.connection, async () => {
      secondStarted = true;
      database.connection.prepare("INSERT INTO alert_collections (id, name, enabled) VALUES (?, ?, ?)")
        .run("collection-second", "Second", 1);
    });

    await Promise.resolve();
    expect(secondStarted).toBe(false);
    releaseFirst();
    await expect(first).rejects.toThrow("rollback first");
    await expect(second).resolves.toBeUndefined();
    expect(database.connection.prepare("SELECT id FROM alert_collections").all()).toEqual([
      { id: "collection-second" }
    ]);
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
    .prepare("SELECT id FROM schema_migrations ORDER BY id")
    .all()
    .map((row) => String(row.id));
}
