import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { upgradeTimersConfig } from "@stream-jams/core";
import { createPreMigrationDatabase } from "../../../test-support/pre-migration-database.js";
import { currentSchemaVersion } from "../database.js";

const legacy = { profiles: { landscape: { layout: { x: 1319, y: 779, width: 601, height: 301, zIndex: 3 }, orientation: "horizontal", maxVisible: 3 },
  vertical: { layout: { x: 48, y: 1320, width: 984, height: 480, zIndex: 0 }, orientation: "vertical", maxVisible: 4 } } };
describe("044 Timer profile appearance migration", () => {
  it.each(["original", "pinned12", "narrow-horizontal"])("upgrades an actual old database (%s) without changing definitions, recovery, ordinary keys or credentials", kind => {
    const saved = { profiles: { landscape: kind === "pinned12"
      ? { layout: { x: 64, y: 720, width: 640, height: 280, zIndex: 0 }, orientation: "vertical", maxVisible: 12 }
      : { layout: { x: 1319, y: 779, width: 601, height: 301, zIndex: 3 }, orientation: "horizontal", maxVisible: 12 },
      vertical: { layout: { x: 48, y: 1320, width: 984, height: 480, zIndex: 0 }, orientation: "vertical", maxVisible: 12 } } };
    const config = kind === "original" ? legacy : saved;
    using fixture = createPreMigrationDatabase("044-timer-profile-appearance");
    const db = fixture.connection;
    db.prepare("INSERT INTO overlay_module_config VALUES ('timers', 1, ?, '2026-10-10T00:00:00.000Z')").run(JSON.stringify(config));
    db.prepare("INSERT INTO overlay_keys (id, overlay_id, module_id, purpose, scope, key_hash, created_at, revoked_at, target_profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)")
      .run("ordinary-timer-key", "default", "timers", "live", "module", "a".repeat(64), "2026-10-10T00:00:00.000Z", "landscape");
    db.exec("INSERT INTO timer_definitions VALUES ('retained', 'Retained', 60000, NULL, NULL, NULL, 1, 'old', 'old', '[]'); INSERT INTO timer_run_recovery VALUES ('retained', '{\"generation\":\"preserved\",\"remainingMs\":12345}'); INSERT INTO timer_automation_credential VALUES (1, '012345678901234567890123456789', 'old', NULL, NULL)");
    const unchanged = ["timer_definitions", "timer_run_recovery", "overlay_keys", "timer_automation_credential"].map(table => db.prepare(`SELECT * FROM ${table}`).all());
    const upgraded = fixture.upgrade();
    expect(currentSchemaVersion).toBe(48);
    expect(JSON.parse(String(upgraded.connection.prepare("SELECT config_json FROM overlay_module_config WHERE module_id='timers'").get()?.config_json))).toEqual(upgradeTimersConfig(config));
    expect(["timer_definitions", "timer_run_recovery", "overlay_keys", "timer_automation_credential"].map(table => upgraded.connection.prepare(`SELECT * FROM ${table}`).all())).toEqual(unchanged);
    upgraded.runMigrations(); upgraded.runMigrations();
    expect(upgraded.connection.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n).toBe(currentSchemaVersion);
  });
  it.each(["legacy-geometry", "customized-cramped"])("rolls back invalid saved compound geometry (%s) and does not record the migration", kind => {
    using fixture = createPreMigrationDatabase("044-timer-profile-appearance");
    const cramped = upgradeTimersConfig({ profiles: { ...legacy.profiles, landscape: { ...legacy.profiles.landscape, maxVisible: 12 } } });
    const invalid = kind === "legacy-geometry"
      ? { ...legacy, profiles: { ...legacy.profiles, landscape: { ...legacy.profiles.landscape, layout: { ...legacy.profiles.landscape.layout, width: 9999 } } } }
      : { ...cramped, profiles: { ...cramped.profiles, landscape: { ...cramped.profiles.landscape, appearance: { ...cramped.profiles.landscape.appearance, borderColor: "#123456" } } } };
    fixture.connection.prepare("INSERT INTO overlay_module_config VALUES ('timers', 1, ?, 'old')").run(JSON.stringify(invalid));
    const path = String(fixture.connection.prepare("PRAGMA database_list").all()[0]?.file);
    expect(() => fixture.upgrade()).toThrow(/Timer configuration/u);
    using read = new DatabaseSync(path);
    expect(read.prepare("SELECT config_json FROM overlay_module_config WHERE module_id='timers'").get()?.config_json).toBe(JSON.stringify(invalid));
    expect(read.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id='044-timer-profile-appearance'").get()?.n).toBe(0);
  });
});
