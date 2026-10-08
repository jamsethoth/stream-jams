import { afterEach, describe, expect, it } from "vitest";
import { createDefaultVideosModuleConfig, type VideosModuleConfig } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { SqliteVideoQueueRepository, VideoQueueConflictError } from "./video-queue-repository.js";
import { VideoQueueCommandError, VideoQueueService, videoEndGraceMs, videoLoadTimeoutMs, type VideoSubmission } from "./video-queue-service.js";

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
    repository: new SqliteVideoQueueRepository(database.connection),
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

  it("holds over-limit and unknown-length items and releases them on Play anyway", () => {
    const { service } = setup({ maxLengthSeconds: 60 });
    const long = service.submit("live", clip("Long", 90_000));
    const unknown = service.submit("live", clip("Unknown", null));
    expect(service.view("live").items.map(item => item.holdReason)).toEqual(["over-limit", "unknown-length"]);
    expect(() => service.command("live", service.view("live").revision, { kind: "play-next" })).toThrow(VideoQueueCommandError);

    service.command("live", service.view("live").revision, { kind: "play-anyway", itemId: long.id });
    expect(service.view("live").current?.item).toMatchObject({ id: long.id, limitOverridden: true });
    expect(service.view("live").items.find(item => item.id === unknown.id)?.status).toBe("held");
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
});
