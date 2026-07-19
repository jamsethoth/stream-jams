import { createHash } from "node:crypto";
import type {
  ChannelPointRedemptionEvent,
  CheerEvent,
  CommunityGiftEvent,
  FollowEvent,
  GiftSubscriptionEvent,
  HypeTrainEndEvent,
  HypeTrainProgressEvent,
  HypeTrainStartEvent,
  NormalizedStreamEvent,
  PollEndEvent,
  PollProgressEvent,
  PollStartEvent,
  PredictionEndEvent,
  PredictionLockEvent,
  PredictionProgressEvent,
  PredictionStartEvent,
  RaidEvent,
  ResubscriptionEvent,
  StreamOfflineEvent,
  StreamOnlineEvent,
  SubscriptionEvent
} from "@stream-jams/core";
import type { StreamerBotEventEnvelope } from "./streamerbot-client.js";

export type StreamerBotNormalizationResult =
  | { readonly status: "normalized"; readonly event: NormalizedStreamEvent }
  | { readonly status: "unsupported"; readonly source: string; readonly type: string };

export class StreamerBotEventNormalizationError extends Error {
  readonly code = "STREAMERBOT_EVENT_NORMALIZATION_FAILED";

  constructor(source: string, type: string) {
    super(`Streamer.bot ${source}.${type} payload was invalid`);
    this.name = "StreamerBotEventNormalizationError";
  }
}

export function normalizeStreamerBotEvent(envelope: StreamerBotEventEnvelope): StreamerBotNormalizationResult {
  if (envelope.event.source.toLowerCase() !== "twitch") {
    return unsupported(envelope);
  }

  try {
    switch (envelope.event.type) {
      case "Follow":
        return normalized(normalizeFollow(envelope));
      case "Sub":
        return normalized(normalizeSubscription(envelope));
      case "ReSub":
        return normalized(normalizeResubscription(envelope));
      case "Cheer":
        return normalized(normalizeCheer(envelope));
      case "Raid":
        return normalized(normalizeRaid(envelope));
      case "RewardRedemption":
        return normalized(normalizeRewardRedemption(envelope));
      case "GiftSub":
        return normalized(normalizeGiftSubscription(envelope));
      case "GiftBomb":
        return normalized(normalizeCommunityGift(envelope));
      case "HypeTrainStart":
        return normalized(normalizeHypeTrain(envelope, "hype_train_start"));
      case "HypeTrainUpdate":
        return normalized(normalizeHypeTrain(envelope, "hype_train_progress"));
      case "HypeTrainEnd":
        return normalized(normalizeHypeTrain(envelope, "hype_train_end"));
      case "PollCreated":
        return normalized(normalizePoll(envelope, "poll_start", "active"));
      case "PollUpdated":
        return normalized(normalizePoll(envelope, "poll_progress", "active"));
      case "PollCompleted":
        return normalized(normalizePoll(envelope, "poll_end", "completed"));
      case "PollArchived":
        return normalized(normalizePoll(envelope, "poll_end", "archived"));
      case "PollTerminated":
        return normalized(normalizePoll(envelope, "poll_end", "terminated"));
      case "PredictionCreated":
        return normalized(normalizePrediction(envelope, "prediction_start", "active"));
      case "PredictionUpdated":
        return normalized(normalizePrediction(envelope, "prediction_progress", "active"));
      case "PredictionLocked":
        return normalized(normalizePrediction(envelope, "prediction_lock", "locked"));
      case "PredictionCompleted":
        return normalized(normalizePrediction(envelope, "prediction_end", "resolved"));
      case "PredictionCanceled":
        return normalized(normalizePrediction(envelope, "prediction_end", "canceled"));
      case "StreamOnline":
        return normalized(normalizeStreamOnline(envelope));
      case "StreamOffline":
        return normalized(normalizeStreamOffline(envelope));
      default:
        return unsupported(envelope);
    }
  } catch (error) {
    if (error instanceof StreamerBotEventNormalizationError) {
      throw error;
    }
    throw new StreamerBotEventNormalizationError(envelope.event.source, envelope.event.type);
  }
}

