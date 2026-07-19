import { z } from "zod";
import { streamEventTypes } from "./types.js";
import {
  isoDateTimeSchema,
  metadataSchema,
  nonNegativeIntegerSchema,
  nonEmptyStringSchema,
  nullableNonEmptyStringSchema,
  positiveIntegerSchema,
  uuidLikeIdSchema
} from "../shared/schemas.js";

export const ingestProviderIdSchema = z.enum(["twitch", "streamerbot"]);
export const streamEventTypeSchema = z.enum(streamEventTypes);

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
export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;

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

export const giftSubscriptionEventSchema = baseEventSchema.extend({
  type: z.literal("gift_subscription"),
  amount: z.literal(1),
  tier: subscriptionTierSchema,
  recipient: streamEventActorSchema,
  gifter: streamEventActorSchema.nullable()
});

export const communityGiftEventSchema = baseEventSchema.extend({
  type: z.literal("community_gift"),
  amount: positiveIntegerSchema,
  tier: subscriptionTierSchema,
  cumulativeTotal: nonNegativeIntegerSchema.nullable(),
  anonymous: z.boolean()
});

const nullableNonNegativeIntegerSchema = nonNegativeIntegerSchema.nullable();
const nullableIsoDateTimeSchema = isoDateTimeSchema.nullable();
const hypeTrainFields = {
  amount: nullableNonNegativeIntegerSchema,
  trainId: nonEmptyStringSchema,
  level: nullableNonNegativeIntegerSchema,
  progress: nullableNonNegativeIntegerSchema,
  goal: nullableNonNegativeIntegerSchema,
  total: nullableNonNegativeIntegerSchema,
  startedAt: nullableIsoDateTimeSchema,
  expiresAt: nullableIsoDateTimeSchema,
  endedAt: nullableIsoDateTimeSchema,
  cooldownEndsAt: nullableIsoDateTimeSchema
};

export const hypeTrainStartEventSchema = baseEventSchema.extend({ type: z.literal("hype_train_start"), ...hypeTrainFields });
export const hypeTrainProgressEventSchema = baseEventSchema.extend({ type: z.literal("hype_train_progress"), ...hypeTrainFields });
export const hypeTrainEndEventSchema = baseEventSchema.extend({ type: z.literal("hype_train_end"), ...hypeTrainFields });

export const pollChoiceSchema = z.object({
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  totalVotes: nonNegativeIntegerSchema
});

const pollFields = {
  amount: nonNegativeIntegerSchema,
  pollId: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  choices: z.array(pollChoiceSchema).min(1),
  totalVotes: nonNegativeIntegerSchema,
  startedAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  status: nonEmptyStringSchema
};

export const pollStartEventSchema = baseEventSchema.extend({ type: z.literal("poll_start"), ...pollFields });
export const pollProgressEventSchema = baseEventSchema.extend({ type: z.literal("poll_progress"), ...pollFields });
export const pollEndEventSchema = baseEventSchema.extend({ type: z.literal("poll_end"), ...pollFields });

export const predictionOutcomeSchema = z.object({
  id: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  totalUsers: nonNegativeIntegerSchema,
  totalPoints: nonNegativeIntegerSchema
});

const predictionFields = {
  amount: nonNegativeIntegerSchema,
  predictionId: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  outcomes: z.array(predictionOutcomeSchema).min(1),
  totalUsers: nonNegativeIntegerSchema,
  totalPoints: nonNegativeIntegerSchema,
  startedAt: isoDateTimeSchema,
  locksAt: nullableIsoDateTimeSchema,
  endedAt: nullableIsoDateTimeSchema,
  status: nonEmptyStringSchema,
  winningOutcomeId: nullableNonEmptyStringSchema
};

export const predictionStartEventSchema = baseEventSchema.extend({ type: z.literal("prediction_start"), ...predictionFields });
export const predictionProgressEventSchema = baseEventSchema.extend({ type: z.literal("prediction_progress"), ...predictionFields });
export const predictionLockEventSchema = baseEventSchema.extend({ type: z.literal("prediction_lock"), ...predictionFields });
export const predictionEndEventSchema = baseEventSchema.extend({ type: z.literal("prediction_end"), ...predictionFields });

const streamFields = {
  amount: z.null(),
  streamId: nullableNonEmptyStringSchema,
  streamType: nullableNonEmptyStringSchema,
  startedAt: nullableIsoDateTimeSchema,
  endedAt: nullableIsoDateTimeSchema
};

export const streamOnlineEventSchema = baseEventSchema.extend({ type: z.literal("stream_online"), ...streamFields });
export const streamOfflineEventSchema = baseEventSchema.extend({ type: z.literal("stream_offline"), ...streamFields });

export const normalizedStreamEventSchema = z.discriminatedUnion("type", [
  followEventSchema,
  subscriptionEventSchema,
  resubscriptionEventSchema,
  cheerEventSchema,
  raidEventSchema,
  channelPointRedemptionEventSchema,
  giftSubscriptionEventSchema,
  communityGiftEventSchema,
  hypeTrainStartEventSchema,
  hypeTrainProgressEventSchema,
  hypeTrainEndEventSchema,
  pollStartEventSchema,
  pollProgressEventSchema,
  pollEndEventSchema,
  predictionStartEventSchema,
  predictionProgressEventSchema,
  predictionLockEventSchema,
  predictionEndEventSchema,
  streamOnlineEventSchema,
  streamOfflineEventSchema
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
