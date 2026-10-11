import { z } from "zod";
import type { VideoRequestAdmissionResult, VideoRequestItem } from "./types.js";
import { videoSourceSchema } from "./source-schema.js";
import { videoRequesterSchema, videoTitleSchema } from "./request-schema.js";

export const videoBusIdentitySchema = z.object({ busId: z.string().min(1).max(512), eventId: z.string().min(1).max(512) }).strict();

export const videoRequestItemSchema = z.object({
  id: z.string().min(1).max(128), purpose: z.enum(["live", "test"]), source: videoSourceSchema,
  title: videoTitleSchema.nullable(), providerTitle: videoTitleSchema.nullable(), channelName: z.string().min(1).max(100).nullable(), requester: videoRequesterSchema.nullable(),
  submittedVia: z.enum(["management", "operator", "automation", "streamerbot", "channel-points"]),
  durationMs: z.number().int().positive().max(86_400_000).nullable(), status: z.enum(["queued", "held", "playing", "paused", "played", "failed", "removed"]),
  holdReason: z.enum(["over-limit", "unknown-length"]).nullable(), limitOverridden: z.boolean(), autoplay: z.boolean(),
  position: z.number().int().safe(), createdAt: z.iso.datetime()
}).strict() satisfies z.ZodType<VideoRequestItem>;

export const videoRequestAdmissionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("accepted"), item: videoRequestItemSchema }).strict(),
  z.object({ status: z.literal("rejected"), reason: z.enum(["module-disabled", "invalid-request", "invalid-link", "unsafe-link", "unsupported-source", "queue-full"]), fields: z.array(z.string().min(1).max(128)).max(32) }).strict()
]) satisfies z.ZodType<VideoRequestAdmissionResult>;