function normalizeFollow(envelope: StreamerBotEventEnvelope): FollowEvent {
  const actor = requiredActor(envelope, envelope.data.targetUser);
  return {
    ...baseEvent(envelope, actor, null, [actor.id, actor.displayName]),
    type: "follow",
    amount: null,
    occurredAt: optionalString(envelope.data.followedAt) ?? optionalString(envelope.data.createdAt) ?? envelope.timeStamp
  };
}

function normalizeSubscription(envelope: StreamerBotEventEnvelope): SubscriptionEvent {
  const actor = requiredActor(envelope, envelope.data.user);
  const upstreamId = optionalString(envelope.data.messageId);
  return {
    ...baseEvent(envelope, actor, upstreamId, [actor.id, actor.displayName, normalizeSubscriptionTier(envelope, true)]),
    type: "subscription",
    amount: 1,
    tier: normalizeSubscriptionTier(envelope, true),
    occurredAt: optionalString(envelope.data.createdAt) ?? envelope.timeStamp
  };
}

function normalizeResubscription(envelope: StreamerBotEventEnvelope): ResubscriptionEvent {
  const actor = requiredActor(envelope, envelope.data.user);
  const amount = positiveInteger(envelope, envelope.data.cumulativeMonths);
  const upstreamId = optionalString(envelope.data.messageId);
  return {
    ...baseEvent(envelope, actor, upstreamId, [actor.id, actor.displayName, amount]),
    type: "resubscription",
    amount,
    tier: normalizeSubscriptionTier(envelope, false),
    streakMonths: nullablePositiveInteger(envelope, envelope.data.streakMonths),
    message: nullableString(envelope, envelope.data.text),
    occurredAt: optionalString(envelope.data.createdAt) ?? envelope.timeStamp
  };
}

function normalizeCheer(envelope: StreamerBotEventEnvelope): CheerEvent {
  const actor = envelope.data.anonymous === true
    ? { id: null, displayName: "Anonymous" }
    : requiredActor(envelope, envelope.data.user);
  const amount = positiveInteger(envelope, envelope.data.bits);
  return {
    ...baseEvent(envelope, actor, optionalString(envelope.data.messageId), [actor.id, actor.displayName, amount]),
    type: "cheer",
    amount,
    message: nullableString(envelope, envelope.data.text),
    occurredAt: optionalString(envelope.data.createdAt) ?? envelope.timeStamp
  };
}

function normalizeRaid(envelope: StreamerBotEventEnvelope): RaidEvent {
  const actor = requiredActor(envelope, envelope.data.user);
  const amount = positiveInteger(envelope, envelope.data.viewers);
  return {
    ...baseEvent(envelope, actor, optionalString(envelope.data.messageId), [actor.id, actor.displayName, amount]),
    type: "raid",
    amount,
    occurredAt: optionalString(envelope.data.createdAt) ?? envelope.timeStamp
  };
}

function normalizeRewardRedemption(envelope: StreamerBotEventEnvelope): ChannelPointRedemptionEvent {
  const actor = requiredActor(envelope, envelope.data.user);
  const reward = isRecord(envelope.data.reward) ? envelope.data.reward : null;
  const rewardId = requiredString(envelope, envelope.data.rewardId ?? reward?.id);
  const rewardTitle = requiredString(envelope, envelope.data.rewardName ?? reward?.title ?? reward?.name);
  const upstreamId = optionalString(envelope.data.redemptionId ?? envelope.data.messageId);
  return {
    ...baseEvent(envelope, actor, upstreamId, [actor.id, actor.displayName, rewardId]),
    type: "channel_point_redemption",
    amount: null,
    rewardId,
    rewardTitle,
    userInput: nullableString(envelope, envelope.data.rawInput ?? envelope.data.userInput),
    occurredAt:
      optionalString(envelope.data.redeemedAt) ?? optionalString(envelope.data.createdAt) ?? envelope.timeStamp
  };
}

