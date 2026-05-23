export type StreamEventType =
  | "follow"
  | "subscription"
  | "resubscription"
  | "cheer"
  | "raid"
  | "channel_point_redemption";

export interface StreamEventActor {
  readonly id: string | null;
  readonly displayName: string;
}

export interface BaseNormalizedStreamEvent {
  readonly id: string;
  readonly providerId: "twitch";
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

export type NormalizedStreamEvent =
  | FollowEvent
  | SubscriptionEvent
  | ResubscriptionEvent
  | CheerEvent
  | RaidEvent
  | ChannelPointRedemptionEvent;
