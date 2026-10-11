import { z } from "zod";
import type { VideoRequestAdmissionResult, VideoRequestItem } from "./types.js";
import { videoSourceSchema } from "./source-schema.js";
import { videoRequesterSchema, videoTitleSchema } from "./request-schema.js";

export const videoBusIdentitySchema = z.object({ busId: z.string().min(1).max(512), eventId: z.string().min(1).max(512) }).strict();

export const videoRequestItemSchema = z.object({
  id: z.string().min(1).max(128), source: videoSourceSchema,
  reviewRequired: z.boolean(),
  migrationProvenance: z.strictObject({ kind: z.literal("test-queue-consolidation"), originalPurpose: z.literal("test"),
    originalStatus: z.enum(["queued", "held", "playing", "paused", "played", "failed", "removed"]) }).nullable(),
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

/** Original receipts are admission snapshots, never replaced with current migrated queue state. */
export function upgradeVideoAdmissionResult(raw: unknown): VideoRequestAdmissionResult {
  const current = videoRequestAdmissionResultSchema.safeParse(raw);
  if (current.success) return current.data;
  const legacyItem = videoRequestItemSchema.omit({ reviewRequired: true, migrationProvenance: true }).extend({ purpose: z.enum(["live", "test"]) });
  const legacy = z.strictObject({ status: z.literal("accepted"), item: legacyItem }).parse(raw);
  const item = Object.fromEntries(Object.entries(legacy.item).filter(([key]) => key !== "purpose"));
  return videoRequestAdmissionResultSchema.parse({ status: "accepted", item: { ...item, reviewRequired: false, migrationProvenance: null } });
}