function normalizeGiftSubscription(envelope: StreamerBotEventEnvelope): GiftSubscriptionEvent {
  const recipient = requiredActor(envelope, envelope.data.recipient);
  return {
    ...baseEvent(envelope, recipient, optionalString(envelope.data.messageId), [recipient.id, recipient.displayName]),
    type: "gift_subscription",
    amount: 1,
    tier: normalizeTier(envelope, envelope.data.subTier),
    recipient,
    gifter: optionalActor(envelope, envelope.data.user),
    occurredAt: optionalString(envelope.data.createdAt) ?? envelope.timeStamp
  };
}

function normalizeCommunityGift(envelope: StreamerBotEventEnvelope): CommunityGiftEvent {
  const anonymous = envelope.data.user === null;
  const actor = anonymous ? { id: null, displayName: "Anonymous" } : requiredActor(envelope, envelope.data.user);
  const upstreamId = optionalString(envelope.data.messageId) ?? optionalString(envelope.data.id);
  return {
    ...baseEvent(envelope, actor, upstreamId, [actor.id, actor.displayName, envelope.data.total]),
    type: "community_gift",
    amount: positiveInteger(envelope, envelope.data.total),
    tier: normalizeTier(envelope, envelope.data.sub_tier),
    cumulativeTotal: nullableNonNegativeInteger(envelope, envelope.data.cumulative_total),
    anonymous,
    occurredAt: optionalString(envelope.data.createdAt) ?? envelope.timeStamp
  };
}

function normalizeHypeTrain(
  envelope: StreamerBotEventEnvelope,
  type: "hype_train_start" | "hype_train_progress" | "hype_train_end"
): HypeTrainStartEvent | HypeTrainProgressEvent | HypeTrainEndEvent {
  const actor = requiredActor(envelope, envelope.data.broadcaster);
  const trainId = requiredString(envelope, envelope.data.id);
  return {
    ...baseEvent(envelope, actor, trainId, [actor.id, trainId]),
    type,
    amount: nullableNonNegativeInteger(envelope, envelope.data.total),
    trainId,
    level: nullableNonNegativeInteger(envelope, envelope.data.level),
    progress: nullableNonNegativeInteger(envelope, envelope.data.progress),
    goal: nullableNonNegativeInteger(envelope, envelope.data.goal),
    total: nullableNonNegativeInteger(envelope, envelope.data.total),
    startedAt: nullableString(envelope, envelope.data.startedAt),
    expiresAt: nullableString(envelope, envelope.data.expiresAt),
    endedAt: nullableString(envelope, envelope.data.endedAt),
    cooldownEndsAt: nullableString(envelope, envelope.data.cooldownEndsAt)
  } as HypeTrainStartEvent | HypeTrainProgressEvent | HypeTrainEndEvent;
}

function normalizePoll(
  envelope: StreamerBotEventEnvelope,
  type: "poll_start" | "poll_progress" | "poll_end",
  status: "active" | "completed" | "archived" | "terminated"
): PollStartEvent | PollProgressEvent | PollEndEvent {
  const actor = requiredActor(envelope, envelope.data.broadcaster);
  const pollId = requiredString(envelope, envelope.data.id);
  const choices = requiredArray(envelope, envelope.data.choices).map((choice) => {
    if (!isRecord(choice)) throw invalid(envelope);
    return {
      id: requiredString(envelope, choice.id),
      title: requiredString(envelope, choice.title),
      totalVotes: type === "poll_start"
        ? optionalNonNegativeInteger(envelope, choice.totalVotes) ?? 0
        : nonNegativeInteger(envelope, choice.totalVotes)
    };
  });
  const totalVotes = choices.reduce((total, choice) => total + choice.totalVotes, 0);
  return {
    ...baseEvent(envelope, actor, pollId, [actor.id, pollId]),
    type,
    amount: totalVotes,
    pollId,
    title: requiredString(envelope, envelope.data.title),
    choices,
    totalVotes,
    startedAt: requiredString(envelope, envelope.data.startedAt),
    endsAt: type === "poll_end"
      ? requiredString(envelope, envelope.data.endedAt)
      : requiredString(envelope, envelope.data.endsAt),
    status
  } as PollStartEvent | PollProgressEvent | PollEndEvent;
}

