import { describe, expect, it } from "vitest";
import { buildVideoPlayerUrl, canonicalVideoLink, isAllowedVideoSource, isSafeDirectVideoUrl, normalizeDirectVideoHost, parseOffsetMs, parseVideoLink } from "./providers.js";
import { videoSourceSchema } from "./contract.js";

const options = { allowedDirectHosts: ["media.example.com"] };
const player = { parentHost: "127.0.0.1", playerOrigin: "http://127.0.0.1:4580" };

describe("parseVideoLink", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90", { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 90_000 }],
    ["https://youtu.be/dQw4w9WgXcQ?t=1m30s", { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 90_000 }],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=5", { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 5_000 }],
    ["https://clips.twitch.tv/CleverClip-abc_1", { provider: "twitch-clip", clipSlug: "CleverClip-abc_1" }],
    ["https://clips.twitch.tv/embed?clip=CleverClip&parent=localhost", { provider: "twitch-clip", clipSlug: "CleverClip" }],
    ["https://www.twitch.tv/friendly_streamer/clip/CleverClip", { provider: "twitch-clip", clipSlug: "CleverClip" }],
    ["https://www.twitch.tv/videos/123456789?t=1h2m3s", { provider: "twitch-vod", videoId: "123456789", startAtMs: 3_723_000 }],
    ["https://media.example.com/clips/intro.MP4", { provider: "direct", url: "https://media.example.com/clips/intro.MP4" }]
  ])("accepts %s", (link, source) => {
    expect(parseVideoLink(link, options)).toEqual({ status: "accepted", source });
  });

  it.each([
    ["not a link", "invalid-link"],
    ["http://www.youtube.com/watch?v=dQw4w9WgXcQ", "unsafe-link"],
    ["https://user@www.youtube.com/watch?v=dQw4w9WgXcQ", "unsafe-link"],
    ["https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ", "unsafe-link"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=4", "unsafe-link"],
    ["https://www.youtube.com/watch?v=short", "invalid-link"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=dQw4w9WgXcR", "invalid-link"],
    ["https://www.twitch.tv/friendly_streamer", "invalid-link"],
    ["https://media.example.com/clips/intro.mov", "unsupported-source"],
    ["https://other.example.com/intro.mp4", "unsupported-source"],
    ["https://media.example.com.evil.test/intro.mp4", "unsupported-source"]
  ])("rejects %s as %s", (link, reason) => {
    expect(parseVideoLink(link, options)).toEqual({ status: "rejected", reason });
  });

  it("rejects overlong links", () => {
    expect(parseVideoLink(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=${"a".repeat(2048)}`, options)).toEqual({ status: "rejected", reason: "invalid-link" });
  });
});

describe("player URLs", () => {
  it("builds privacy-enhanced YouTube embeds with the JS API enabled", () => {
    const url = new URL(buildVideoPlayerUrl({ provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 90_500 }, player));
    expect(url.origin + url.pathname).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ enablejsapi: "1", start: "90", origin: "http://127.0.0.1:4580", controls: "0", disablekb: "1", fs: "0", iv_load_policy: "3", rel: "0" });
  });

  it("adds the Twitch parent host", () => {
    expect(buildVideoPlayerUrl({ provider: "twitch-clip", clipSlug: "Clip" }, player)).toBe("https://clips.twitch.tv/embed?clip=Clip&parent=127.0.0.1&autoplay=true&muted=false");
    expect(new URL(buildVideoPlayerUrl({ provider: "twitch-vod", videoId: "42", startAtMs: 3_723_000 }, player)).searchParams.get("time")).toBe("1h2m3s");
  });

  it("starts provider players muted when asked", () => {
    expect(new URL(buildVideoPlayerUrl({ provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 0 }, { ...player, muted: true })).searchParams.get("mute")).toBe("1");
    expect(new URL(buildVideoPlayerUrl({ provider: "twitch-clip", clipSlug: "Clip" }, { ...player, muted: true })).searchParams.get("muted")).toBe("true");
    expect(new URL(buildVideoPlayerUrl({ provider: "twitch-vod", videoId: "42", startAtMs: 0 }, { ...player, muted: true })).searchParams.get("muted")).toBe("true");
  });

  it("re-validates stored sources against the current allowlist", () => {
    const direct = { provider: "direct", url: "https://media.example.com/a.webm" } as const;
    expect(isAllowedVideoSource(direct, options)).toBe(true);
    expect(isAllowedVideoSource(direct, { allowedDirectHosts: [] })).toBe(false);
    expect(isAllowedVideoSource({ provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: -1 }, options)).toBe(false);
    expect(canonicalVideoLink({ provider: "twitch-vod", videoId: "42", startAtMs: 0 })).toBe("https://www.twitch.tv/videos/42");
  });
});

describe("helpers", () => {
  it("parses offsets", () => {
    expect(parseOffsetMs("75")).toBe(75_000);
    expect(parseOffsetMs("2m")).toBe(120_000);
    expect(parseOffsetMs("bogus")).toBe(0);
    expect(parseOffsetMs("")).toBe(0);
  });

  it("normalizes direct hosts", () => {
    expect(normalizeDirectVideoHost(" Media.Example.COM ")).toBe("media.example.com");
    expect(normalizeDirectVideoHost("localhost")).toBeNull();
    expect(normalizeDirectVideoHost("https://media.example.com")).toBeNull();
  });
});

describe("isSafeDirectVideoUrl", () => {
  it.each([
    ["https://media.example.com/a.mp4", true],
    ["https://media.example.com/clips/b.WEBM?v=2", true],
    ["http://media.example.com/a.mp4", false],
    ["https://user:pw@media.example.com/a.mp4", false],
    ["https://media.example.com:8443/a.mp4", false],
    ["https://media.example.com/a.mp4#t=5", false],
    ["https://127.0.0.1/a.mp4", false],
    ["https://media.example.com/a.mov", false],
    ["javascript:alert(1)//a.mp4", false],
    ["https://MEDIA.example.com/a.mp4", false]
  ])("checks %s", (url, expected) => {
    expect(isSafeDirectVideoUrl(url)).toBe(expected);
    expect(videoSourceSchema.safeParse({ provider: "direct", url }).success).toBe(expected);
  });
});
