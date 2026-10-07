import { z } from "zod";
import { nonNegativeIntegerSchema, positiveIntegerSchema } from "../shared/schemas.js";
import { videoShoutoutMaximumDurationMs, videoShoutoutMaximumUrlLength } from "./schemas.js";
import type { VideoShoutoutClip, VideoShoutoutProjection } from "./types.js";

/*
 * The strict video shoutout contract is published as the
 * `@stream-jams/core/video-shoutout` subpath instead of the root barrel, so it
 * ships only with the overlay renderer and server intake and stays out of the
 * management bundle.
 */

export const twitchLoginSchema = z.string().trim().regex(/^[A-Za-z0-9_]{1,25}$/u);
export const twitchClipIdSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/u);
export const videoShoutoutDisplayNameSchema = z.string().trim().min(1).max(64);
export const videoShoutoutTitleSchema = z.string().trim().min(1).max(200);
const activationIdSchema = z.string().min(1).max(128);

const twitchClipEmbedHosts: Readonly<Record<string, string>> = {
  "clips.twitch.tv": "/embed",
  "player.twitch.tv": "/"
};

/**
 * Returns the embed URL when it is an HTTPS Twitch clip embed for exactly this
 * clip, or null. Stream Jams renders the URL as given and never rewrites it.
 */
export function validateTwitchClipEmbedUrl(value: string, clipId: string): string | null {
  if (value.length > videoShoutoutMaximumUrlLength || !URL.canParse(value)) return null;
  const url = new URL(value);
  const expectedPath = Object.hasOwn(twitchClipEmbedHosts, url.hostname) ? twitchClipEmbedHosts[url.hostname] : undefined;
  if (
    expectedPath === undefined ||
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.hash !== "" ||
    url.pathname !== expectedPath
  ) {
    return null;
  }
  const clips = url.searchParams.getAll("clip");
  // Twitch refuses to render embeds without a parent domain.
  if (clips.length !== 1 || clips[0] !== clipId || url.searchParams.getAll("parent").length === 0) return null;
  return value;
}

/** Returns the URL when it is a credential-free HTTPS image URL, or null so the avatar is omitted. */
export function validateVideoShoutoutAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > videoShoutoutMaximumUrlLength || !URL.canParse(trimmed)) return null;
  const url = new URL(trimmed);
  return url.protocol === "https:" && url.username === "" && url.password === "" ? trimmed : null;
}

export const videoShoutoutClipSchema = z.object({
  login: twitchLoginSchema,
  displayName: videoShoutoutDisplayNameSchema,
  clipId: twitchClipIdSchema,
  embedUrl: z.string().max(videoShoutoutMaximumUrlLength),
  title: videoShoutoutTitleSchema,
  durationMs: positiveIntegerSchema.max(videoShoutoutMaximumDurationMs),
  avatarUrl: z.string().nullable()
}).strict().superRefine((clip, context) => {
  if (validateTwitchClipEmbedUrl(clip.embedUrl, clip.clipId) === null) {
    context.addIssue({ code: "custom", path: ["embedUrl"], message: "Embed URL must be an HTTPS Twitch clip embed for this clip" });
  }
  if (clip.avatarUrl !== null && validateVideoShoutoutAvatarUrl(clip.avatarUrl) !== clip.avatarUrl) {
    context.addIssue({ code: "custom", path: ["avatarUrl"], message: "Avatar URL must be HTTPS" });
  }
}) satisfies z.ZodType<VideoShoutoutClip>;

export const videoShoutoutProjectionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle") }).strict(),
  z.object({ status: z.literal("loading"), activationId: activationIdSchema, clip: videoShoutoutClipSchema }).strict(),
  z.object({
    status: z.literal("playing"),
    activationId: activationIdSchema,
    clip: videoShoutoutClipSchema,
    endsAtEpochMs: nonNegativeIntegerSchema.max(Number.MAX_SAFE_INTEGER)
  }).strict(),
  z.object({
    status: z.literal("error"),
    activationId: activationIdSchema,
    reason: z.enum(["no-clip", "playback-failed"]),
    displayName: videoShoutoutDisplayNameSchema.nullable()
  }).strict()
]) satisfies z.ZodType<VideoShoutoutProjection>;
