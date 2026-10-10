import { z } from "zod";
import type { VideoMetadata, VideoSource } from "@stream-jams/core";
import { canonicalVideoLink, videoMediaDurationMaximumMs } from "@stream-jams/core/videos";

/** One attempt per request; a slower provider leaves the item as it was queued. */
export const videoMetadataLookupTimeoutMs = 5_000;
/** Provider answers are a few hundred bytes; anything larger is refused unread. */
export const videoMetadataMaximumResponseBytes = 256 * 1024;
const youtubeOembedEndpoint = "https://www.youtube.com/oembed";
const twitchHelixBaseUrl = "https://api.twitch.tv/helix";
const maximumTitleLength = 200;
const maximumChannelNameLength = 100;

/** The connected Twitch account's user token and the app client id, read from the existing connection. */
export interface TwitchMetadataAccess {
  readonly accessToken: string;
  readonly clientId: string;
}

export interface VideoMetadataLookupOptions {
  /** Outbound HTTPS; tests and acceptance runs inject a stub so nothing reaches YouTube or Twitch. */
  readonly fetch?: typeof fetch | undefined;
  /** Returns null when no Twitch account is connected; Twitch lookups are then skipped. */
  readonly getTwitchAccess: () => Promise<TwitchMetadataAccess | null>;
  readonly timeoutMs?: number | undefined;
}

export type VideoMetadataLookupFailure = "timeout" | "aborted" | "network" | "http-status" | "invalid-response" | "not-found";

export type VideoMetadataLookupResult =
  | { readonly status: "found"; readonly metadata: VideoMetadata }
  | { readonly status: "skipped"; readonly reason: "not-supported" | "twitch-not-connected" }
  | { readonly status: "failed"; readonly reason: VideoMetadataLookupFailure; readonly httpStatus?: number };

const youtubeOembedSchema = z.object({
  title: z.string().optional(),
  author_name: z.string().optional()
});

const twitchClipsSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    title: z.string().optional(),
    broadcaster_name: z.string().optional(),
    duration: z.number().optional()
  }))
});

const twitchVideosSchema = z.object({
  data: z.array(z.object({
    id: z.string(),
    title: z.string().optional(),
    user_name: z.string().optional(),
    duration: z.string().optional()
  }))
});

type JsonResult = { readonly ok: true; readonly body: unknown } | { readonly ok: false; readonly failure: Extract<VideoMetadataLookupResult, { status: "failed" }> };

/**
 * Looks up the title, channel and (for Twitch) the length of a validated video source. Requests
 * go only to YouTube oEmbed and the Twitch Helix API, built from the normalized source rather
 * than the submitted link, with no redirects, a bounded body and a single timed attempt. Answers
 * are validated here and only normalized text and lengths leave this boundary.
 */
export class VideoMetadataLookup {
  readonly #fetch: typeof fetch;
  readonly #getTwitchAccess: () => Promise<TwitchMetadataAccess | null>;
  readonly #timeoutMs: number;

  constructor(options: VideoMetadataLookupOptions) {
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#getTwitchAccess = options.getTwitchAccess;
    this.#timeoutMs = options.timeoutMs ?? videoMetadataLookupTimeoutMs;
  }

