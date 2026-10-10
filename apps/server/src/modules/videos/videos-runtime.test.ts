import { afterEach, describe, expect, it } from "vitest";
import { createDefaultVideosModuleConfig, type VideoControlSupport } from "@stream-jams/core";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { SqliteVideoQueueRepository } from "./video-queue-repository.js";
import { VideoQueueService } from "./video-queue-service.js";
import { toVideosProjection, VideosRuntime } from "./videos-runtime.js";

const databases: StreamJamsDatabase[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function setup() {
  const database = createInMemoryStreamJamsDatabase();
  database.runMigrations();
  databases.push(database);
  const config = createDefaultVideosModuleConfig();
  const queue = new VideoQueueService({
    repository: new SqliteVideoQueueRepository(database.connection), getConfig: () => config, now: () => 1_000_000,
    scheduler: { setTimeout: () => 0, clearTimeout: () => undefined }, createId: (() => { let id = 0; return () => `id${++id}`; })()
  });
  const mirror = { available: false, controls: new Map<string, VideoControlSupport>(), controlsFor(itemId: string) { return this.controls.get(itemId); } };
  const runtime = new VideosRuntime({ queue, intake: { submit: async () => { throw new Error("unused"); }, requeue: async () => { throw new Error("unused"); } }, getConfig: async () => config, now: () => 1_000_000, mirror });
  const item = queue.submit("live", { source: { provider: "twitch-clip", clipSlug: "FunnyClip" }, title: "Clip", requester: "viewer", durationMs: 30_000, autoplay: false, via: "management" });
  queue.command("live", queue.view("live").revision, { kind: "play-next" });
  const snapshot = async () => (await runtime.getModuleSnapshot({ purpose: "live" } as never)).presentation;
  return { runtime, queue, mirror, item, snapshot };
}

describe("VideosRuntime with the desktop mirror", () => {
  it("returns provider details in queue and Recent responses but keeps them off the stream caption", async () => {
    const { runtime, queue, item, snapshot } = setup();
    queue.applyMetadata("live", item.id, { title: "Provider clip title", channelName: "SpeedyStreamer", durationMs: null });
    const waiting = queue.submit("live", { source: { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }, title: null, requester: null, durationMs: null, autoplay: false, via: "operator" });
    queue.applyMetadata("live", waiting.id, { title: "Never Gonna Give You Up", channelName: "Rick Astley", durationMs: null });
    const response = runtime.response("live");
    expect(response.items.map(entry => ({ id: entry.id, title: entry.title, providerTitle: entry.providerTitle, channelName: entry.channelName, link: entry.link }))).toEqual([
      { id: item.id, title: "Clip", providerTitle: "Provider clip title", channelName: "SpeedyStreamer", link: "https://clips.twitch.tv/FunnyClip" },
      { id: waiting.id, title: null, providerTitle: "Never Gonna Give You Up", channelName: "Rick Astley", link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
    ]);
    // The overlay caption shows only the submitted title.
    expect(await snapshot()).toMatchObject({ videos: { status: "active", title: "Clip" } });
    expect(JSON.stringify(await snapshot())).not.toMatch(/Provider clip title|SpeedyStreamer/u);
    queue.reportStarted(item.id);
    queue.reportEnded(item.id);
    expect(runtime.response("live").recent[0]).toMatchObject({ id: item.id, providerTitle: "Provider clip title", channelName: "SpeedyStreamer" });
  });

  it("projects player delivery without the desktop app and mirror delivery while it runs", async () => {
    const { mirror, snapshot, queue, item } = setup();
    expect(await snapshot()).toMatchObject({ kind: "videos", videos: { status: "active", itemId: item.id, delivery: { mode: "player", source: { provider: "twitch-clip" } } } });
    mirror.available = true;
    expect(await snapshot()).toEqual({ kind: "videos", videos: expect.objectContaining({ status: "active", itemId: item.id, delivery: { mode: "mirror", paused: false, obsAudio: true } }) });
    // Mirror receivers learn only that something plays, never the provider source.
    expect(JSON.stringify(await snapshot())).not.toContain("FunnyClip");
    mirror.controls.set(item.id, { pause: true, seek: true });
    queue.reportStarted(item.id);
    queue.control("live", item.id, { kind: "pause" });
    expect(await snapshot()).toMatchObject({ videos: { delivery: { mode: "mirror", paused: true } } });
    mirror.available = false;
    expect(await snapshot()).toMatchObject({ videos: { delivery: { mode: "player", clock: { state: "paused" } } } });
  });

  it("places the video at the saved box for player and mirror delivery alike", async () => {
    const { snapshot, queue } = setup();
    expect(await snapshot()).toMatchObject({ videos: { layout: { x: 269, y: 140, width: 1382, height: 876 } } });
    const layout = { x: 1400, y: 40, width: 480, height: 320 };
    for (const mirrored of [false, true]) {
      expect(toVideosProjection(queue.view("live"), { obsAudio: true, layout }, mirrored)).toMatchObject({ status: "active", layout, delivery: { mode: mirrored ? "mirror" : "player" } });
    }
  });

  it("asks fallback players to start a loading item from its start position", async () => {
    const { snapshot, queue, item } = setup();
    expect(queue.view("live").current).toMatchObject({ phase: "loading", clock: { state: "paused", positionMs: 0 } });
    expect(await snapshot()).toMatchObject({ videos: { delivery: { mode: "player", clock: { state: "playing", positionMs: 0, atEpochMs: 1_000_000 } } } });
    queue.reportStarted(item.id);
    expect(await snapshot()).toMatchObject({ videos: { delivery: { mode: "player", clock: { state: "playing", positionMs: 0 } } } });
  });

  it("reports mirror availability and Twitch controls the desktop player detected", () => {
    const { runtime, mirror, item } = setup();
    expect(runtime.response("live")).toMatchObject({ mirror: { available: false }, current: { controls: { pause: false, seek: false } } });
    mirror.available = true;
    mirror.controls.set(item.id, { pause: true, seek: true });
    expect(runtime.response("live")).toMatchObject({ mirror: { available: true }, current: { controls: { pause: true, seek: true } } });
  });

  it("ignores browser player reports while the desktop player owns playback", () => {
    const { runtime, mirror, queue, item } = setup();
    mirror.available = true;
    expect(runtime.reportPlayback(`video:${item.id}`, "started")).toBe(true);
    expect(queue.view("live").current?.phase).toBe("loading");
    mirror.available = false;
    runtime.reportPlayback(`video:${item.id}`, "started");
    expect(queue.view("live").current?.phase).toBe("playing");
  });

  it("routes a fallback player's media length to the queue, which cuts an over-limit unknown-length item", () => {
    const { runtime, mirror, queue, item } = setup();
    queue.reportEnded(item.id);
    const unknown = queue.submit("live", { source: { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }, title: "Unknown", requester: null, durationMs: null, autoplay: false, via: "management" });
    queue.command("live", queue.view("live").revision, { kind: "play-next" });
    // While the desktop player owns playback, a browser fallback's length is ignored.
    mirror.available = true;
    expect(runtime.reportPlayback(`video:${unknown.id}`, "duration", 600_000)).toBe(true);
    expect(queue.view("live").current).toMatchObject({ phase: "loading", item: { id: unknown.id, durationMs: null } });
    mirror.available = false;
    // A duration report without a length changes nothing.
    expect(runtime.reportPlayback(`video:${unknown.id}`, "duration")).toBe(true);
    expect(queue.view("live").current?.item.durationMs).toBeNull();
    expect(runtime.reportPlayback(`video:${unknown.id}`, "started")).toBe(true);
    expect(runtime.reportPlayback(`video:${unknown.id}`, "duration", 600_000)).toBe(true);
    expect(queue.view("live").current).toBeNull();
    expect(queue.view("live").items).toEqual([expect.objectContaining({ id: unknown.id, status: "held", holdReason: "over-limit", durationMs: 600_000 })]);
  });

  it("learns a within-limit length and leaves non-video instructions to other coordinators", () => {
    const { runtime, queue, item } = setup();
    runtime.reportPlayback(`video:${item.id}`, "started");
    expect(runtime.reportPlayback(`video:${item.id}`, "duration", 31_000)).toBe(true);
    expect(queue.view("live").current).toMatchObject({ phase: "playing", item: { id: item.id, durationMs: 31_000 } });
    expect(runtime.reportPlayback("alert-instruction", "duration", 600_000)).toBe(false);
    expect(runtime.reportPlayback("alert-instruction", "started")).toBe(false);
    expect(queue.view("live").current).toMatchObject({ phase: "playing", item: { id: item.id, durationMs: 31_000 } });
  });
});
