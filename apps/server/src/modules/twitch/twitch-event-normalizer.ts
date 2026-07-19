import type {
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
  SubscriptionEvent,
  ChannelPointRedemptionEvent
} from "@stream-jams/core";

export type TwitchEventSubNotificationType =
  | "channel.follow"
  | "channel.subscribe"
  | "channel.subscription.message"
  | "channel.cheer"
  | "channel.raid"
  | "channel.channel_points_custom_reward_redemption.add"
  | "channel.subscription.gift"
  | "channel.hype_train.begin"
  | "channel.hype_train.progress"
  | "channel.hype_train.end"
  | "channel.poll.begin"
  | "channel.poll.progress"
  | "channel.poll.end"
  | "channel.prediction.begin"
  | "channel.prediction.progress"
  | "channel.prediction.lock"
  | "channel.prediction.end"
  | "stream.online"
  | "stream.offline";

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
      return message.payload.event.is_gift === true ? normalizeGiftSubscription(message) : normalizeSubscription(message);
    case "channel.subscription.message":
      return normalizeResubscription(message);
    case "channel.cheer":
      return normalizeCheer(message);
    case "channel.raid":
      return normalizeRaid(message);
    case "channel.channel_points_custom_reward_redemption.add":
      return normalizeChannelPointRedemption(message);
    case "channel.subscription.gift":
      return normalizeCommunityGift(message);
    case "channel.hype_train.begin":
      return normalizeHypeTrain(message, "start");
    case "channel.hype_train.progress":
      return normalizeHypeTrain(message, "progress");
    case "channel.hype_train.end":
      return normalizeHypeTrain(message, "end");
    case "channel.poll.begin":
      return normalizePoll(message, "start");
    case "channel.poll.progress":
      return normalizePoll(message, "progress");
    case "channel.poll.end":
      return normalizePoll(message, "end");
    case "channel.prediction.begin":
      return normalizePrediction(message, "start");
    case "channel.prediction.progress":
      return normalizePrediction(message, "progress");
    case "channel.prediction.lock":
      return normalizePrediction(message, "lock");
    case "channel.prediction.end":
      return normalizePrediction(message, "end");
    case "stream.online":
      return normalizeStreamOnline(message);
    case "stream.offline":
      return normalizeStreamOffline(message);
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

function normalizeGiftSubscription(message: TwitchEventSubNotificationMessage): GiftSubscriptionEvent {
  const event = message.payload.event;
  const recipient = actor(event.user_id, event.user_name);
  return {
    ...baseEvent(message, recipient.id, recipient.displayName),
    type: "gift_subscription",
    amount: 1,
    tier: normalizeTier(event.tier),
    recipient,
    gifter: optionalActor(event.gifter_user_id, event.gifter_user_name)
  };
}

