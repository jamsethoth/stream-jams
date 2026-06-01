import type {
  CheerEvent,
  FollowEvent,
  NormalizedStreamEvent,
  RaidEvent,
  ResubscriptionEvent,
  SubscriptionEvent,
  ChannelPointRedemptionEvent
} from "@stream-jams/core";

export type TwitchEventSubNotificationType =
  | "channel.follow"
  | "channel.subscribe"
  | "channel.subscription.message"
  | "channel.cheer"
  | "channel.raid"
  | "channel.channel_points_custom_reward_redemption.add";

export interface TwitchEventSubNotificationMessage {
  readonly metadata: {
    readonly message_id: string;
    readonly message_type: "notification";
    readonly message_timestamp: string;
    readonly subscription_type: TwitchEventSubNotificationType;
    readonly subscription_version: string;
  };
  readonly payload: {
    readonly subscription: {
      readonly id: string;
      readonly type: TwitchEventSubNotificationType;
      readonly version: string;
      readonly condition: Record<string, unknown>;
    };
    readonly event: Record<string, unknown>;
  };
}

export class TwitchEventNormalizationError extends Error {
  readonly code = "TWITCH_EVENT_NORMALIZATION_FAILED";

  constructor(message = "Twitch EventSub notification was invalid") {
    super(message);
    this.name = "TwitchEventNormalizationError";
  }
}

export function normalizeTwitchEventSubNotification(input: unknown): NormalizedStreamEvent {
  const message = parseNotificationMessage(input);
  switch (message.metadata.subscription_type) {
    case "channel.follow":
      return normalizeFollow(message);
    case "channel.subscribe":
      return normalizeSubscription(message);
    case "channel.subscription.message":
      return normalizeResubscription(message);
    case "channel.cheer":
      return normalizeCheer(message);
    case "channel.raid":
      return normalizeRaid(message);
    case "channel.channel_points_custom_reward_redemption.add":
      return normalizeChannelPointRedemption(message);
  }
}

export function getTwitchEventSubMessageId(input: unknown): string | null {
  if (!isRecord(input) || !isRecord(input.metadata)) {
    return null;
  }

  return typeof input.metadata.message_id === "string" && input.metadata.message_id.trim() !== ""
    ? input.metadata.message_id
    : null;
}

function normalizeFollow(message: TwitchEventSubNotificationMessage): FollowEvent {
  const event = message.payload.event;
  return {
    ...baseEvent(message, requiredString(event.user_id), requiredString(event.user_name), event.followed_at),
    type: "follow",
    amount: null
  };
}

function normalizeSubscription(message: TwitchEventSubNotificationMessage): SubscriptionEvent {
  const event = message.payload.event;
  return {
    ...baseEvent(message, requiredString(event.user_id), requiredString(event.user_name)),
    type: "subscription",
    amount: 1,
    tier: normalizeTier(event.tier)
  };
}

function normalizeResubscription(message: TwitchEventSubNotificationMessage): ResubscriptionEvent {
  const event = message.payload.event;
  return {
    ...baseEvent(message, requiredString(event.user_id), requiredString(event.user_name)),
    type: "resubscription",
    amount: positiveInteger(event.cumulative_months),
    tier: normalizeTier(event.tier),
    streakMonths: event.streak_months === null || event.streak_months === undefined ? null : positiveInteger(event.streak_months),
    message: messageText(event.message)
  };
}

function normalizeCheer(message: TwitchEventSubNotificationMessage): CheerEvent {
  const event = message.payload.event;
  const isAnonymous = event.is_anonymous === true;
  return {
    ...baseEvent(
      message,
      isAnonymous ? null : requiredString(event.user_id),
      isAnonymous ? "Anonymous" : requiredString(event.user_name)
    ),
    type: "cheer",
    amount: positiveInteger(event.bits),
    message: nullableString(event.message)
  };
}

