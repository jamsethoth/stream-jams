import { z } from "zod";
import { nonNegativeIntegerSchema } from "../shared/schemas.js";
import type { VideosProjection } from "./types.js";
import { videoSourceSchema } from "./source-schema.js";
import { videosLayoutSchema } from "./layout-schema.js";

export * from "./providers.js";
export * from "./mirror.js";
export * from "./mirror-receiver.js";
export { videoSourceSchema } from "./source-schema.js";
export { videosLayoutSchema } from "./layout-schema.js";
export * from "./layout.js";
export * from "./placement-geometry.js";

/*
 * Strict Videos contract, published with the provider allowlist as the
 * `@stream-jams/core/videos` subpath so it ships only with overlays, the
 * desktop player and the server, not the management bundle.
 */

export const videoTitleSchema = z.string().trim().min(1).max(200);
export const videoRequesterSchema = z.string().trim().min(1).max(64);
/** A provider-reported uploader or broadcaster name. */
export const videoChannelNameSchema = /* @__PURE__ */ z.string().trim().min(1).max(100);
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
    layout: videosLayoutSchema,
    delivery: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("mirror"), paused: z.boolean(), obsAudio: z.boolean() }).strict(),
      z.object({ mode: z.literal("player"), source: videoSourceSchema, clock: videoPlaybackClockSchema, obsAudio: z.boolean() }).strict()
    ])
  }).strict(),
  z.object({ status: z.literal("notice"), noticeId: itemIdSchema, notice: z.literal("no-clip"), displayName: videoRequesterSchema.nullable(), layout: videosLayoutSchema }).strict()
]) satisfies z.ZodType<VideosProjection>;

/** Overlay players report video playback as `video:<itemId>` so it never reaches alert or effect coordinators. */
export const videoInstructionPrefix = "video:";

/** Longest media length a player may report: 24 hours. */
export const videoMediaDurationMaximumMs = 24 * 60 * 60 * 1000;

/**
 * A fallback browser player's report of the current item's media length, sent at most once
 * per item and output, before or after it starts. Only `video:` instructions carry it.
 */
export const overlayVideoDurationMessageType = "overlay.playback.duration";
export const overlayVideoDurationReportSchema = /* @__PURE__ */ z.object({
  type: z.literal(overlayVideoDurationMessageType),
  instructionId: z.string().min(videoInstructionPrefix.length + 1).max(videoInstructionPrefix.length + 128).startsWith(videoInstructionPrefix),
  mediaDurationMs: z.number().int().min(1).max(videoMediaDurationMaximumMs)
}).strict();

/** Target media position for a clock at `nowEpochMs`. */
export function videoClockPositionMs(clock: { readonly state: "playing" | "paused"; readonly positionMs: number; readonly atEpochMs: number }, nowEpochMs: number): number {
  return clock.state === "paused" ? clock.positionMs : clock.positionMs + Math.max(0, nowEpochMs - clock.atEpochMs);
}
