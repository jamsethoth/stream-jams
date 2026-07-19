import type { SubscriptionTier } from "./schemas.js";

export type IngestProviderId = "twitch" | "streamerbot";

export type SourcePlatformId = "twitch";

export const streamEventTypes = [
  "follow", "subscription", "resubscription", "cheer", "raid", "channel_point_redemption",
  "gift_subscription", "community_gift",
  "hype_train_start", "hype_train_progress", "hype_train_end",
  "poll_start", "poll_progress", "poll_end",
  "prediction_start", "prediction_progress", "prediction_lock", "prediction_end",
  "stream_online", "stream_offline"
] as const;

export type StreamEventType = (typeof streamEventTypes)[number];

export interface StreamEventActor {
  readonly id: string | null;
  readonly displayName: string;
}

export interface BaseNormalizedStreamEvent {
  readonly id: string;
  readonly providerId: "twitch";
  readonly sourcePlatform: SourcePlatformId;
  readonly ingestProvider: IngestProviderId;
  readonly occurredAt: string;
  readonly actor: StreamEventActor;
  readonly message: string | null;
  readonly metadata: Record<string, unknown>;
}

export interface FollowEvent extends BaseNormalizedStreamEvent {
  readonly type: "follow";
  readonly amount: null;
}

export interface SubscriptionEvent extends BaseNormalizedStreamEvent {
  readonly type: "subscription";
  readonly amount: number;
  readonly tier: "1000" | "2000" | "3000" | "prime";
}

export interface ResubscriptionEvent extends BaseNormalizedStreamEvent {
  readonly type: "resubscription";
  readonly amount: number;
  readonly tier: "1000" | "2000" | "3000" | "prime";
  readonly streakMonths: number | null;
}

export interface CheerEvent extends BaseNormalizedStreamEvent {
  readonly type: "cheer";
  readonly amount: number;
}

export interface RaidEvent extends BaseNormalizedStreamEvent {
  readonly type: "raid";
  readonly amount: number;
}

export interface ChannelPointRedemptionEvent extends BaseNormalizedStreamEvent {
  readonly type: "channel_point_redemption";
  readonly amount: null;
  readonly rewardId: string;
  readonly rewardTitle: string;
  readonly userInput: string | null;
}

export interface GiftSubscriptionEvent extends BaseNormalizedStreamEvent {
  readonly type: "gift_subscription";
  readonly amount: 1;
  readonly tier: SubscriptionTier;
  readonly recipient: StreamEventActor;
  readonly gifter: StreamEventActor | null;
}

export interface CommunityGiftEvent extends BaseNormalizedStreamEvent {
  readonly type: "community_gift";
  readonly amount: number;
  readonly tier: SubscriptionTier;
  readonly cumulativeTotal: number | null;
  readonly anonymous: boolean;
}

interface HypeTrainFields {
  readonly amount: number | null;
  readonly trainId: string;
  readonly level: number | null;
  readonly progress: number | null;
  readonly goal: number | null;
  readonly total: number | null;
  readonly startedAt: string | null;
  readonly expiresAt: string | null;
  readonly endedAt: string | null;
  readonly cooldownEndsAt: string | null;
}

export interface HypeTrainStartEvent extends BaseNormalizedStreamEvent, HypeTrainFields {
  readonly type: "hype_train_start";
}

export interface HypeTrainProgressEvent extends BaseNormalizedStreamEvent, HypeTrainFields {
  readonly type: "hype_train_progress";
}

export interface HypeTrainEndEvent extends BaseNormalizedStreamEvent, HypeTrainFields {
  readonly type: "hype_train_end";
}

export interface PollChoice {
  readonly id: string;
  readonly title: string;
  readonly totalVotes: number;
}

interface PollFields {
  readonly amount: number;
  readonly pollId: string;
  readonly title: string;
  readonly choices: readonly PollChoice[];
  readonly totalVotes: number;
  readonly startedAt: string;
  readonly endsAt: string;
  readonly status: string;
}

export interface PollStartEvent extends BaseNormalizedStreamEvent, PollFields {
  readonly type: "poll_start";
}

export interface PollProgressEvent extends BaseNormalizedStreamEvent, PollFields {
  readonly type: "poll_progress";
}

export interface PollEndEvent extends BaseNormalizedStreamEvent, PollFields {
  readonly type: "poll_end";
}

export interface PredictionOutcome {
  readonly id: string;
  readonly title: string;
  readonly totalUsers: number;
  readonly totalPoints: number;
}

interface PredictionFields {
  readonly amount: number;
  readonly predictionId: string;
  readonly title: string;
  readonly outcomes: readonly PredictionOutcome[];
  readonly totalUsers: number;
  readonly totalPoints: number;
  readonly startedAt: string;
  readonly locksAt: string | null;
  readonly endedAt: string | null;
  readonly status: string;
  readonly winningOutcomeId: string | null;
}

export interface PredictionStartEvent extends BaseNormalizedStreamEvent, PredictionFields {
  readonly type: "prediction_start";
}

export interface PredictionProgressEvent extends BaseNormalizedStreamEvent, PredictionFields {
  readonly type: "prediction_progress";
}

export interface PredictionLockEvent extends BaseNormalizedStreamEvent, PredictionFields {
  readonly type: "prediction_lock";
}

export interface PredictionEndEvent extends BaseNormalizedStreamEvent, PredictionFields {
  readonly type: "prediction_end";
}

interface StreamFields {
  readonly amount: null;
  readonly streamId: string | null;
  readonly streamType: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
}

export interface StreamOnlineEvent extends BaseNormalizedStreamEvent, StreamFields {
  readonly type: "stream_online";
}

export interface StreamOfflineEvent extends BaseNormalizedStreamEvent, StreamFields {
  readonly type: "stream_offline";
}

export type NormalizedStreamEvent =
  | FollowEvent
  | SubscriptionEvent
  | ResubscriptionEvent
  | CheerEvent
  | RaidEvent
  | ChannelPointRedemptionEvent
  | GiftSubscriptionEvent
  | CommunityGiftEvent
  | HypeTrainStartEvent
  | HypeTrainProgressEvent
  | HypeTrainEndEvent
  | PollStartEvent
  | PollProgressEvent
  | PollEndEvent
  | PredictionStartEvent
  | PredictionProgressEvent
  | PredictionLockEvent
  | PredictionEndEvent
  | StreamOnlineEvent
  | StreamOfflineEvent;

export interface ExternalStreamEvent {
  readonly id: string;
  readonly ingestProvider: "streamerbot";
  readonly subscriptionSourceKey: string | null;
  readonly upstreamSource: string;
  readonly upstreamType: string;
  readonly occurredAt: string;
  readonly receivedAt: string;
  readonly payload: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
}

export interface StreamerBotSubscriptionSelection {
  readonly sourceKey: string;
  readonly eventTypes: readonly string[];
}
