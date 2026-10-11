import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createDefaultVideosModuleConfig } from "@stream-jams/core";
import { createPreMigrationDatabase } from "../../../test-support/pre-migration-database.js";
import { applyStreamJamsMigration, runInTransaction, currentSchemaVersion } from "../database.js";

import { videoContentLayoutMigration } from "./045-video-content-layout.js";

describe("045 Video content migration", () => {
  it("upgrades historical settings without changing keys, surfaces, queues or durable receipts", () => {
    using fixture = createPreMigrationDatabase("045-video-content-layout");
    const db = fixture.connection;
    db.prepare("INSERT INTO overlay_module_config VALUES ('videos', 1, ?, '2026-10-11T00:00:00.000Z')").run(JSON.stringify({ ...createDefaultVideosModuleConfig(), layout: { x: 1440, y: 40, width: 400, height: 300 } }));
    db.exec("UPDATE video_queue_state SET revision=17 WHERE purpose='live'; UPDATE video_queue_state SET revision=23 WHERE purpose='test'");
    for (const purpose of ["live", "test"]) db.prepare(`INSERT INTO video_requests
      (id, purpose, source_json, title, requester, submitted_via, duration_ms, status, hold_reason, limit_overridden, autoplay, position, created_at, updated_at)
      VALUES (?, ?, ?, 'Retained title', 'viewer', 'management', 30000, 'queued', NULL, 0, 0, 0, 'old', 'old')`)
      .run(`retained-${purpose}`, purpose, JSON.stringify({ provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }));
    db.prepare("INSERT INTO overlay_keys (id, overlay_id, module_id, purpose, scope, key_hash, created_at, revoked_at, target_profile_id) VALUES ('ordinary-video-key', 'default', 'videos', 'live', 'module', ?, 'old', NULL, NULL)").run("a".repeat(64));
    db.prepare("INSERT INTO video_bus_admissions VALUES (?, ?, ?, ?, ?)").run("retained-bus", "retained-event", null, "{\"status\":\"rejected\",\"reason\":\"module-disabled\",\"fields\":[]}", 1);
    const tables = ["overlay_keys", "overlay_surfaces", "video_requests", "video_queue_state", "video_bus_admissions"];
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table}`).all());
    runInTransaction(db, () => {
      applyStreamJamsMigration(db, videoContentLayoutMigration);
      db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(videoContentLayoutMigration.id, "old");
    });
    expect(tables.map(table => db.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
    const upgraded = fixture.upgrade();
    expect(currentSchemaVersion).toBe(45);
    expect(JSON.parse(String(upgraded.connection.prepare("SELECT config_json FROM overlay_module_config WHERE module_id='videos'").get()?.config_json))).toMatchObject({
      maxLengthSeconds: 120, layout: { schemaVersion: 2, content: { width: 400, height: 300 }, desktopPlacement: { x: 1440, y: 40, scale: 1 } }
    });

    upgraded.runMigrations(); upgraded.runMigrations();
    expect(upgraded.connection.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n).toBe(45);
  });
  it("atomically blocks invalid saved layout and leaves the historical row intact", () => {
    using fixture = createPreMigrationDatabase("045-video-content-layout");
    const invalid = JSON.stringify({ ...createDefaultVideosModuleConfig(), layout: { x: 1800, y: 0, width: 480, height: 320 } });
    fixture.connection.prepare("INSERT INTO overlay_module_config VALUES ('videos', 1, ?, 'old')").run(invalid);
    const path = String(fixture.connection.prepare("PRAGMA database_list").all()[0]?.file);
    expect(() => fixture.upgrade()).toThrow(/Videos layout/u);
    using read = new DatabaseSync(path);
    expect(read.prepare("SELECT config_json FROM overlay_module_config WHERE module_id='videos'").get()?.config_json).toBe(invalid);
    expect(read.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id='045-video-content-layout'").get()?.n).toBe(0);
  });
});
