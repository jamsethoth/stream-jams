import { describe, expect, it, vi } from "vitest";
import type { VideoSource } from "@stream-jams/core";
import { clipDurationMs, normalizeProviderText, parseTwitchVideoDurationMs, VideoMetadataLookup, videoMetadataMaximumResponseBytes, type TwitchMetadataAccess } from "./video-metadata-lookup.js";

const youtube: VideoSource = { provider: "youtube", videoId: "dQw4w9WgXcQ", startAtMs: 42_000 };
const clip: VideoSource = { provider: "twitch-clip", clipSlug: "FunnyClip-abc_123" };
const vod: VideoSource = { provider: "twitch-vod", videoId: "123456789", startAtMs: 0 };
const access: TwitchMetadataAccess = { accessToken: "secret-user-token", clientId: "client-id-1" };

interface Call { readonly url: string; readonly init: RequestInit | undefined }

function stubFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return respond(url);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function lookupWith(respond: (url: string) => Response | Promise<Response>, getTwitchAccess: () => Promise<TwitchMetadataAccess | null> = async () => access, timeoutMs?: number) {
  const { fetch, calls } = stubFetch(respond);
  return { lookup: new VideoMetadataLookup({ fetch, getTwitchAccess, timeoutMs }), calls };
}

describe("VideoMetadataLookup", () => {
  describe("YouTube oEmbed", () => {
    it("asks oEmbed for the canonical watch link and returns the title and channel without a length", async () => {
      const { lookup, calls } = lookupWith(() => json({ title: "Never Gonna Give You Up", author_name: "Rick Astley", html: "<iframe>", type: "video" }));
      await expect(lookup.lookup(youtube)).resolves.toEqual({ status: "found", metadata: { title: "Never Gonna Give You Up", channelName: "Rick Astley", durationMs: null } });
      expect(calls).toHaveLength(1);
      const url = new URL(calls[0]!.url);
      expect(url.origin + url.pathname).toBe("https://www.youtube.com/oembed");
      // Built from the video id only: no start offset or other submitted extras.
      expect(Object.fromEntries(url.searchParams)).toEqual({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", format: "json" });
      expect(calls[0]!.init).toMatchObject({ method: "GET", redirect: "error" });
      expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBeNull();
    });

    it("normalizes provider text: control characters, extra whitespace and overlong titles", async () => {
      const long = "A".repeat(250);
      const { lookup } = lookupWith(() => json({ title: `  Line\none\u0007 ${long}`, author_name: "\u202eChannel\t  Name " }));
      const result = await lookup.lookup(youtube);
      expect(result.status).toBe("found");
      if (result.status !== "found") return;
      expect(result.metadata.title).toHaveLength(200);
      expect(result.metadata.title?.startsWith("Line one A")).toBe(true);
      expect(result.metadata.title?.endsWith("…")).toBe(true);
      expect(result.metadata.channelName).toBe("Channel Name");
    });

    it("reports a malformed answer as an invalid response", async () => {
      for (const body of [{ title: 42 }, ["list"], {}, { title: "   " }]) {
        const { lookup } = lookupWith(() => json(body));
        await expect(lookup.lookup(youtube)).resolves.toEqual({ status: "failed", reason: "invalid-response" });
      }
      const { lookup } = lookupWith(() => new Response("<html>not json</html>", { status: 200 }));
      await expect(lookup.lookup(youtube)).resolves.toEqual({ status: "failed", reason: "invalid-response" });
    });

    it("refuses an oversized answer without parsing it", async () => {
      const { lookup } = lookupWith(() => new Response("x", { status: 200, headers: { "content-length": String(videoMetadataMaximumResponseBytes + 1) } }));
      await expect(lookup.lookup(youtube)).resolves.toEqual({ status: "failed", reason: "invalid-response" });
      const big = lookupWith(() => new Response(JSON.stringify({ title: "x".repeat(videoMetadataMaximumResponseBytes) }), { status: 200 }));
      await expect(big.lookup.lookup(youtube)).resolves.toEqual({ status: "failed", reason: "invalid-response" });
    });

    it("reports an HTTP error with its status", async () => {
      const { lookup } = lookupWith(() => new Response("Unauthorized", { status: 401 }));
      await expect(lookup.lookup(youtube)).resolves.toEqual({ status: "failed", reason: "http-status", httpStatus: 401 });
    });

    it("gives up after the timeout with a single attempt", async () => {
      const { lookup, calls } = lookupWith((url) => new Promise<Response>((_resolve, reject) => {
        const signal = calls.find(call => call.url === url)?.init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason as Error));
      }), async () => access, 20);
      await expect(lookup.lookup(youtube)).resolves.toEqual({ status: "failed", reason: "timeout" });
      expect(calls).toHaveLength(1);
    });

    it("reports a transport failure without the request details", async () => {
      const { lookup } = lookupWith(() => { throw new TypeError("fetch failed for https://www.youtube.com/oembed?url=..."); });
      await expect(lookup.lookup(youtube)).resolves.toEqual({ status: "failed", reason: "network" });
    });

    it("stops when the caller cancels", async () => {
      const controller = new AbortController();
      const { lookup, calls } = lookupWith((url) => new Promise<Response>((_resolve, reject) => {
        const signal = calls.find(call => call.url === url)?.init?.signal;
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        controller.abort();
      }));
      await expect(lookup.lookup(youtube, controller.signal)).resolves.toEqual({ status: "failed", reason: "aborted" });
    });
  });

  describe("Twitch Helix", () => {
    it("looks up a clip with the connected account's token and reads its fractional length", async () => {
      const { lookup, calls } = lookupWith(() => json({ data: [{ id: "FunnyClip-abc_123", title: "Clutch round", broadcaster_name: "SpeedyStreamer", duration: 28.4, url: "https://clips.twitch.tv/x" }], pagination: {} }));
      await expect(lookup.lookup(clip)).resolves.toEqual({ status: "found", metadata: { title: "Clutch round", channelName: "SpeedyStreamer", durationMs: 28_400 } });
      expect(calls[0]!.url).toBe("https://api.twitch.tv/helix/clips?id=FunnyClip-abc_123");
      const headers = new Headers(calls[0]!.init?.headers);
      expect(headers.get("authorization")).toBe("Bearer secret-user-token");
      expect(headers.get("client-id")).toBe("client-id-1");
    });

    it("looks up a VOD and parses its length", async () => {
      const { lookup, calls } = lookupWith(() => json({ data: [{ id: "123456789", title: "Marathon", user_name: "SpeedyStreamer", duration: "1h2m3s" }] }));
      await expect(lookup.lookup(vod)).resolves.toEqual({ status: "found", metadata: { title: "Marathon", channelName: "SpeedyStreamer", durationMs: 3_723_000 } });
      expect(calls[0]!.url).toBe("https://api.twitch.tv/helix/videos?id=123456789");
    });

    it("keeps the title when the length is unusable", async () => {
      const { lookup } = lookupWith(() => json({ data: [{ id: "123456789", title: "Marathon", user_name: "SpeedyStreamer", duration: "soon" }] }));
      await expect(lookup.lookup(vod)).resolves.toEqual({ status: "found", metadata: { title: "Marathon", channelName: "SpeedyStreamer", durationMs: null } });
    });

    it("reports a missing or mismatched video as not found and a malformed answer as invalid", async () => {
      await expect(lookupWith(() => json({ data: [] })).lookup.lookup(clip)).resolves.toEqual({ status: "failed", reason: "not-found" });
      await expect(lookupWith(() => json({ data: [{ id: "OtherClip", title: "x" }] })).lookup.lookup(clip)).resolves.toEqual({ status: "failed", reason: "not-found" });
      await expect(lookupWith(() => json({ data: "nope" })).lookup.lookup(clip)).resolves.toEqual({ status: "failed", reason: "invalid-response" });
      await expect(lookupWith(() => json({ data: [{ id: "123456789", duration: 5 }] })).lookup.lookup(vod)).resolves.toEqual({ status: "failed", reason: "invalid-response" });
    });

    it("skips quietly without a connected account and never calls Twitch", async () => {
      const { lookup, calls } = lookupWith(() => json({}), async () => null);
      await expect(lookup.lookup(clip)).resolves.toEqual({ status: "skipped", reason: "twitch-not-connected" });
      const unreadable = lookupWith(() => json({}), async () => { throw new Error("keyring locked"); });
      await expect(unreadable.lookup.lookup(vod)).resolves.toEqual({ status: "skipped", reason: "twitch-not-connected" });
      expect([...calls, ...unreadable.calls]).toEqual([]);
    });

    it("reports a rejected token as an HTTP error", async () => {
      const { lookup } = lookupWith(() => json({ error: "Unauthorized", message: "Invalid OAuth token" }, 401));
      await expect(lookup.lookup(clip)).resolves.toEqual({ status: "failed", reason: "http-status", httpStatus: 401 });
    });
  });

  it("never looks up direct files", async () => {
    const { lookup, calls } = lookupWith(() => json({}));
    await expect(lookup.lookup({ provider: "direct", url: "https://videos.example.com/a.mp4" })).resolves.toEqual({ status: "skipped", reason: "not-supported" });
    expect(calls).toEqual([]);
  });
});

