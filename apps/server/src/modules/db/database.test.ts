import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, runInTransaction } from "./database.js";

const expectedTables = [
  "alert_collections",
  "alert_match_logs",
  "alert_rule_collections",
  "alert_rule_conditions",
  "alert_rules",
  "alert_variants",
  "asset_metadata",
  "event_logs",
  "overlay_keys",
  "overlay_module_config",
  "playback_logs",
  "schema_migrations",
  "twitch_accounts"
];

describe("Stream Jams SQLite database", () => {
  it("initializes deterministic Slice 8 tables and records the migration once", () => {
    using database = createInMemoryStreamJamsDatabase();

    expect(listTables(database.connection)).toEqual(expectedTables);
    expect(listAppliedMigrations(database.connection)).toEqual(["001-initial-schema", "002-alert-variant-selection", "003-twitch-accounts"]);

    database.runMigrations();

    expect(listAppliedMigrations(database.connection)).toEqual(["001-initial-schema", "002-alert-variant-selection", "003-twitch-accounts"]);
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