function normalizeCommunityGift(message: TwitchEventSubNotificationMessage): CommunityGiftEvent {
  const event = message.payload.event;
  const anonymous = event.is_anonymous === true;
  const gifter = anonymous ? { id: null, displayName: "Anonymous" } : actor(event.user_id, event.user_name);
  return {
    ...baseEvent(message, gifter.id, gifter.displayName),
    type: "community_gift",
    amount: positiveInteger(event.total),
    tier: normalizeTier(event.tier),
    cumulativeTotal: nullableNonNegativeInteger(event.cumulative_total),
    anonymous
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

function normalizeHypeTrain(
  message: TwitchEventSubNotificationMessage,
  phase: "start" | "progress" | "end"
): HypeTrainStartEvent | HypeTrainProgressEvent | HypeTrainEndEvent {
  const event = message.payload.event;
  return {
    ...baseEvent(message, ...broadcasterActor(event)),
    type: `hype_train_${phase}`,
    amount: nullableNonNegativeInteger(event.total),
    trainId: requiredString(event.id),
    level: nullableNonNegativeInteger(event.level),
    progress: nullableNonNegativeInteger(event.progress),
    goal: nullableNonNegativeInteger(event.goal),
    total: nullableNonNegativeInteger(event.total),
    startedAt: nullableString(event.started_at),
    expiresAt: nullableString(event.expires_at),
    endedAt: nullableString(event.ended_at),
    cooldownEndsAt: nullableString(event.cooldown_ends_at)
  } as HypeTrainStartEvent | HypeTrainProgressEvent | HypeTrainEndEvent;
}

function normalizePoll(
  message: TwitchEventSubNotificationMessage,
  phase: "start" | "progress" | "end"
): PollStartEvent | PollProgressEvent | PollEndEvent {
  const event = message.payload.event;
  const choices = requiredArray(event.choices).map((choice) => {
    const value = requiredRecord(choice);
    return {
      id: requiredString(value.id),
      title: requiredString(value.title),
      totalVotes: phase === "start" ? optionalNonNegativeInteger(value.votes) ?? 0 : nonNegativeInteger(value.votes)
    };
  });
  const totalVotes = choices.reduce((total, choice) => total + choice.totalVotes, 0);
  return {
    ...baseEvent(message, ...broadcasterActor(event)),
    type: `poll_${phase}`,
    amount: totalVotes,
    pollId: requiredString(event.id),
    title: requiredString(event.title),
    choices,
    totalVotes,
    startedAt: requiredString(event.started_at),
    endsAt: phase === "end" ? requiredString(event.ended_at) : requiredString(event.ends_at),
    status: phase === "end" ? requiredString(event.status) : defaultString(event.status, "active")
  } as PollStartEvent | PollProgressEvent | PollEndEvent;
}

function normalizePrediction(
  message: TwitchEventSubNotificationMessage,
  phase: "start" | "progress" | "lock" | "end"
): PredictionStartEvent | PredictionProgressEvent | PredictionLockEvent | PredictionEndEvent {
  const event = message.payload.event;
  const outcomes = requiredArray(event.outcomes).map((outcome) => {
    const value = requiredRecord(outcome);
    return {
      id: requiredString(value.id),
      title: requiredString(value.title),
      totalUsers: phase === "end" ? nonNegativeInteger(value.users) : optionalNonNegativeInteger(value.users) ?? 0,
      totalPoints: phase === "end" ? nonNegativeInteger(value.channel_points) : optionalNonNegativeInteger(value.channel_points) ?? 0
    };
  });
  const totalUsers = outcomes.reduce((total, outcome) => total + outcome.totalUsers, 0);
  const totalPoints = outcomes.reduce((total, outcome) => total + outcome.totalPoints, 0);
  return {
    ...baseEvent(message, ...broadcasterActor(event)),
    type: `prediction_${phase}`,
    amount: totalPoints,
    predictionId: requiredString(event.id),
    title: requiredString(event.title),
    outcomes,
    totalUsers,
    totalPoints,
    startedAt: requiredString(event.started_at),
    locksAt: phase === "lock" ? requiredString(event.locked_at) : phase === "end" ? null : requiredString(event.locks_at),
    endedAt: phase === "end" ? requiredString(event.ended_at) : nullableString(event.ended_at),
    status: phase === "end" ? requiredString(event.status) : defaultString(event.status, phase === "lock" ? "locked" : "active"),
    winningOutcomeId: phase === "end" ? requiredNullableString(event.winning_outcome_id) : null
  } as PredictionStartEvent | PredictionProgressEvent | PredictionLockEvent | PredictionEndEvent;
}

function normalizeStreamOnline(message: TwitchEventSubNotificationMessage): StreamOnlineEvent {
  const event = message.payload.event;
  return {
    ...baseEvent(message, ...broadcasterActor(event)),
    type: "stream_online",
    amount: null,
    streamId: nullableString(event.id),
    streamType: nullableString(event.type),
    startedAt: nullableString(event.started_at),
    endedAt: null
  };
}

function normalizeStreamOffline(message: TwitchEventSubNotificationMessage): StreamOfflineEvent {
  const event = message.payload.event;
  return {
    ...baseEvent(message, ...broadcasterActor(event)),
    type: "stream_offline",
    amount: null,
    streamId: null,
    streamType: null,
    startedAt: null,
    endedAt: message.metadata.message_timestamp
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
    value === "channel.channel_points_custom_reward_redemption.add" ||
    value === "channel.subscription.gift" ||
    value === "channel.hype_train.begin" ||
    value === "channel.hype_train.progress" ||
    value === "channel.hype_train.end" ||
    value === "channel.poll.begin" ||
    value === "channel.poll.progress" ||
    value === "channel.poll.end" ||
    value === "channel.prediction.begin" ||
    value === "channel.prediction.progress" ||
    value === "channel.prediction.lock" ||
    value === "channel.prediction.end" ||
    value === "stream.online" ||
    value === "stream.offline"
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

function defaultString(value: unknown, defaultValue: string): string {
  return value === undefined ? defaultValue : requiredString(value);
}

function requiredNullableString(value: unknown): string | null {
  return value === null ? null : requiredString(value);
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new TwitchEventNormalizationError();
  }

  return value;
}

function nonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new TwitchEventNormalizationError();
  }

  return value;
}

function nullableNonNegativeInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : nonNegativeInteger(value);
}

function optionalNonNegativeInteger(value: unknown): number | null {
  return value === undefined ? null : nonNegativeInteger(value);
}

function requiredArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TwitchEventNormalizationError();
  }

  return value;
}

function actor(id: unknown, displayName: unknown): { readonly id: string; readonly displayName: string } {
  return { id: requiredString(id), displayName: requiredString(displayName) };
}

function optionalActor(id: unknown, displayName: unknown): { readonly id: string; readonly displayName: string } | null {
  if (id === null || id === undefined) {
    if (displayName === null || displayName === undefined) return null;
    throw new TwitchEventNormalizationError();
  }

  return actor(id, displayName);
}

function broadcasterActor(event: Record<string, unknown>): [string, string] {
  return [requiredString(event.broadcaster_user_id), requiredString(event.broadcaster_user_name)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