function normalizeRaid(message: TwitchEventSubNotificationMessage): RaidEvent {
  const event = message.payload.event;
  return {
    ...baseEvent(message, requiredString(event.from_broadcaster_user_id), requiredString(event.from_broadcaster_user_name)),
    type: "raid",
    amount: positiveInteger(event.viewers)
  };
}

function normalizeChannelPointRedemption(message: TwitchEventSubNotificationMessage): ChannelPointRedemptionEvent {
  const event = message.payload.event;
  const reward = requiredRecord(event.reward);
  return {
    ...baseEvent(message, requiredString(event.user_id), requiredString(event.user_name), event.redeemed_at),
    type: "channel_point_redemption",
    amount: null,
    rewardId: requiredString(reward.id),
    rewardTitle: requiredString(reward.title),
    userInput: nullableString(event.user_input)
  };
}

function baseEvent(
  message: TwitchEventSubNotificationMessage,
  actorId: string | null,
  actorDisplayName: string,
  occurredAt: unknown = message.metadata.message_timestamp
) {
  return {
    id: message.metadata.message_id,
    providerId: "twitch" as const,
    sourcePlatform: "twitch" as const,
    ingestProvider: "twitch" as const,
    occurredAt: requiredString(occurredAt),
    actor: {
      id: actorId,
      displayName: actorDisplayName
    },
    message: null,
    metadata: {
      twitchEventSubType: message.metadata.subscription_type,
      twitchEventSubVersion: message.metadata.subscription_version,
      twitchSubscriptionId: message.payload.subscription.id,
      twitchBroadcasterUserId: readBroadcasterUserId(message.payload.event)
    }
  };
}

function parseNotificationMessage(input: unknown): TwitchEventSubNotificationMessage {
  if (!isRecord(input) || !isRecord(input.metadata) || !isRecord(input.payload)) {
    throw new TwitchEventNormalizationError();
  }

  const metadata = input.metadata;
  const payload = input.payload;
  if (
    metadata.message_type !== "notification" ||
    !isNotificationType(metadata.subscription_type) ||
    typeof metadata.message_id !== "string" ||
    metadata.message_id.trim() === "" ||
    typeof metadata.message_timestamp !== "string" ||
    typeof metadata.subscription_version !== "string" ||
    !isRecord(payload.subscription) ||
    !isRecord(payload.event) ||
    payload.subscription.type !== metadata.subscription_type ||
    typeof payload.subscription.id !== "string" ||
    typeof payload.subscription.version !== "string" ||
    !isRecord(payload.subscription.condition)
  ) {
    throw new TwitchEventNormalizationError();
  }

  return {
    metadata: {
      message_id: metadata.message_id,
      message_type: "notification",
      message_timestamp: metadata.message_timestamp,
      subscription_type: metadata.subscription_type,
      subscription_version: metadata.subscription_version
    },
    payload: {
      subscription: {
        id: payload.subscription.id,
        type: metadata.subscription_type,
        version: payload.subscription.version,
        condition: payload.subscription.condition
      },
      event: payload.event
    }
  };
}

function isNotificationType(value: unknown): value is TwitchEventSubNotificationType {
  return (
    value === "channel.follow" ||
    value === "channel.subscribe" ||
    value === "channel.subscription.message" ||
    value === "channel.cheer" ||
    value === "channel.raid" ||
    value === "channel.channel_points_custom_reward_redemption.add"
  );
}

function normalizeTier(value: unknown): "1000" | "2000" | "3000" | "prime" {
  if (value === "1000" || value === "2000" || value === "3000" || value === "prime") {
    return value;
  }

  throw new TwitchEventNormalizationError();
}

function messageText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const message = requiredRecord(value);
  return nullableString(message.text);
}

function readBroadcasterUserId(event: Record<string, unknown>): string | null {
  const value = event.broadcaster_user_id ?? event.to_broadcaster_user_id;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TwitchEventNormalizationError();
  }

  return value;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TwitchEventNormalizationError();
  }

  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new TwitchEventNormalizationError();
  }

  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new TwitchEventNormalizationError();
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
