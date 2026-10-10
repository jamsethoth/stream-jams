import { afterEach, describe, expect, it } from "vitest";
import { createDefaultVideosModuleConfig, type VideosModuleConfig } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { SqliteVideoQueueRepository, VideoQueueConflictError, videoRecentLimit } from "./video-queue-repository.js";
import { VideoQueueCommandError, VideoQueueService, videoEndGraceMs, videoFinishedHistoryLimit, videoLoadTimeoutMs, type VideoSubmission } from "./video-queue-service.js";

class FakeScheduler {
  now = 1_000_000;
  private timers: { at: number; callback: () => void; handle: number }[] = [];
  private next = 1;
  setTimeout = (callback: () => void, delayMs: number) => { const handle = this.next++; this.timers.push({ at: this.now + delayMs, callback, handle }); return handle; };
  clearTimeout = (handle: unknown) => { this.timers = this.timers.filter(timer => timer.handle !== handle); };
  advance(ms: number) {
    const target = this.now + ms;
    for (;;) {
      const due = this.timers.filter(timer => timer.at <= target).sort((a, b) => a.at - b.at)[0];
      if (due === undefined) break;
      this.timers = this.timers.filter(timer => timer !== due);
      this.now = due.at;
      due.callback();
    }
    this.now = target;
  }
}