  async lookup(source: VideoSource, signal?: AbortSignal): Promise<VideoMetadataLookupResult> {
    switch (source.provider) {
      case "youtube": return this.#youtube(source, signal);
      case "twitch-clip": return this.#twitch(`${twitchHelixBaseUrl}/clips?${new URLSearchParams({ id: source.clipSlug }).toString()}`, signal, body => {
        const parsed = twitchClipsSchema.safeParse(body);
        if (!parsed.success) return null;
        const clip = parsed.data.data.find(candidate => candidate.id === source.clipSlug);
        return clip === undefined ? "not-found" : metadata(clip.title, clip.broadcaster_name, clipDurationMs(clip.duration));
      });
      case "twitch-vod": return this.#twitch(`${twitchHelixBaseUrl}/videos?${new URLSearchParams({ id: source.videoId }).toString()}`, signal, body => {
        const parsed = twitchVideosSchema.safeParse(body);
        if (!parsed.success) return null;
        const video = parsed.data.data.find(candidate => candidate.id === source.videoId);
        return video === undefined ? "not-found" : metadata(video.title, video.user_name, video.duration === undefined ? null : parseTwitchVideoDurationMs(video.duration));
      });
      case "direct": return { status: "skipped", reason: "not-supported" };
    }
  }

  async #youtube(source: Extract<VideoSource, { provider: "youtube" }>, signal: AbortSignal | undefined): Promise<VideoMetadataLookupResult> {
    // The canonical watch link carries only the validated video id, never the submitted link's extras.
    const url = `${youtubeOembedEndpoint}?${new URLSearchParams({ url: canonicalVideoLink({ ...source, startAtMs: 0 }), format: "json" }).toString()}`;
    const response = await this.#getJson(url, { accept: "application/json" }, signal);
    if (!response.ok) return response.failure;
    const parsed = youtubeOembedSchema.safeParse(response.body);
    if (!parsed.success) return failed("invalid-response");
    const found = metadata(parsed.data.title, parsed.data.author_name, null);
    return found === null ? failed("invalid-response") : { status: "found", metadata: found };
  }

  async #twitch(url: string, signal: AbortSignal | undefined, parse: (body: unknown) => VideoMetadata | "not-found" | null): Promise<VideoMetadataLookupResult> {
    let access: TwitchMetadataAccess | null;
    try {
      access = await this.#getTwitchAccess();
    }
    // error-provenance: allow expected -- an unreadable connection is the same as no connection for an optional lookup
    catch {
      access = null;
    }
    if (access === null) return { status: "skipped", reason: "twitch-not-connected" };
    const response = await this.#getJson(url, { accept: "application/json", authorization: `Bearer ${access.accessToken}`, "client-id": access.clientId }, signal);
    if (!response.ok) return response.failure;
    const found = parse(response.body);
    if (found === "not-found") return failed("not-found");
    return found === null ? failed("invalid-response") : { status: "found", metadata: found };
  }

  async #getJson(url: string, headers: Record<string, string>, signal: AbortSignal | undefined): Promise<JsonResult> {
    const timeout = AbortSignal.timeout(this.#timeoutMs);
    const combined = signal === undefined ? timeout : AbortSignal.any([timeout, signal]);
    try {
      const response = await this.#fetch(url, { method: "GET", headers, redirect: "error", signal: combined });
      if (!response.ok) {
        await discardBody(response);
        return { ok: false, failure: failed("http-status", response.status) };
      }
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (Number.isFinite(declared) && declared > videoMetadataMaximumResponseBytes) {
        await discardBody(response);
        return { ok: false, failure: failed("invalid-response") };
      }
      const text = await response.text();
      if (text.length > videoMetadataMaximumResponseBytes) return { ok: false, failure: failed("invalid-response") };
      try {
        return { ok: true, body: JSON.parse(text) as unknown };
      }
      // error-provenance: allow expected -- a malformed provider answer is reported as an invalid response
      catch {
        return { ok: false, failure: failed("invalid-response") };
      }
    }
    // error-provenance: allow expected -- transport failures become a bounded reason; the error may carry the request URL
    catch {
      if (signal?.aborted === true) return { ok: false, failure: failed("aborted") };
      return { ok: false, failure: failed(timeout.aborted ? "timeout" : "network") };
    }
  }
}

/**
 * Parses a Twitch video length such as `1h2m3s`, `4m5s` or `59s`. Anything else, a zero length,
 * or one over the longest length a player may report is unknown.
 */
export function parseTwitchVideoDurationMs(value: string): number | null {
  const match = /^(?:(\d{1,3})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s)?$/u.exec(value.trim());
  if (match === null || value.trim() === "") return null;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  const total = ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000;
  return total > 0 && total <= videoMediaDurationMaximumMs ? total : null;
}

/** A Twitch clip length in (fractional) seconds, as whole milliseconds, or null when unusable. */
export function clipDurationMs(seconds: number | undefined): number | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
  const ms = Math.round(seconds * 1000);
  return ms > 0 && ms <= videoMediaDurationMaximumMs ? ms : null;
}

/** Collapses whitespace, drops control characters and bounds provider text; empty text is unknown. */
export function normalizeProviderText(value: string | undefined, maximumLength: number): string | null {
  if (value === undefined) return null;
  // eslint-disable-next-line no-control-regex -- provider text may carry control characters that must never render
  const cleaned = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/gu, " ").replace(/\s+/gu, " ").trim();
  if (cleaned === "") return null;
  if (cleaned.length <= maximumLength) return cleaned;
  // Cut on whole code points so a surrogate pair is never split, leaving room for the ellipsis.
  let kept = "";
  for (const character of cleaned) {
    if (kept.length + character.length > maximumLength - 1) break;
    kept += character;
  }
  return `${kept.trimEnd()}…`;
}

function metadata(title: string | undefined, channelName: string | undefined, durationMs: number | null): VideoMetadata | null {
  const result = {
    title: normalizeProviderText(title, maximumTitleLength),
    channelName: normalizeProviderText(channelName, maximumChannelNameLength),
    durationMs
  };
  return result.title === null && result.channelName === null && result.durationMs === null ? null : result;
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  }
  // error-provenance: allow expected -- an unread body that fails to cancel changes nothing about the bounded failure already chosen
  catch {
    return;
  }
}

function failed(reason: VideoMetadataLookupFailure, httpStatus?: number): Extract<VideoMetadataLookupResult, { status: "failed" }> {
  return httpStatus === undefined ? { status: "failed", reason } : { status: "failed", reason, httpStatus };
}
