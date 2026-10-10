import type { VideoLinkParseResult, VideoSource } from "./types.js";

/*
 * Provider allowlist for the Videos module, published as the
 * `@stream-jams/core/videos` subpath so it stays out of the management bundle.
 * Submissions are links; Stream Jams builds every player URL itself.
 */

export const videoMaximumLinkLength = 2048;

const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/u;
const twitchClipSlugPattern = /^[A-Za-z0-9_-]{1,100}$/u;
const twitchVodIdPattern = /^\d{1,20}$/u;
const twitchLoginPattern = /^[A-Za-z0-9_]{1,25}$/u;
const directExtensionPattern = /\.(?:mp4|webm)$/iu;
const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

const youtubeWatchHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const youtubeEmbedHosts = new Set(["www.youtube-nocookie.com", "youtube-nocookie.com"]);
const twitchHosts = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

/** Lowercases and validates an operator-entered direct-file host, or returns null. */
export function normalizeDirectVideoHost(value: string): string | null {
  const host = value.trim().toLowerCase();
  return hostnamePattern.test(host) ? host : null;
}

/**
 * Host-independent checks for a direct-file URL: HTTPS, a plain hostname, no login, port or
 * fragment, and an .mp4 or .webm path. Overlays apply this; the server also checks the host allowlist.
 */
export function isSafeDirectVideoUrl(value: string): boolean {
  if (value.length > videoMaximumLinkLength || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.href === value && url.protocol === "https:" && url.username === "" && url.password === "" && url.port === "" && url.hash === "" &&
    hostnamePattern.test(url.hostname) && directExtensionPattern.test(url.pathname);
}

export interface ParseVideoLinkOptions {
  readonly allowedDirectHosts: readonly string[];
}

export function parseVideoLink(value: string, options: ParseVideoLinkOptions): VideoLinkParseResult {
  const link = value.trim();
  if (link === "" || link.length > videoMaximumLinkLength || !URL.canParse(link)) return rejected("invalid-link");
  const url = new URL(link);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" || url.hash !== "") {
    return rejected("unsafe-link");
  }
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(segment => segment !== "");

  if (youtubeWatchHosts.has(host) || host === "youtu.be" || youtubeEmbedHosts.has(host)) {
    const videoId = youtubeVideoId(host, segments, url.searchParams);
    if (videoId === null) return rejected("invalid-link");
    return accepted({ provider: "youtube", videoId, startAtMs: parseOffsetMs(url.searchParams.get("t") ?? url.searchParams.get("start")) });
  }
  if (host === "clips.twitch.tv") {
    const slug = segments.length === 1 && segments[0] === "embed" ? single(url.searchParams.getAll("clip")) : segments.length === 1 ? segments[0] : null;
    return slug !== null && slug !== undefined && twitchClipSlugPattern.test(slug) ? accepted({ provider: "twitch-clip", clipSlug: slug }) : rejected("invalid-link");
  }
  if (twitchHosts.has(host)) {
    const [first, second, third] = segments;
    if (segments.length === 2 && first === "videos" && second !== undefined && twitchVodIdPattern.test(second)) {
      return accepted({ provider: "twitch-vod", videoId: second, startAtMs: parseOffsetMs(url.searchParams.get("t")) });
    }
    if (segments.length === 3 && first !== undefined && twitchLoginPattern.test(first) && second === "clip" && third !== undefined && twitchClipSlugPattern.test(third)) {
      return accepted({ provider: "twitch-clip", clipSlug: third });
    }
    return rejected("invalid-link");
  }
  if (options.allowedDirectHosts.includes(host)) {
    return directExtensionPattern.test(url.pathname) ? accepted({ provider: "direct", url: url.href }) : rejected("unsupported-source");
  }
  return rejected("unsupported-source");
}

export interface VideoPlayerUrlOptions {
  /** Host Twitch requires as `parent`: the host serving the player page. */
  readonly parentHost: string;
  /** Origin of the player page, given to YouTube so its postMessage events target it. */
  readonly playerOrigin: string;
  /** Starts the provider player muted, for outputs that must not carry sound. */
  readonly muted?: boolean | undefined;
}

