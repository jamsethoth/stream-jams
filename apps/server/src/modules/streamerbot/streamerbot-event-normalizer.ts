import { createHash } from "node:crypto";
import type {
  ChannelPointRedemptionEvent,
  CheerEvent,
  FollowEvent,
  NormalizedStreamEvent,
  RaidEvent,
  ResubscriptionEvent,
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

function positiveInteger(envelope: StreamerBotEventEnvelope, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw invalid(envelope);
  return value;
}

function nullablePositiveInteger(envelope: StreamerBotEventEnvelope, value: unknown): number | null {
  return value === null || value === undefined ? null : positiveInteger(envelope, value);
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
