import { describe, expect, it } from "vitest";
import { createPreMigrationDatabase } from "../../../test-support/pre-migration-database.js";
import { SqliteConfigurationSnapshotRepository } from "../../backup/sqlite-configuration-snapshot-repository.js";
import { SqliteVideoBusAdmissionRepository } from "../../videos/video-bus-admission-repository.js";
import { videoBusAdmissionMigration } from "./043-video-bus-admission.js";
import { applyStreamJamsMigration, runInTransaction } from "../database.js";
import { SqliteVideoQueueRepository } from "../../videos/video-queue-repository.js";


describe("043-video-bus-admission", () => {
  it("upgrades an exact old backup prefix twice without changing queues and excludes receipts from configuration exports", () => {
    using fixture = createPreMigrationDatabase("043-video-bus-admission");
    const db = fixture.connection;
    db.prepare(`INSERT INTO video_requests (id,purpose,source_json,submitted_via,status,hold_reason,limit_overridden,autoplay,position,created_at,updated_at)
      VALUES ('retained','test',?,'management','queued',NULL,0,0,0,'2026-10-11T00:00:00.000Z','2026-10-11T00:00:00.000Z')`).run(JSON.stringify({provider:"youtube",videoId:"dQw4w9WgXcQ",startAtMs:0}));
    const before = db.prepare("SELECT * FROM video_requests").all();
    const state = db.prepare("SELECT * FROM video_queue_state").all();
    runInTransaction(db, () => {
      applyStreamJamsMigration(db, videoBusAdmissionMigration);
      db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(videoBusAdmissionMigration.id, "old");
    });
    expect(db.prepare("SELECT * FROM video_requests").all()).toEqual(before);
    expect(db.prepare("SELECT * FROM video_queue_state").all()).toEqual(state);
    const database = fixture.upgrade();
    database.runMigrations(); database.runMigrations();
    const item = new SqliteVideoQueueRepository(database.connection).load("live").items[0]!;
    expect(item).toMatchObject({ id: "retained", status: "held", reviewRequired: true });
    const admissions = new SqliteVideoBusAdmissionRepository(database.connection);
    admissions.record({ busId: "retained-bus", eventId: "retained-event" }, { status: "accepted", item });
    expect(admissions.find("retained-bus")?.result).toEqual({ status: "accepted", item });
    expect(new SqliteConfigurationSnapshotRepository(database.connection).snapshot().tables).not.toHaveProperty("video_bus_admissions");
    expect(database.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