/** Builds the provider player URL for a validated source. Direct files return their own URL. */
export function buildVideoPlayerUrl(source: VideoSource, options: VideoPlayerUrlOptions): string {
  switch (source.provider) {
    case "youtube": {
      const url = new URL(`https://www.youtube-nocookie.com/embed/${source.videoId}`);
      url.search = new URLSearchParams({
        // No player chrome on stream: Stream Jams drives YouTube through its iframe API instead.
        enablejsapi: "1", playsinline: "1", autoplay: "1", rel: "0", controls: "0", disablekb: "1", fs: "0", iv_load_policy: "3",
        start: String(Math.floor(source.startAtMs / 1000)), origin: options.playerOrigin, mute: options.muted === true ? "1" : "0"
      }).toString();
      return url.href;
    }
    case "twitch-clip":
      return `https://clips.twitch.tv/embed?${new URLSearchParams({ clip: source.clipSlug, parent: options.parentHost, autoplay: "true", muted: String(options.muted === true) }).toString()}`;
    case "twitch-vod":
      return `https://player.twitch.tv/?${new URLSearchParams({
        video: `v${source.videoId}`, parent: options.parentHost, autoplay: "true", muted: String(options.muted === true), time: formatTwitchTime(source.startAtMs)
      }).toString()}`;
    case "direct":
      return source.url;
  }
}

/** The origin player commands may be posted to, or null for Stream Jams' own `<video>`. */
export function videoProviderOrigin(source: VideoSource): string | null {
  switch (source.provider) {
    case "youtube": return "https://www.youtube-nocookie.com";
    case "twitch-clip": return "https://clips.twitch.tv";
    case "twitch-vod": return "https://player.twitch.tv";
    case "direct": return null;
  }
}

/** A readable link for management and operator lists. */
export function canonicalVideoLink(source: VideoSource): string {
  switch (source.provider) {
    case "youtube": return `https://www.youtube.com/watch?v=${source.videoId}`;
    case "twitch-clip": return `https://clips.twitch.tv/${source.clipSlug}`;
    case "twitch-vod": return `https://www.twitch.tv/videos/${source.videoId}`;
    case "direct": return source.url;
  }
}

/** Re-checks a stored or received source against the allowlist before it renders. */
export function isAllowedVideoSource(source: VideoSource, options: ParseVideoLinkOptions): boolean {
  const reparsed = parseVideoLink(canonicalVideoLink(source), options);
  if (reparsed.status !== "accepted") return false;
  const startAtMs = "startAtMs" in source ? source.startAtMs : null;
  return reparsed.source.provider === source.provider &&
    canonicalVideoLink(reparsed.source) === canonicalVideoLink(source) &&
    (startAtMs === null || (Number.isInteger(startAtMs) && startAtMs >= 0 && startAtMs <= maximumOffsetMs));
}

const maximumOffsetMs = 24 * 60 * 60 * 1000;

/** Parses `90`, `90s`, `1m30s` or `1h2m3s`; anything else is no offset. */
export function parseOffsetMs(value: string | null): number {
  if (value === null) return 0;
  const match = /^(?:(\d{1,2})h)?(?:(\d{1,4})m)?(?:(\d{1,6})s?)?$/u.exec(value.trim());
  if (match === null || value.trim() === "") return 0;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  const total = ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000;
  return total <= maximumOffsetMs ? total : 0;
}

function formatTwitchTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 3600)}h${Math.floor((total % 3600) / 60)}m${total % 60}s`;
}

function youtubeVideoId(host: string, segments: readonly string[], params: URLSearchParams): string | null {
  let candidate: string | null | undefined = null;
  if (host === "youtu.be") candidate = segments.length === 1 ? segments[0] : null;
  else if (youtubeEmbedHosts.has(host)) candidate = segments.length === 2 && segments[0] === "embed" ? segments[1] : null;
  else if (segments.length === 1 && segments[0] === "watch") candidate = single(params.getAll("v"));
  else if (segments.length === 2 && (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live")) candidate = segments[1];
  return candidate !== null && candidate !== undefined && youtubeIdPattern.test(candidate) ? candidate : null;
}

function single(values: readonly string[]): string | null {
  return values.length === 1 ? values[0] ?? null : null;
}

function accepted(source: VideoSource): VideoLinkParseResult {
  return { status: "accepted", source };
}

function rejected(reason: "invalid-link" | "unsafe-link" | "unsupported-source"): VideoLinkParseResult {
  return { status: "rejected", reason };
}