const databases: StreamJamsDatabase[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function setup(overrides: Partial<VideosModuleConfig> = {}, database = createInMemoryStreamJamsDatabase()) {
  if (!databases.includes(database)) { database.runMigrations(); databases.push(database); }
  const scheduler = new FakeScheduler();
  let config: VideosModuleConfig = { ...createDefaultVideosModuleConfig(), ...overrides };
  let ids = 0;
  const service = new VideoQueueService({
    // Rows record when they finished on the test clock, so Recent order follows it.
    repository: new SqliteVideoQueueRepository(database.connection, () => new Date(scheduler.now).toISOString()),
    getConfig: () => config,
    now: () => scheduler.now,
    scheduler,
    createId: () => `id${++ids}`
  });
  return { service, scheduler, database, setConfig: (next: Partial<VideosModuleConfig>) => { config = { ...config, ...next }; } };
}

function clip(title: string, durationMs: number | null = 30_000, extra: Partial<VideoSubmission> = {}): VideoSubmission {
  return { source: { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }, title, requester: "viewer", durationMs, autoplay: false, via: "management", ...extra };
}

describe("VideoQueueService", () => {
  it("queues submissions without playing them", () => {
    const { service } = setup();
    service.submit("live", clip("One"));
    const view = service.view("live");
    expect(view.items.map(item => [item.title, item.status])).toEqual([["One", "queued"]]);
    expect(view.current).toBeNull();
  });

  it("holds over-limit items and releases them on Play anyway", () => {
    const { service } = setup({ maxLengthSeconds: 60 });
    const long = service.submit("live", clip("Long", 90_000));
    expect(service.view("live").items.map(item => [item.status, item.holdReason])).toEqual([["held", "over-limit"]]);
    expect(() => service.command("live", service.view("live").revision, { kind: "play-next" })).toThrow(VideoQueueCommandError);

    service.command("live", service.view("live").revision, { kind: "play-anyway", itemId: long.id });
    expect(service.view("live").current?.item).toMatchObject({ id: long.id, limitOverridden: true });
  });

  it("queues an item exactly at the limit", () => {
    const { service } = setup({ maxLengthSeconds: 60 });
    service.submit("live", clip("Exact", 60_000));
    expect(service.view("live").items[0]).toMatchObject({ status: "queued", holdReason: null });
  });

  it("queues unknown-length items and plays them with Play next", () => {
    const { service, scheduler } = setup({ maxLengthSeconds: 60 });
    const unknown = service.submit("live", clip("Unknown", null));
    expect(service.view("live").items[0]).toMatchObject({ status: "queued", holdReason: null, durationMs: null });
    service.command("live", service.view("live").revision, { kind: "play-next" });
    expect(service.view("live").current).toMatchObject({ phase: "loading", item: { id: unknown.id } });
    service.reportStarted(unknown.id, { durationMs: 45_000 });
    expect(service.view("live").current?.item.durationMs).toBe(45_000);
    scheduler.advance(45_000 + videoEndGraceMs);
    expect(service.view("live").current).toBeNull();
    expect(service.view("live").items).toEqual([]);
  });

  it("autoplays an unknown-length submission", () => {
    const { service } = setup();
    const unknown = service.submit("live", clip("Unknown", null, { autoplay: true }));
    expect(service.view("live").current?.item.id).toBe(unknown.id);
  });

  it("cuts an unknown-length item reported over the limit and holds it at its original position", () => {
    const { service } = setup({ maxLengthSeconds: 60 });
    const unknown = service.submit("live", clip("Unknown", null));
    const later = service.submit("live", clip("Later"));
    service.command("live", service.view("live").revision, { kind: "play-next" });
    expect(service.reportStarted(unknown.id, { durationMs: 90_000 })).toBe(true);
    const view = service.view("live");
    expect(view.current).toBeNull();
    expect(view.run).toBeNull();
    expect(view.recentlyFailed).toEqual([]);
    expect(view.items.map(item => [item.id, item.status, item.holdReason, item.durationMs, item.position])).toEqual([
      [unknown.id, "held", "over-limit", 90_000, unknown.position],
      [later.id, "queued", null, 30_000, later.position]
    ]);
    // Late reports for the cut item are ignored.
    expect(service.reportEnded(unknown.id)).toBe(false);

    service.command("live", service.view("live").revision, { kind: "play-anyway", itemId: unknown.id });
    expect(service.view("live").current?.item).toMatchObject({ id: unknown.id, limitOverridden: true, durationMs: 90_000 });
  });

  it("cuts on a progress report and continues a Play all run after the gap", () => {
    const { service, scheduler } = setup({ maxLengthSeconds: 60, gapSeconds: 3 });
    const unknown = service.submit("live", clip("Unknown", null));
    const next = service.submit("live", clip("Next"));
    service.command("live", service.view("live").revision, { kind: "play-all" });
    service.reportStarted(unknown.id);
    scheduler.advance(5_000);
    service.reportProgress(unknown.id, { positionMs: 5_000, durationMs: 61_000 });
    expect(service.view("live").current).toBeNull();
    expect(service.view("live").gapEndsAtEpochMs).toBe(scheduler.now + 3_000);
    expect(service.view("live").items.find(item => item.id === unknown.id)).toMatchObject({ status: "held", holdReason: "over-limit" });
    scheduler.advance(3_000);
    expect(service.view("live").current?.item.id).toBe(next.id);
  });

  it("does not continue a run after a cut while the queue is paused", () => {
    const { service } = setup({ maxLengthSeconds: 60, gapSeconds: 0 });
    const unknown = service.submit("live", clip("Unknown", null));
    const next = service.submit("live", clip("Next"));
    service.command("live", service.view("live").revision, { kind: "play-all" });
    service.command("live", service.view("live").revision, { kind: "pause-queue" });
    service.reportStarted(unknown.id, { durationMs: 90_000 });
    expect(service.view("live").current).toBeNull();
    service.command("live", service.view("live").revision, { kind: "resume-queue" });
    expect(service.view("live").current?.item.id).toBe(next.id);
  });

  it("cuts a paused unknown-length item that learns an over-limit duration", () => {
    const { service } = setup({ maxLengthSeconds: 60 });
    const unknown = service.submit("live", clip("Unknown", null));
    service.command("live", service.view("live").revision, { kind: "play-next" });
    service.reportStarted(unknown.id);
    service.control("live", unknown.id, { kind: "pause" });
    service.reportProgress(unknown.id, { positionMs: 1_000, durationMs: 120_000 });
    expect(service.view("live").current).toBeNull();
    expect(service.view("live").items[0]).toMatchObject({ id: unknown.id, status: "held", holdReason: "over-limit" });
  });

  it("learns a browser-reported length without moving the clock, cutting an over-limit item while loading or playing", () => {
    const { service, scheduler } = setup({ maxLengthSeconds: 60, gapSeconds: 0 });
    const loading = service.submit("live", clip("Loading", null));
    const playing = service.submit("live", clip("Playing", null));
    const fits = service.submit("live", clip("Fits", null));
    service.command("live", service.view("live").revision, { kind: "play-all" });
    // Reported before the player starts: cut without ever playing.
    expect(service.reportDuration(loading.id, 90_000)).toBe(true);
    expect(service.view("live").items.find(item => item.id === loading.id)).toMatchObject({ status: "held", holdReason: "over-limit", durationMs: 90_000 });
    expect(service.view("live").current?.item.id).toBe(playing.id);

    service.reportStarted(playing.id);
    scheduler.advance(4_000);
    expect(service.reportDuration(playing.id, 61_000)).toBe(true);
    expect(service.view("live").items.find(item => item.id === playing.id)).toMatchObject({ status: "held", holdReason: "over-limit" });

    expect(service.view("live").current?.item.id).toBe(fits.id);
    service.reportStarted(fits.id);
    scheduler.advance(2_000);
    expect(service.reportDuration(fits.id, 20_000)).toBe(true);
    // The clock is left alone: the end is scheduled from the shared clock, not the reporting output.
    expect(service.view("live").current).toMatchObject({ phase: "playing", item: { id: fits.id, durationMs: 20_000 }, clock: { positionMs: 0 } });
    scheduler.advance(18_000 + videoEndGraceMs);
    expect(service.view("live").current).toBeNull();
    // Reports for items that are not current are ignored.
    expect(service.reportDuration(fits.id, 20_000)).toBe(false);
  });

  it("never cuts an item released with Play anyway or one whose length was known", () => {
    const { service, setConfig } = setup({ maxLengthSeconds: 60 });
    const unknown = service.submit("live", clip("Unknown", null));
    service.command("live", service.view("live").revision, { kind: "play-anyway", itemId: unknown.id });
    service.reportStarted(unknown.id, { durationMs: 600_000 });
    expect(service.view("live").current).toMatchObject({ phase: "playing", item: { id: unknown.id, durationMs: 600_000 } });
    service.reportEnded(unknown.id);

    const known = service.submit("live", clip("Known", 60_000));
    service.command("live", service.view("live").revision, { kind: "play-next" });
    service.reportStarted(known.id, { durationMs: 60_400 });
    expect(service.view("live").current).toMatchObject({ phase: "playing", item: { id: known.id, durationMs: 60_400 } });
    service.reportEnded(known.id);

    setConfig({ maxLengthSeconds: 120 });
    const atLimit = service.submit("live", clip("At limit", null));
    service.command("live", service.view("live").revision, { kind: "play-next" });
    service.reportStarted(atLimit.id, { durationMs: 120_000 });
    expect(service.view("live").current).toMatchObject({ phase: "playing", item: { id: atLimit.id } });
  });

  it("keeps unknown-length items queued when limits are re-evaluated", () => {
    const { service, setConfig } = setup({ maxLengthSeconds: 60 });
    service.submit("live", clip("Unknown", null));
    setConfig({ maxLengthSeconds: 30 });
    service.reevaluateLimits();
    expect(service.view("live").items[0]).toMatchObject({ status: "queued", holdReason: null });
  });

  it("queues legacy unknown-length holds again on restart", () => {
    const first = setup({ maxLengthSeconds: 60 });
    const unknown = first.service.submit("live", clip("Legacy", null));
    const long = first.service.submit("live", clip("Long", 90_000));
    first.service.dispose();
    first.database.connection.prepare("UPDATE video_requests SET status = 'held', hold_reason = 'unknown-length' WHERE id = ?").run(unknown.id);

    const restarted = setup({ maxLengthSeconds: 60 }, first.database);
    expect(restarted.service.view("live").items.map(item => [item.id, item.status, item.holdReason])).toEqual([
      [unknown.id, "queued", null],
      [long.id, "held", "over-limit"]
    ]);
  });

  it("re-queues held items when the limit rises", () => {
    const { service, setConfig } = setup({ maxLengthSeconds: 60 });
    service.submit("live", clip("Long", 90_000));
    setConfig({ maxLengthSeconds: 120 });
    service.reevaluateLimits();
    expect(service.view("live").items[0]).toMatchObject({ status: "queued", holdReason: null });
  });

  it("plays only the next item by default and then stops consuming", () => {
    const { service, scheduler } = setup();
    const first = service.submit("live", clip("One"));
    service.submit("live", clip("Two"));
    service.command("live", service.view("live").revision, { kind: "play-next" });
    expect(service.view("live").current).toMatchObject({ phase: "loading", item: { id: first.id } });
    service.reportStarted(first.id);
    service.reportEnded(first.id);
    scheduler.advance(60_000);
    const view = service.view("live");
    expect(view.current).toBeNull();
    expect(view.items.map(item => item.title)).toEqual(["Two"]);
  });

  it("plays everything queued at the moment Play all was chosen, with the gap between", () => {
    const { service, scheduler } = setup({ gapSeconds: 3 });
    const one = service.submit("live", clip("One"));
    const two = service.submit("live", clip("Two"));
    service.command("live", service.view("live").revision, { kind: "play-all" });
    service.submit("live", clip("Late"));

    service.reportStarted(one.id);
    service.reportEnded(one.id);
    expect(service.view("live").gapEndsAtEpochMs).toBe(scheduler.now + 3_000);
    scheduler.advance(3_000);
    expect(service.view("live").current?.item.id).toBe(two.id);
    service.reportStarted(two.id);
    service.reportEnded(two.id);
    scheduler.advance(10_000);
    expect(service.view("live").current).toBeNull();
    expect(service.view("live").items.map(item => item.title)).toEqual(["Late"]);
  });

  it("lets the current item finish when the queue is paused mid-run, then resumes", () => {
    const { service, scheduler } = setup({ gapSeconds: 0 });
    const one = service.submit("live", clip("One"));
    const two = service.submit("live", clip("Two"));
    service.command("live", service.view("live").revision, { kind: "play-all" });
    service.command("live", service.view("live").revision, { kind: "pause-queue" });
    service.reportStarted(one.id);
    service.reportEnded(one.id);
    scheduler.advance(5_000);
    expect(service.view("live").current).toBeNull();
    service.command("live", service.view("live").revision, { kind: "resume-queue" });
    expect(service.view("live").current?.item.id).toBe(two.id);
  });

  it("autoplays an allowed submission only when idle and not paused", () => {
    const { service } = setup();
    const auto = service.submit("live", clip("Auto", 30_000, { autoplay: true }));
    expect(service.view("live").current?.item.id).toBe(auto.id);
    const waiting = service.submit("live", clip("Waiting", 30_000, { autoplay: true }));
    expect(service.view("live").items.find(item => item.id === waiting.id)?.status).toBe("queued");
  });

  it("rejects stale revisions without changing the queue", () => {
    const { service } = setup();
    service.submit("live", clip("One"));
    const stale = service.view("live").revision - 1;
    expect(() => service.command("live", stale, { kind: "clear" })).toThrow(VideoQueueConflictError);
    expect(service.view("live").items).toHaveLength(1);
  });

  it("pauses, seeks and resumes the current item on one clock", () => {
    const { service, scheduler } = setup();
    const item = service.submit("live", clip("One", 60_000));
    service.command("live", service.view("live").revision, { kind: "play-next" });
    service.reportStarted(item.id);
    scheduler.advance(10_000);
    service.control("live", item.id, { kind: "pause" });
    expect(service.view("live").current).toMatchObject({ phase: "paused", clock: { state: "paused", positionMs: 10_000 } });
    service.control("live", item.id, { kind: "seek", positionMs: 50_000 });
    expect(service.view("live").current).toMatchObject({ seekGeneration: 1, clock: { positionMs: 50_000 } });
    service.control("live", item.id, { kind: "resume" });
    scheduler.advance(10_000 + videoEndGraceMs);
    expect(service.view("live").current).toBeNull();
    expect(() => service.control("live", item.id, { kind: "pause" })).toThrow(VideoQueueCommandError);
  });

  it("fails an item whose player never starts", () => {
    const { service, scheduler } = setup();
    service.submit("live", clip("One"));
    service.command("live", service.view("live").revision, { kind: "play-next" });
    scheduler.advance(videoLoadTimeoutMs);
    expect(service.view("live").current).toBeNull();
  });

  it("keeps the newest failures for review outside the queue", () => {
    const { service, scheduler } = setup();
    for (let index = 1; index <= 7; index += 1) {
      service.submit("live", clip(`Clip ${index}`));
      service.command("live", service.view("live").revision, { kind: "play-next" });
      scheduler.advance(videoLoadTimeoutMs);
    }
    service.submit("live", clip("Waiting"));
    const view = service.view("live");
    expect(view.items.map(item => item.title)).toEqual(["Waiting"]);
    expect(view.recentlyFailed.map(item => [item.title, item.status])).toEqual(
      [3, 4, 5, 6, 7].map(index => [`Clip ${index}`, "failed"])
    );
    expect(service.view("test").recentlyFailed).toEqual([]);
  });

  it("learns a duration from the player for unknown-length items", () => {
    const { service, scheduler } = setup();
    const item = service.submit("live", clip("Unknown", null));
    service.command("live", service.view("live").revision, { kind: "play-anyway", itemId: item.id });
    service.reportStarted(item.id, { durationMs: 20_000 });
    expect(service.view("live").current?.item.durationMs).toBe(20_000);
    scheduler.advance(20_000 + videoEndGraceMs);
    expect(service.view("live").current).toBeNull();
  });

  it("reorders and removes waiting items", () => {
    const { service } = setup();
    const a = service.submit("live", clip("A"));
    const b = service.submit("live", clip("B"));
    service.command("live", service.view("live").revision, { kind: "reorder", itemIds: [b.id, a.id] });
    expect(service.view("live").items.map(item => item.title)).toEqual(["B", "A"]);
    expect(() => service.command("live", service.view("live").revision, { kind: "reorder", itemIds: [a.id] })).toThrow(VideoQueueCommandError);
    service.command("live", service.view("live").revision, { kind: "remove", itemId: a.id });
    expect(service.view("live").items.map(item => item.title)).toEqual(["B"]);
  });

  it("keeps purposes separate", () => {
    const { service } = setup();
    service.submit("test", clip("Test"));
    expect(service.view("live").items).toHaveLength(0);
    expect(service.view("test").items).toHaveLength(1);
  });

  it("survives a restart with the interrupted item back at the head and nothing playing", () => {
    const first = setup();
    const playing = first.service.submit("live", clip("Playing", 30_000, { autoplay: true }));
    first.service.submit("live", clip("Next"));
    first.service.dispose();

    const restarted = setup({}, first.database);
    const view = restarted.service.view("live");
    expect(view.current).toBeNull();
    expect(view.run).toBeNull();
    expect(view.items.map(item => [item.id, item.status, item.autoplay])).toEqual([[playing.id, "queued", false], [expect.any(String), "queued", false]]);
  });

  it("keeps a bounded finished history per purpose across restarts, newest first", () => {
    const first = setup();
    const insert = first.database.connection.prepare(`INSERT INTO video_requests (id, purpose, source_json, title, requester, submitted_via, duration_ms, status,
      hold_reason, limit_overridden, autoplay, position, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, 'management', 30000, ?, NULL, 0, 0, ?, ?, ?)`);
    const source = JSON.stringify({ provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 });
    const at = (index: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
    for (let index = 0; index < videoFinishedHistoryLimit + 5; index += 1) insert.run(`live-${index}`, "live", source, `Live ${index}`, index % 2 === 0 ? "played" : "removed", index, at(index), at(index));
    for (let index = 0; index < 3; index += 1) insert.run(`test-${index}`, "test", source, `Test ${index}`, "failed", index, at(index), at(index));
    const waiting = first.service.submit("live", clip("Still waiting"));
    first.service.dispose();

    const restarted = setup({}, first.database);
    const count = (purpose: string) => Number(first.database.connection.prepare("SELECT COUNT(*) AS n FROM video_requests WHERE purpose = ? AND status IN ('played', 'failed', 'removed')").get(purpose)?.n);
    expect(count("live")).toBe(videoFinishedHistoryLimit);
    expect(count("test")).toBe(3);
    expect(first.database.connection.prepare("SELECT id FROM video_requests WHERE id IN ('live-0', 'live-4', 'live-5')").all().map(row => row.id)).toEqual(["live-5"]);
    expect(restarted.service.view("live").items.map(item => item.id)).toEqual([waiting.id]);
  });

  describe("Recent and replay", () => {
    function playToEnd(service: VideoQueueService, scheduler: FakeScheduler, purpose: "live" | "test", title: string, durationMs = 30_000) {
      const item = service.submit(purpose, clip(title, durationMs));
      service.command(purpose, service.view(purpose).revision, { kind: "play-next" });
      service.reportStarted(item.id);
      scheduler.advance(1_000);
      service.reportEnded(item.id);
      scheduler.advance(1_000);
      return item;
    }

    it("lists played and failed items newest first with when they finished, and leaves removed items out", () => {
      const { service, scheduler } = setup();
      const played = playToEnd(service, scheduler, "live", "Played");
      const failed = service.submit("live", clip("Failed"));
      service.command("live", service.view("live").revision, { kind: "play-next" });
      scheduler.advance(videoLoadTimeoutMs);
      const skipped = service.submit("live", clip("Skipped"));
      service.command("live", service.view("live").revision, { kind: "play-next" });
      service.reportStarted(skipped.id);
      scheduler.advance(1_000);
      service.command("live", service.view("live").revision, { kind: "skip" });
      const removed = service.submit("live", clip("Removed"));
      service.command("live", service.view("live").revision, { kind: "remove", itemId: removed.id });
      service.submit("live", clip("Cleared"));
      service.command("live", service.view("live").revision, { kind: "clear" });

      const view = service.view("live");
      expect(view.recent.map(item => [item.id, item.status])).toEqual([[skipped.id, "played"], [failed.id, "failed"], [played.id, "played"]]);
      expect(view.recent[0]?.finishedAt).toBe(new Date(scheduler.now).toISOString());
      expect(view.recent.every((item, index, all) => index === 0 || all[index - 1]!.finishedAt >= item.finishedAt)).toBe(true);
      expect(view.items).toEqual([]);
    });

    it("bounds Recent and keeps purposes separate", () => {
      const { service, scheduler } = setup();
      for (let index = 1; index <= videoRecentLimit + 2; index += 1) playToEnd(service, scheduler, "live", `Live ${index}`);
      playToEnd(service, scheduler, "test", "Test only");
      const live = service.view("live").recent;
      expect(live).toHaveLength(videoRecentLimit);
      expect(live.map(item => item.title)).toEqual(Array.from({ length: videoRecentLimit }, (_, index) => `Live ${videoRecentLimit + 2 - index}`));
      expect(service.view("test").recent.map(item => item.title)).toEqual(["Test only"]);
    });

    it("replays a failed item as a new waiting request without starting it", () => {
      const { service, scheduler } = setup();
      const failed = service.submit("live", clip("Broken", 40_000, { via: "streamerbot", requester: "chatter", autoplay: true }));
      scheduler.advance(videoLoadTimeoutMs);
      const waiting = service.submit("live", clip("Waiting"));
      expect(service.view("live").recent.map(item => item.id)).toEqual([failed.id]);

      const replay = service.requeue("live", service.view("live").revision, failed.id, "operator");
      const view = service.view("live");
      expect(replay).toMatchObject({ source: failed.source, title: "Broken", requester: "chatter", durationMs: 40_000, submittedVia: "operator", autoplay: false, status: "queued", limitOverridden: false });
      expect(replay.id).not.toBe(failed.id);
      expect(view.current).toBeNull();
      expect(view.items.map(item => item.id)).toEqual([waiting.id, replay.id]);
      // The original stays in Recent, so it can be replayed again.
      expect(view.recent.map(item => item.id)).toEqual([failed.id]);
    });

    it("applies the current length limit to a replay", () => {
      const { service, scheduler, setConfig } = setup();
      const played = playToEnd(service, scheduler, "live", "Long-ish", 90_000);
      setConfig({ maxLengthSeconds: 60 });
      const replay = service.requeue("live", service.view("live").revision, played.id, "management");
      expect(replay).toMatchObject({ status: "held", holdReason: "over-limit", submittedVia: "management" });
    });

    it("rejects a stale revision and items not in this purpose's Recent without changing the queue", () => {
      const { service, scheduler } = setup();
      const played = playToEnd(service, scheduler, "live", "Played");
      const revision = service.view("live").revision;
      expect(() => service.requeue("live", revision - 1, played.id, "operator")).toThrow(VideoQueueConflictError);
      expect(() => service.requeue("test", service.view("test").revision, played.id, "operator")).toThrow(VideoQueueCommandError);
      const removed = service.submit("live", clip("Removed"));
      service.command("live", service.view("live").revision, { kind: "remove", itemId: removed.id });
      const waiting = service.submit("live", clip("Waiting"));
      for (const itemId of [removed.id, waiting.id, "video:missing"]) {
        expect(() => service.requeue("live", service.view("live").revision, itemId, "operator")).toThrow(VideoQueueCommandError);
      }
      expect(service.view("live").items.map(item => item.id)).toEqual([waiting.id]);
      expect(service.view("test").items).toEqual([]);
    });
  });
});