describe("parseTwitchVideoDurationMs", () => {
  it.each([
    ["1h2m3s", 3_723_000],
    ["4m5s", 245_000],
    ["59s", 59_000],
    ["2h", 7_200_000],
    ["10m", 600_000],
    ["24h", 86_400_000],
    [" 3m0s ", 180_000]
  ])("parses %s", (value, expected) => {
    expect(parseTwitchVideoDurationMs(value)).toBe(expected);
  });

  it.each(["", "0s", "0h0m0s", "25h", "1h2m3", "3s2m", "-5s", "1.5s", "abc", "1h 2m", "PT1H"])("treats %j as unknown", (value) => {
    expect(parseTwitchVideoDurationMs(value)).toBeNull();
  });
});

describe("clipDurationMs", () => {
  it("rounds fractional seconds and rejects unusable values", () => {
    expect(clipDurationMs(28.4)).toBe(28_400);
    expect(clipDurationMs(0.0004)).toBeNull();
    expect(clipDurationMs(0)).toBeNull();
    expect(clipDurationMs(-1)).toBeNull();
    expect(clipDurationMs(Number.NaN)).toBeNull();
    expect(clipDurationMs(Number.POSITIVE_INFINITY)).toBeNull();
    expect(clipDurationMs(undefined)).toBeNull();
    expect(clipDurationMs(24 * 60 * 60 + 1)).toBeNull();
  });
});

describe("normalizeProviderText", () => {
  it("keeps surrogate pairs whole when it shortens text", () => {
    const text = normalizeProviderText("😀".repeat(150), 200);
    expect(text).not.toBeNull();
    expect(text!.length).toBeLessThanOrEqual(200);
    expect(text!.endsWith("😀…")).toBe(true);
    expect(normalizeProviderText(" \n\t ", 10)).toBeNull();
    expect(normalizeProviderText(undefined, 10)).toBeNull();
  });
});
