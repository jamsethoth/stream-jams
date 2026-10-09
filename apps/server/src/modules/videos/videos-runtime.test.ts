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
  const runtime = new VideosRuntime({ queue, intake: { submit: async () => { throw new Error("unused"); } }, getConfig: async () => config, now: () => 1_000_000, mirror });
  const item = queue.submit("live", { source: { provider: "twitch-clip", clipSlug: "FunnyClip" }, title: "Clip", requester: "viewer", durationMs: 30_000, autoplay: false, via: "management" });
  queue.command("live", queue.view("live").revision, { kind: "play-next" });
  const snapshot = async () => (await runtime.getModuleSnapshot({ purpose: "live" } as never)).presentation;
  return { runtime, queue, mirror, item, snapshot };
}

describe("VideosRuntime with the desktop mirror", () => {
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
});
