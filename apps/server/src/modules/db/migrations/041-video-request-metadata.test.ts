import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../database.js";

describe("041-video-request-metadata", () => {
  it("keeps queued requests and leaves their provider details unknown", () => {
    using database = createInMemoryStreamJamsDatabase();
    database.runMigrations();
    const db = database.connection;
    db.exec("DROP TABLE data_templates; DROP TABLE data_element_refs; DROP TABLE data_pins; DROP TABLE data_goals; DROP TABLE data_values; DROP TABLE data_reset_groups; DROP TABLE data_canvases; DROP TABLE data_overlay_meta; DELETE FROM schema_migrations WHERE id IN ('042-custom-data-overlays', '043-data-overlay-templates'); ALTER TABLE video_requests DROP COLUMN provider_title; ALTER TABLE video_requests DROP COLUMN channel_name; DELETE FROM schema_migrations WHERE id = '041-video-request-metadata';");
    db.exec(`INSERT INTO video_requests (id, purpose, source_json, title, requester, submitted_via, duration_ms, status, hold_reason, limit_overridden, autoplay, position, created_at, updated_at)
      VALUES ('video:old', 'live', '{"provider":"youtube","videoId":"dQw4w9WgXcQ","startAtMs":0}', 'Old title', 'viewer', 'management', 30000, 'queued', NULL, 0, 0, 0, 'now', 'now')`);

    database.runMigrations();

    expect(db.prepare("SELECT id, title, provider_title, channel_name, duration_ms FROM video_requests").all()).toEqual([
      { id: "video:old", title: "Old title", provider_title: null, channel_name: null, duration_ms: 30000 }
    ]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id = '041-video-request-metadata'").get()?.count).toBe(1);
    expect(() => database.runMigrations()).not.toThrow();
  });
});