function normalizePrediction(
  envelope: StreamerBotEventEnvelope,
  type: "prediction_start" | "prediction_progress" | "prediction_lock" | "prediction_end",
  status: "active" | "locked" | "resolved" | "canceled"
): PredictionStartEvent | PredictionProgressEvent | PredictionLockEvent | PredictionEndEvent {
  const actor = requiredActor(envelope, envelope.data.broadcaster);
  const predictionId = requiredString(envelope, envelope.data.id);
  const outcomes = requiredArray(envelope, envelope.data.outcomes).map((outcome) => {
    if (!isRecord(outcome)) throw invalid(envelope);
    return {
      id: requiredString(envelope, outcome.id),
      title: requiredString(envelope, outcome.title),
      totalUsers: type === "prediction_end"
        ? nonNegativeInteger(envelope, outcome.totalUsers)
        : optionalNonNegativeInteger(envelope, outcome.totalUsers) ?? 0,
      totalPoints: type === "prediction_end"
        ? nonNegativeInteger(envelope, outcome.totalPoints)
        : optionalNonNegativeInteger(envelope, outcome.totalPoints) ?? 0
    };
  });
  const totalUsers = outcomes.reduce((total, outcome) => total + outcome.totalUsers, 0);
  const totalPoints = outcomes.reduce((total, outcome) => total + outcome.totalPoints, 0);
  return {
    ...baseEvent(envelope, actor, predictionId, [actor.id, predictionId]),
    type,
    amount: totalPoints,
    predictionId,
    title: requiredString(envelope, envelope.data.title),
    outcomes,
    totalUsers,
    totalPoints,
    startedAt: requiredString(envelope, envelope.data.startedAt),
    locksAt: type === "prediction_lock"
      ? requiredString(envelope, envelope.data.lockedAt)
      : type === "prediction_end" ? null : requiredString(envelope, envelope.data.locksAt),
    endedAt: type === "prediction_end" ? requiredString(envelope, envelope.data.endedAt) : null,
    status,
    winningOutcomeId: type === "prediction_end" && status === "resolved"
      ? requiredNullableString(envelope, envelope.data.winningOutcomeId)
      : null
  } as PredictionStartEvent | PredictionProgressEvent | PredictionLockEvent | PredictionEndEvent;
}

function normalizeStreamOnline(envelope: StreamerBotEventEnvelope): StreamOnlineEvent {
  const actor = requiredActor(envelope, envelope.data.broadcaster);
  const streamId = nullableString(envelope, envelope.data.id);
  return {
    ...baseEvent(envelope, actor, streamId, [actor.id, streamId]),
    type: "stream_online",
    amount: null,
    streamId,
    streamType: nullableString(envelope, envelope.data.type),
    startedAt: nullableString(envelope, envelope.data.startedAt),
    endedAt: null
  };
}

function normalizeStreamOffline(envelope: StreamerBotEventEnvelope): StreamOfflineEvent {
  const actor = requiredActor(envelope, envelope.data.broadcaster);
  return {
    ...baseEvent(envelope, actor, optionalString(envelope.data.id), [actor.id, envelope.timeStamp]),
    type: "stream_offline",
    amount: null,
    streamId: null,
    streamType: null,
    startedAt: null,
    endedAt: requiredString(envelope, envelope.data.endedAt)
  };
}

function baseEvent(
  envelope: StreamerBotEventEnvelope,
  actor: { readonly id: string | null; readonly displayName: string },
  upstreamId: string | null,
  fallbackIdParts: readonly unknown[]
) {
  return {
    id: normalizedEventId(envelope, upstreamId, fallbackIdParts),
    providerId: "twitch" as const,
    sourcePlatform: "twitch" as const,
    ingestProvider: "streamerbot" as const,
    occurredAt: envelope.timeStamp,
    actor,
    message: null,
    metadata: {
      ingestProvider: "streamerbot",
      upstreamSource: envelope.event.source,
      upstreamType: envelope.event.type,
      streamerBotTimeStamp: envelope.timeStamp,
      ...(upstreamId === null ? {} : { streamerBotUpstreamEventId: upstreamId })
    }
  };
}

