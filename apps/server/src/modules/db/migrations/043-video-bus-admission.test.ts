import { describe, expect, it } from "vitest";
import { createPreMigrationDatabase } from "../../../test-support/pre-migration-database.js";
import { SqliteConfigurationSnapshotRepository } from "../../backup/sqlite-configuration-snapshot-repository.js";
import { SqliteVideoBusAdmissionRepository } from "../../videos/video-bus-admission-repository.js";
import { VideoQueueService } from "../../videos/video-queue-service.js";
import { SqliteVideoQueueRepository } from "../../videos/video-queue-repository.js";
import { createDefaultVideosModuleConfig } from "@stream-jams/core";

describe("043-video-bus-admission", () => {
  it("upgrades an exact old backup prefix twice without changing queues and excludes receipts from configuration exports", () => {
    using fixture = createPreMigrationDatabase("043-video-bus-admission");
    const config = createDefaultVideosModuleConfig();
    const queue = new VideoQueueService({ repository: new SqliteVideoQueueRepository(fixture.connection), getConfig: () => config });
    const item = queue.submit("test", { source: { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }, title: "Retained", requester: null, durationMs: null, autoplay: false, via: "management" });
    const state = queue.view("test");
    queue.dispose();
    const database = fixture.upgrade();
    database.runMigrations(); database.runMigrations();
    expect(new SqliteVideoQueueRepository(database.connection).load("test")).toEqual({ purpose: state.purpose, revision: state.revision, queuePaused: state.queuePaused, run: state.run, items: state.items, recentlyFailed: state.recentlyFailed, recent: state.recent });
    const admissions = new SqliteVideoBusAdmissionRepository(database.connection);
    admissions.record({ busId: "retained-bus", eventId: "retained-event" }, { status: "accepted", item });
    expect(admissions.find("retained-bus")?.result).toEqual({ status: "accepted", item });
    expect(new SqliteConfigurationSnapshotRepository(database.connection).snapshot().tables).not.toHaveProperty("video_bus_admissions");
    expect(database.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
