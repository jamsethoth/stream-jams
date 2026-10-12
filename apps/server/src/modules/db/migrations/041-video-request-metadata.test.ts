import { describe, expect, it } from "vitest";
import { createPreMigrationDatabase } from "../../../test-support/pre-migration-database.js";

describe("041-video-request-metadata", () => {
  it("keeps queued requests and leaves their provider details unknown", () => {
    using fixture = createPreMigrationDatabase("041-video-request-metadata");
    const old = fixture.connection;
    old.exec(`INSERT INTO video_requests (id, purpose, source_json, title, requester, submitted_via, duration_ms, status, hold_reason, limit_overridden, autoplay, position, created_at, updated_at)
      VALUES ('video:old', 'live', '{"provider":"youtube","videoId":"dQw4w9WgXcQ","startAtMs":0}', 'Old title', 'viewer', 'management', 30000, 'queued', NULL, 0, 0, 0, 'now', 'now')`);

    const database = fixture.upgrade();
    const db = database.connection;

    expect(db.prepare("SELECT id, title, provider_title, channel_name, duration_ms FROM video_requests").all()).toEqual([
      { id: "video:old", title: "Old title", provider_title: null, channel_name: null, duration_ms: 30000 }
    ]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id = '041-video-request-metadata'").get()?.count).toBe(1);
    expect(() => database.runMigrations()).not.toThrow();
  });
});