function normalizedEventId(
  envelope: StreamerBotEventEnvelope,
  upstreamId: string | null,
  fallbackIdParts: readonly unknown[]
): string {
  if (upstreamId !== null) {
    return `streamerbot:twitch:${envelope.event.type}:${upstreamId}`;
  }

  const digest = createHash("sha256")
    .update(JSON.stringify([
      envelope.timeStamp,
      envelope.event.source,
      envelope.event.type,
      ...fallbackIdParts
    ]), "utf8")
    .digest("hex");
  return `streamerbot:sha256:${digest}`;
}

function normalizeSubscriptionTier(
  envelope: StreamerBotEventEnvelope,
  subscription: boolean
): "1000" | "2000" | "3000" | "prime" {
  const prime = subscription ? envelope.data.is_prime : envelope.data.isPrime;
  if (prime === true) return "prime";

  const value = subscription ? envelope.data.sub_tier : envelope.data.subTier;
  return normalizeTier(envelope, value);
}

function normalizeTier(envelope: StreamerBotEventEnvelope, value: unknown): "1000" | "2000" | "3000" | "prime" {
  if (typeof value !== "string") throw invalid(envelope);
  switch (value.trim().toLowerCase()) {
    case "1000":
    case "1":
    case "tier 1":
      return "1000";
    case "2000":
    case "2":
    case "tier 2":
      return "2000";
    case "3000":
    case "3":
    case "tier 3":
      return "3000";
    case "prime":
      return "prime";
    default:
      throw invalid(envelope);
  }
}

function requiredActor(envelope: StreamerBotEventEnvelope, value: unknown) {
  if (!isRecord(value)) throw invalid(envelope);
  return {
    id: nullableIdentifier(envelope, value.id),
    displayName: requiredString(envelope, value.name ?? value.login)
  };
}

function optionalActor(envelope: StreamerBotEventEnvelope, value: unknown) {
  return value === null || value === undefined ? null : requiredActor(envelope, value);
}

function nullableIdentifier(envelope: StreamerBotEventEnvelope, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(envelope, value);
}

function requiredString(envelope: StreamerBotEventEnvelope, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw invalid(envelope);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function nullableString(envelope: StreamerBotEventEnvelope, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw invalid(envelope);
  return value;
}

function requiredNullableString(envelope: StreamerBotEventEnvelope, value: unknown): string | null {
  return value === null ? null : requiredString(envelope, value);
}

function positiveInteger(envelope: StreamerBotEventEnvelope, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw invalid(envelope);
  return value;
}

function nonNegativeInteger(envelope: StreamerBotEventEnvelope, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw invalid(envelope);
  return value;
}

function nullableNonNegativeInteger(envelope: StreamerBotEventEnvelope, value: unknown): number | null {
  return value === null || value === undefined ? null : nonNegativeInteger(envelope, value);
}

function optionalNonNegativeInteger(envelope: StreamerBotEventEnvelope, value: unknown): number | null {
  return value === undefined ? null : nonNegativeInteger(envelope, value);
}

function nullablePositiveInteger(envelope: StreamerBotEventEnvelope, value: unknown): number | null {
  return value === null || value === undefined ? null : positiveInteger(envelope, value);
}

function requiredArray(envelope: StreamerBotEventEnvelope, value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0) throw invalid(envelope);
  return value;
}

function invalid(envelope: StreamerBotEventEnvelope): StreamerBotEventNormalizationError {
  return new StreamerBotEventNormalizationError(envelope.event.source, envelope.event.type);
}

function normalized(event: NormalizedStreamEvent): StreamerBotNormalizationResult {
  return { status: "normalized", event };
}

function unsupported(envelope: StreamerBotEventEnvelope): StreamerBotNormalizationResult {
  return { status: "unsupported", source: envelope.event.source, type: envelope.event.type };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
