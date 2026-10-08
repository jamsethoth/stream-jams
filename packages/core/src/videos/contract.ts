import { z } from "zod";
import { nonNegativeIntegerSchema } from "../shared/schemas.js";
import type { VideoSource, VideosProjection } from "./types.js";

export * from "./providers.js";

/*
 * Strict Videos contract, published with the provider allowlist as the
 * `@stream-jams/core/videos` subpath so it ships only with overlays, the
 * desktop player and the server, not the management bundle.
 */

const maximumOffsetMs = 24 * 60 * 60 * 1000;
const offsetSchema = nonNegativeIntegerSchema.max(maximumOffsetMs);

export const videoSourceSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("youtube"), videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/u), startAtMs: offsetSchema }).strict(),
  z.object({ provider: z.literal("twitch-clip"), clipSlug: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/u) }).strict(),
  z.object({ provider: z.literal("twitch-vod"), videoId: z.string().regex(/^\d{1,20}$/u), startAtMs: offsetSchema }).strict(),
  z.object({ provider: z.literal("direct"), url: z.string().max(2048) }).strict()
]) satisfies z.ZodType<VideoSource>;

export const videoTitleSchema = z.string().trim().min(1).max(200);
export const videoRequesterSchema = z.string().trim().min(1).max(64);
const itemIdSchema = z.string().min(1).max(128);

export const videoPlaybackClockSchema = z.object({
  state: z.enum(["playing", "paused"]),
  positionMs: nonNegativeIntegerSchema.max(Number.MAX_SAFE_INTEGER),
  atEpochMs: nonNegativeIntegerSchema.max(Number.MAX_SAFE_INTEGER)
}).strict();

export const videosProjectionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle") }).strict(),
  z.object({
    status: z.literal("active"),
    itemId: itemIdSchema,
    title: videoTitleSchema.nullable(),
    requester: videoRequesterSchema.nullable(),
    delivery: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("mirror"), obsAudio: z.boolean() }).strict(),
      z.object({ mode: z.literal("player"), source: videoSourceSchema, clock: videoPlaybackClockSchema, obsAudio: z.boolean() }).strict()
    ])
  }).strict(),
  z.object({ status: z.literal("notice"), noticeId: itemIdSchema, notice: z.literal("no-clip"), displayName: videoRequesterSchema.nullable() }).strict()
]) satisfies z.ZodType<VideosProjection>;

/** Target media position for a clock at `nowEpochMs`. */
export function videoClockPositionMs(clock: { readonly state: "playing" | "paused"; readonly positionMs: number; readonly atEpochMs: number }, nowEpochMs: number): number {
  return clock.state === "paused" ? clock.positionMs : clock.positionMs + Math.max(0, nowEpochMs - clock.atEpochMs);
}
