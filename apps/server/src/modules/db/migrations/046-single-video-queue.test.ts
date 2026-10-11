import { DatabaseSync } from "node:sqlite";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDefaultVideosModuleConfig } from "@stream-jams/core";
import { openStreamJamsDatabase } from "../database.js";
import { VideoQueueService } from "../../videos/video-queue-service.js";
import { SqliteVideoQueueRepository } from "../../videos/video-queue-repository.js";
import { createPreMigrationDatabase } from "../../../test-support/pre-migration-database.js";

function insert(db: DatabaseSync, id: string, purpose: string, status = "queued", position = 0) {
  db.prepare(`INSERT INTO video_requests (id,purpose,source_json,submitted_via,status,hold_reason,limit_overridden,autoplay,position,created_at,updated_at)
    VALUES (?,?,?,'management',?,NULL,0,1,?,'2026-10-11T00:00:00.000Z','2026-10-11T00:00:00.000Z')`)
    .run(id, purpose, JSON.stringify({provider:"youtube",videoId:"dQw4w9WgXcQ",startAtMs:0}), status, position);
}

describe("single Video queue upgrade", () => {
  it("upgrades receipts from their original acceptance snapshot and normalizes mappings while retiring only Videos test keys", () => {
    using fixture = createPreMigrationDatabase("046-single-video-queue");
    insert(fixture.connection, "accepted", "test", "playing");
    fixture.connection.exec("UPDATE video_requests SET title='Current title',duration_ms=60000 WHERE id='accepted'");
    const item = { id: "accepted", purpose: "test", source: { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }, title: "Accepted title", providerTitle: null, channelName: null,
      requester: null, submittedVia: "management", durationMs: 30000, status: "queued", holdReason: null, limitOverridden: false, autoplay: true, position: 0, createdAt: "2026-10-11T00:00:00.000Z" };
    fixture.connection.prepare("INSERT INTO video_bus_admissions VALUES ('old-bus','old-event','accepted',?,1)").run(JSON.stringify({ status: "accepted", item }));
    fixture.connection.prepare("INSERT INTO overlay_module_config VALUES ('videos',1,?,'old')").run(JSON.stringify({ ...createDefaultVideosModuleConfig(), rewardMappings: [{ rewardId: "test-reward", purpose: "test" }] }));
    for (const [id, moduleId, scope] of [["ordinary", "videos", "module"], ["retired", "videos", "module"], ["unified", null, "unified"]] as const) {
      fixture.connection.prepare("INSERT INTO overlay_keys (id,overlay_id,module_id,purpose,scope,key_hash,created_at,revoked_at,target_profile_id) VALUES (?,'default',?,?,?,?,'old',NULL,NULL)")
        .run(id, moduleId, id === "ordinary" ? "live" : "test", scope, id.padEnd(64, "a"));
    }
    const db = fixture.upgrade();
    const receipt = JSON.parse(String(db.connection.prepare("SELECT result_json FROM video_bus_admissions").get()?.result_json));
    const accepted = Object.fromEntries(Object.entries(item).filter(([key]) => key !== "purpose"));
    expect(receipt).toEqual({ status: "accepted", item: { ...accepted, reviewRequired: false, migrationProvenance: null } });
    expect(db.connection.prepare("SELECT title,status,review_required,duration_ms FROM video_requests").get()).toEqual({ title: "Current title", status: "held", review_required: 1, duration_ms: 60000 });
    expect(JSON.parse(String(db.connection.prepare("SELECT config_json FROM overlay_module_config").get()?.config_json)).rewardMappings).toEqual([{ rewardId: "test-reward" }]);
    expect(db.connection.prepare("SELECT id FROM overlay_keys WHERE revoked_at IS NULL ORDER BY id").all().map(row => row.id)).toEqual(["ordinary", "unified"]);
  });

  it("preflights corrupt imported duplicate identities before destructive writes", () => {
    using fixture = createPreMigrationDatabase("046-single-video-queue"); insert(fixture.connection, "same", "live");
    fixture.connection.exec("ALTER TABLE video_requests RENAME TO valid_video_requests; CREATE TABLE video_requests AS SELECT * FROM valid_video_requests; INSERT INTO video_requests SELECT * FROM valid_video_requests; UPDATE video_requests SET purpose='test' WHERE rowid=2");
    const path = String(fixture.connection.prepare("PRAGMA database_list").all()[0]?.file);
    expect(() => fixture.upgrade()).toThrow(/duplicate identities/u);
    using read = new DatabaseSync(path);
    expect(read.prepare("SELECT COUNT(*) n FROM video_requests").get()?.n).toBe(2);
    expect(read.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id='046-single-video-queue'").get()?.n).toBe(0);
  });
  it("keeps review independent of metadata, limits and formerly overridden requests, then releases it explicitly", () => {
    using fixture = createPreMigrationDatabase("046-single-video-queue");
    for (const id of ["within", "long", "overridden"]) insert(fixture.connection, id, "test");
    fixture.connection.exec("UPDATE video_requests SET duration_ms=30000 WHERE id='within'; UPDATE video_requests SET duration_ms=180000 WHERE id IN ('long','overridden'); UPDATE video_requests SET limit_overridden=1 WHERE id='overridden'");
    const db = fixture.upgrade();
    let config = createDefaultVideosModuleConfig();
    const queue = new VideoQueueService({ repository: new SqliteVideoQueueRepository(db.connection), getConfig: () => config, scheduler: { setTimeout: () => 0, clearTimeout: () => {} } });
    for (const id of ["within", "long", "overridden"]) {
      queue.applyMetadata("live", id, { title: "Known", channelName: null, durationMs: id === "within" ? 30000 : 180000 });
    }
    config = { ...config, maxLengthSeconds: 240 }; queue.reevaluateLimits();
    expect(queue.view("live").items.every(item => item.status === "held" && item.reviewRequired && !item.autoplay)).toBe(true);
    expect(() => queue.command("live", queue.view("live").revision, { kind: "play-all" })).toThrow();
    expect(() => queue.command("live", queue.view("live").revision, { kind: "play-anyway", itemId: "overridden" })).toThrow(/review/iu);
    const revision = queue.view("live").revision;
    expect(() => queue.command("live", revision - 1, { kind: "play", itemId: "within" })).toThrow();
    expect(queue.view("live").items.find(item => item.id === "within")?.reviewRequired).toBe(true);
    queue.command("live", revision, { kind: "play", itemId: "within" });
    expect(queue.view("live").current?.item).toMatchObject({ id: "within", reviewRequired: false, holdReason: null });
    queue.command("live", queue.view("live").revision, { kind: "stop" });
    config = { ...config, maxLengthSeconds: 120 }; queue.reevaluateLimits();
    queue.command("live", queue.view("live").revision, { kind: "play", itemId: "long" });
    expect(queue.view("live").items.find(item => item.id === "long")).toMatchObject({ reviewRequired: false, status: "held", holdReason: "over-limit", limitOverridden: false });
    expect(queue.view("live").current).toBeNull();
    queue.command("live", queue.view("live").revision, { kind: "play", itemId: "overridden" });
    expect(queue.view("live").current?.item).toMatchObject({ id: "overridden", reviewRequired: false, limitOverridden: true, holdReason: null });
    queue.dispose();
  });

  it("retains both old lanes' 100 completed/failed records through startup and replay creates a fresh ordinary request", () => {
    using fixture = createPreMigrationDatabase("046-single-video-queue");
    for (const purpose of ["live", "test"]) for (let i = 0; i < 100; i++) insert(fixture.connection, `${purpose}-${i}`, purpose, i % 2 ? "failed" : "played", i);
    const db = fixture.upgrade();
    const queue = new VideoQueueService({ repository: new SqliteVideoQueueRepository(db.connection), getConfig: createDefaultVideosModuleConfig });
    expect(db.connection.prepare("SELECT COUNT(*) n FROM video_requests").get()?.n).toBe(200);
    const historical = queue.view("live").recent.find(item => item.migrationProvenance !== null)!;
    expect(historical).toBeDefined();
    const replay = queue.requeue("live", queue.view("live").revision, historical.id, "operator");
    expect(replay).toMatchObject({ reviewRequired: false, migrationProvenance: null, autoplay: false, status: "queued" });
    expect(queue.view("live").recent.find(item => item.id === historical.id)?.migrationProvenance).toEqual(historical.migrationProvenance);
    queue.dispose();
  });

  it("captures committed WAL pages before consolidation in an independent rollback database", () => {
    using fixture = createPreMigrationDatabase("046-single-video-queue");
    insert(fixture.connection, "wal-only", "test", "queued");
    const path = String(fixture.connection.prepare("PRAGMA database_list").all()[0]?.file);
    expect(statSync(`${path}-wal`).size).toBeGreaterThan(0);
    using db = openStreamJamsDatabase(path);
    const snapshots = readdirSync(dirname(path)).filter(name => name.includes(".pre046-"));
    expect(snapshots).toHaveLength(1);
    using snapshot = new DatabaseSync(join(dirname(path), snapshots[0]!), { readOnly: true });
    expect(snapshot.prepare("SELECT purpose,status FROM video_requests WHERE id='wal-only'").get()).toEqual({ purpose: "test", status: "queued" });
    expect(snapshot.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id='046-single-video-queue'").get()?.n).toBe(0);
    expect(db.connection.prepare("SELECT review_required FROM video_requests WHERE id='wal-only'").get()?.review_required).toBe(1);
  });

  it("fails closed before any consolidation writes when its required rollback snapshot fails", () => {
    using fixture = createPreMigrationDatabase("046-single-video-queue"); insert(fixture.connection, "retained", "test");
    const path = String(fixture.connection.prepare("PRAGMA database_list").all()[0]?.file);
    const original = DatabaseSync.prototype.prepare;
    const spy = vi.spyOn(DatabaseSync.prototype, "prepare").mockImplementation(function(this: DatabaseSync, sql) {
      if (sql === "VACUUM INTO ?") throw new Error("simulated disk failure");
      return original.call(this, sql);
    });
    try { expect(() => openStreamJamsDatabase(path)).toThrow(/required rollback database/u); } finally { spy.mockRestore(); }
    expect(fixture.connection.prepare("SELECT purpose,status FROM video_requests WHERE id='retained'").get()).toEqual({ purpose: "test", status: "queued" });
    expect(fixture.connection.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id='046-single-video-queue'").get()?.n).toBe(0);
  });
  it("preserves ordinary order/history and holds migrated test requests without replay", () => {
    using fixture = createPreMigrationDatabase("046-single-video-queue");
    insert(fixture.connection,"ordinary","live","playing",5);
    insert(fixture.connection,"ordinary-pending","live","queued",6);
    insert(fixture.connection,"ordinary-history","live","failed",0);
    insert(fixture.connection,"waiting","test","queued",2);
    insert(fixture.connection,"active","test","paused",1);
    insert(fixture.connection,"history","test","played",0);
    insert(fixture.connection,"length-held","test","queued",3);
    fixture.connection.exec("UPDATE video_requests SET status='held',hold_reason='over-limit',duration_ms=180000 WHERE id='length-held'");
    fixture.connection.exec("UPDATE video_queue_state SET revision=17,run_json='{}' WHERE purpose='test'");
    const db = fixture.upgrade();
    const rows = db.connection.prepare("SELECT * FROM video_requests ORDER BY position").all();
    expect(rows.find(row=>row.id==="ordinary")).toMatchObject({status:"playing",position:5});
    expect(rows.filter(row=>row.status==="held").map(row=>row.id)).toEqual(["active","waiting","length-held"]);
    expect(rows.find(row=>row.id==="ordinary-pending")).toMatchObject({status:"queued",position:6});
    expect(rows.find(row=>row.id==="ordinary-history")).toMatchObject({status:"failed",position:0});
    expect(rows.find(row=>row.id==="length-held")).toMatchObject({hold_reason:"over-limit",review_required:1});
    expect(rows.find(row=>row.id==="active")).toMatchObject({review_required:1,autoplay:0,purpose:"live"});
    expect(rows.find(row=>row.id==="history")).toMatchObject({status:"played",purpose:"live"});
    expect(db.connection.prepare("SELECT * FROM video_queue_state").all()).toEqual([{purpose:"live",revision:18,queue_paused:0,run_json:null}]);
    const before=db.connection.prepare("SELECT * FROM video_requests").all();
    db.runMigrations(); expect(db.connection.prepare("SELECT * FROM video_requests").all()).toEqual(before);
  });
  it("preflights combined capacity and atomically leaves the old database untouched", () => {
    using fixture = createPreMigrationDatabase("046-single-video-queue");
    for(let i=0;i<501;i++) insert(fixture.connection,`item-${i}`,i<250?"live":"test");
    const path=String(fixture.connection.prepare("PRAGMA database_list").all()[0]?.file);
    expect(()=>fixture.upgrade()).toThrow(/500|capacity/u);
    using read=new DatabaseSync(path);
    expect(read.prepare("SELECT COUNT(*) n FROM video_requests WHERE purpose='test'").get()?.n).toBe(251);
    expect(read.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id='046-single-video-queue'").get()?.n).toBe(0);
  });
});
