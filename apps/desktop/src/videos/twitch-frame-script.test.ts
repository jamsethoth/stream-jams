import { describe, expect, it } from "vitest";
import { twitchFrameScript } from "./twitch-frame-script.js";
import type { TwitchFrameOperation } from "./video-player-host.js";

class FakeVideo {
  muted = true;
  volume = 0.5;
  paused = false;
  ended = false;
  currentTime = 4.2;
  duration = 30;
  pause() { this.paused = true; }
  async play() { this.paused = false; }
}

function run(operation: TwitchFrameOperation, video: FakeVideo | null, storage: Map<string, string> | null) {
  const localStorage = storage === null
    ? { setItem: () => { throw new Error("SecurityError"); } }
    : { setItem: (key: string, value: string) => { storage.set(key, value); } };
  const document = { querySelector: () => video };
  const evaluate = new Function("document", "localStorage", "HTMLVideoElement", `return ${twitchFrameScript(operation)};`) as
    (document: unknown, localStorage: unknown, element: unknown) => Promise<unknown>;
  return evaluate(document, localStorage, FakeVideo);
}

describe("twitchFrameScript", () => {
  it("unmutes the provider at full volume and remembers volume and source quality", async () => {
    const video = new FakeVideo();
    const storage = new Map<string, string>();
    await expect(run({ type: "state" }, video, storage)).resolves.toEqual({ video: true, paused: false, ended: false, positionMs: 4200, durationMs: 30_000 });
    expect(video).toMatchObject({ muted: false, volume: 1 });
    expect(Object.fromEntries(storage)).toEqual({ "video-muted": "{\"default\":false}", volume: "1", "video-quality": "{\"default\":\"chunked\"}" });
  });

  it("still steers the video when the frame refuses storage", async () => {
    const video = new FakeVideo();
    await expect(run({ type: "pause" }, video, null)).resolves.toMatchObject({ video: true, paused: true });
    expect(video.muted).toBe(false);
  });

  it("seeks within the clip and reports no video when the frame has none", async () => {
    const video = new FakeVideo();
    await run({ type: "seek", positionMs: 90_000 }, video, new Map());
    expect(video.currentTime).toBe(29.5);
    await expect(run({ type: "state" }, null, new Map())).resolves.toEqual({ video: false });
  });
});
