import { z } from "zod";
import {
  isoDateTimeSchema,
  metadataSchema,
  nonEmptyStringSchema,
  nullableNonEmptyStringSchema,
  positiveIntegerSchema,
  uuidLikeIdSchema
} from "../shared/schemas.js";

export const ingestProviderIdSchema = z.enum(["twitch", "streamerbot"]);

export const sourcePlatformIdSchema = z.enum(["twitch"]);

const streamEventActorSchema = z.object({
  id: nullableNonEmptyStringSchema,
  displayName: nonEmptyStringSchema
});

const baseEventSchema = z.object({
  id: uuidLikeIdSchema,
  providerId: z.literal("twitch"),
  sourcePlatform: sourcePlatformIdSchema,
  ingestProvider: ingestProviderIdSchema,
  occurredAt: isoDateTimeSchema,
  actor: streamEventActorSchema,
  message: z.string().nullable(),
  metadata: metadataSchema
});

export const followEventSchema = baseEventSchema.extend({
  type: z.literal("follow"),
  amount: z.null()
});

export const subscriptionTierSchema = z.enum(["1000", "2000", "3000", "prime"]);

export const subscriptionEventSchema = baseEventSchema.extend({
  type: z.literal("subscription"),
  amount: positiveIntegerSchema,
  tier: subscriptionTierSchema
});

export const resubscriptionEventSchema = baseEventSchema.extend({
  type: z.literal("resubscription"),
  amount: positiveIntegerSchema,
  tier: subscriptionTierSchema,
  streakMonths: positiveIntegerSchema.nullable()
});

export const cheerEventSchema = baseEventSchema.extend({
  type: z.literal("cheer"),
  amount: positiveIntegerSchema
});

export const raidEventSchema = baseEventSchema.extend({
  type: z.literal("raid"),
  amount: positiveIntegerSchema
});

export const channelPointRedemptionEventSchema = baseEventSchema.extend({
  type: z.literal("channel_point_redemption"),
  amount: z.null(),
  rewardId: nonEmptyStringSchema,
  rewardTitle: nonEmptyStringSchema,
  userInput: z.string().nullable()
});

export const normalizedStreamEventSchema = z.discriminatedUnion("type", [
  followEventSchema,
  subscriptionEventSchema,
  resubscriptionEventSchema,
  cheerEventSchema,
  raidEventSchema,
  channelPointRedemptionEventSchema
]);

export const externalStreamEventSchema = z.object({
  id: uuidLikeIdSchema,
  ingestProvider: z.literal("streamerbot"),
  subscriptionSourceKey: nonEmptyStringSchema.nullable(),
  upstreamSource: nonEmptyStringSchema,
  upstreamType: nonEmptyStringSchema,
  occurredAt: isoDateTimeSchema,
  receivedAt: isoDateTimeSchema,
  payload: metadataSchema,
  metadata: metadataSchema
});

export const streamerBotSubscriptionSelectionSchema = z.object({
  sourceKey: nonEmptyStringSchema,
  eventTypes: z.array(nonEmptyStringSchema).min(1)
});

export type IngestProviderIdInput = z.infer<typeof ingestProviderIdSchema>;
export type SourcePlatformIdInput = z.infer<typeof sourcePlatformIdSchema>;
export type NormalizedStreamEventInput = z.infer<typeof normalizedStreamEventSchema>;
export type ExternalStreamEventInput = z.infer<typeof externalStreamEventSchema>;
export type StreamerBotSubscriptionSelectionInput = z.infer<typeof streamerBotSubscriptionSelectionSchema>;
