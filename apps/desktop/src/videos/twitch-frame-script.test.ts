import { describe, expect, it } from "vitest";
import { providerFrameCleanScript, twitchFrameScript } from "./twitch-frame-script.js";
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

class FakeElement {
  clicks = 0;
  checked = false;
  constructor(readonly text = "", readonly onClick: () => void = () => undefined) {}
  click() { this.clicks += 1; this.onClick(); }
  closest() { return { textContent: this.text }; }
}

interface Menu { readonly settings?: FakeElement; readonly quality?: FakeElement; readonly options?: FakeElement[] }

function run(operation: TwitchFrameOperation, video: FakeVideo | null, storage: Map<string, string> | null, menu: Menu = {}, dataset: Record<string, string> = {}) {
  const localStorage = storage === null
    ? { setItem: () => { throw new Error("SecurityError"); } }
    : { setItem: (key: string, value: string) => { storage.set(key, value); } };
  const elements: Record<string, FakeElement | undefined> = {
    '[data-a-target="player-settings-button"]': menu.settings,
    '[data-a-target="player-settings-menu-item-quality"]': menu.quality
  };
  const document = {
    documentElement: { dataset },
    querySelector: (selector: string) => selector === "video" ? video : elements[selector] ?? null,
    querySelectorAll: () => menu.options ?? []
  };
  const evaluate = new Function("document", "localStorage", "HTMLVideoElement", "HTMLElement", `return ${twitchFrameScript(operation)};`) as
    (document: unknown, localStorage: unknown, video: unknown, element: unknown) => Promise<unknown>;
  return evaluate(document, localStorage, FakeVideo, FakeElement);
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

  it("picks the best listed quality once through the hidden settings menu", async () => {
    const source = new FakeElement("1080p60 (Source)");
    const auto = new FakeElement("Auto");
    const menu = { settings: new FakeElement(), quality: new FakeElement(), options: [auto, source] };
    const dataset: Record<string, string> = {};
    await run({ type: "state" }, new FakeVideo(), new Map(), menu, dataset);
    expect([auto.clicks, source.clicks, menu.settings.clicks]).toEqual([0, 1, 2]);
    expect(dataset.streamJamsQuality).toBe("set");
    await run({ type: "state" }, new FakeVideo(), new Map(), menu, dataset);
    expect(source.clicks).toBe(1);
  });

  it("leaves quality alone while paused or when the menu is missing", async () => {
    const paused = Object.assign(new FakeVideo(), { paused: true });
    const dataset: Record<string, string> = {};
    await run({ type: "state" }, paused, new Map(), {}, dataset);
    expect(dataset.streamJamsQuality).toBeUndefined();
    await expect(run({ type: "state" }, new FakeVideo(), new Map(), {}, dataset)).resolves.toMatchObject({ video: true });
    expect(dataset.streamJamsQuality).toBe("tried");
  });
});

describe("providerFrameCleanScript", () => {
  it("adds one style that leaves only the video visible", () => {
    const appended: { id: string; textContent: string }[] = [];
    const document = {
      getElementById: (id: string) => appended.find(element => element.id === id) ?? null,
      createElement: () => ({ id: "", textContent: "" }),
      head: { appendChild: (element: { id: string; textContent: string }) => { appended.push(element); } },
      documentElement: null
    };
    const evaluate = new Function("document", `return ${providerFrameCleanScript};`) as (document: unknown) => boolean;
    expect(evaluate(document)).toBe(true);
    expect(evaluate(document)).toBe(true);
    expect(appended).toHaveLength(1);
    expect(appended[0]?.textContent).toContain("body *{visibility:hidden!important}");
    expect(appended[0]?.textContent).toContain("video{visibility:visible!important");
  });
});
