import type { AlertCondition } from "./types.js";
import type {
  ChannelPointRedemptionEvent,
  CheerEvent,
  CommunityGiftEvent,
  HypeTrainProgressEvent,
  NormalizedStreamEvent,
  PollProgressEvent,
  PredictionEndEvent,
  RaidEvent,
  ResubscriptionEvent,
  StreamOfflineEvent,
  SubscriptionEvent
} from "../events/types.js";
import { describe, expect, it } from "vitest";
import { DefaultAlertConditionEvaluator } from "./condition-evaluator.js";

describe("DefaultAlertConditionEvaluator", () => {
  const evaluator = new DefaultAlertConditionEvaluator();

  it("evaluates equality, includes, minimum, maximum, and range operators", () => {
    const event = createCheerEvent({
      actor: {
        id: "viewer-1",
        displayName: "Jams"
      },
      amount: 500,
      message: "this is wildly generous",
      metadata: {
        tags: ["vip", "founder"]
      }
    });

    expect(evaluate({ field: "actor.displayName", operator: "equals", value: "Jams" }, event)).toBe(true);
    expect(evaluate({ field: "message", operator: "includes", value: "generous" }, event)).toBe(true);
    expect(evaluate({ field: "metadata.tags", operator: "includes", value: "vip" }, event)).toBe(true);
    expect(evaluate({ field: "amount", operator: "min", value: 250 }, event)).toBe(true);
    expect(evaluate({ field: "amount", operator: "max", value: 1000 }, event)).toBe(true);
    expect(evaluate({ field: "amount", operator: "range", value: [400, 600] }, event)).toBe(true);
  });

  it("evaluates provider path conditions for source identity fields", () => {
    const directEvent = createCheerEvent();
    const streamerBotEvent = createCheerEvent({ ingestProvider: "streamerbot" });

    expect(evaluate({ field: "providerId", operator: "equals", value: "twitch" }, directEvent)).toBe(true);
    expect(evaluate({ field: "sourcePlatform", operator: "equals", value: "twitch" }, directEvent)).toBe(true);
    expect(evaluate({ field: "ingestProvider", operator: "equals", value: "twitch" }, directEvent)).toBe(true);
    expect(evaluate({ field: "providerId", operator: "equals", value: "twitch" }, streamerBotEvent)).toBe(true);
    expect(evaluate({ field: "sourcePlatform", operator: "equals", value: "twitch" }, streamerBotEvent)).toBe(true);
    expect(evaluate({ field: "ingestProvider", operator: "equals", value: "streamerbot" }, streamerBotEvent)).toBe(true);
    expect(evaluate({ field: "ingestProvider", operator: "equals", value: "twitch" }, streamerBotEvent)).toBe(false);
  });

  it("evaluates stack-specific aliases for tiers, tenure, gifts, raids, cheers, and rewards", () => {
    expect(evaluate({ field: "tier", operator: "equals", value: "2000" }, createSubscriptionEvent())).toBe(true);
    expect(evaluate({ field: "tenure", operator: "min", value: 12 }, createResubscriptionEvent())).toBe(true);
    expect(evaluate({ field: "tenureMonths", operator: "range", value: [10, 14] }, createResubscriptionEvent())).toBe(true);
    expect(evaluate({ field: "raidViewers", operator: "min", value: 25 }, createRaidEvent())).toBe(true);
    expect(evaluate({ field: "cheerAmount", operator: "max", value: 1000 }, createCheerEvent({ amount: 750 }))).toBe(true);
    expect(evaluate({ field: "channelPointReward", operator: "equals", value: "reward-1" }, createChannelPointEvent())).toBe(true);
    expect(evaluate({ field: "rewardTitle", operator: "includes", value: "Hydrate" }, createChannelPointEvent())).toBe(true);
  });

  it("evaluates canonical aliases without provider metadata", () => {
    const communityGift: CommunityGiftEvent = {
      ...createCheerEvent(),
      type: "community_gift",
      amount: 5,
      tier: "1000",
      cumulativeTotal: null,
      anonymous: false,
      metadata: {}
    };
    const hypeTrain: HypeTrainProgressEvent = {
      ...createCheerEvent(),
      type: "hype_train_progress",
      amount: 500,
      trainId: "train-1",
      level: 2,
      progress: 500,
      goal: 1000,
      total: 500,
      startedAt: "2026-05-30T09:00:00.000Z",
      expiresAt: "2026-05-30T09:05:00.000Z",
      endedAt: null,
      cooldownEndsAt: null,
      metadata: {}
    };
    const poll: PollProgressEvent = {
      ...createCheerEvent(),
      type: "poll_progress",
      amount: 12,
      pollId: "poll-1",
      title: "What should we play?",
      choices: [{ id: "choice-1", title: "Game A", totalVotes: 12 }],
      totalVotes: 12,
      startedAt: "2026-05-30T09:00:00.000Z",
      endsAt: "2026-05-30T09:05:00.000Z",
      status: "active",
      metadata: {}
    };
    const prediction: PredictionEndEvent = {
      ...createCheerEvent({ ingestProvider: "streamerbot" }),
      type: "prediction_end",
      amount: 1000,
      predictionId: "prediction-1",
      title: "Will we win?",
      outcomes: [{ id: "outcome-1", title: "Yes", totalUsers: 10, totalPoints: 1000 }],
      totalUsers: 10,
      totalPoints: 1000,
      startedAt: "2026-05-30T09:00:00.000Z",
      locksAt: "2026-05-30T09:05:00.000Z",
      endedAt: "2026-05-30T09:05:00.000Z",
      status: "resolved",
      winningOutcomeId: "outcome-1",
      metadata: {}
    };
    const stream: StreamOfflineEvent = {
      ...createCheerEvent(),
      type: "stream_offline",
      amount: null,
      streamId: "stream-1",
      streamType: "live",
      startedAt: "2026-05-30T09:00:00.000Z",
      endedAt: "2026-05-30T10:00:00.000Z",
      metadata: {}
    };

    expect(evaluate({ field: "giftCount", operator: "min", value: 5 }, communityGift)).toBe(true);
    expect(evaluate({ field: "hypeTrainLevel", operator: "equals", value: 2 }, hypeTrain)).toBe(true);
    expect(evaluate({ field: "hypeTrainProgress", operator: "range", value: [400, 600] }, hypeTrain)).toBe(true);
    expect(evaluate({ field: "pollVotes", operator: "max", value: 12 }, poll)).toBe(true);
    expect(evaluate({ field: "predictionPoints", operator: "min", value: 1000 }, prediction)).toBe(true);
    expect(evaluate({ field: "terminalStatus", operator: "equals", value: "resolved" }, prediction)).toBe(true);
    expect(evaluate({ field: "streamType", operator: "equals", value: "live" }, stream)).toBe(true);
    expect(evaluate({ field: "ingestProvider", operator: "equals", value: "streamerbot" }, prediction)).toBe(true);
  });

  it("fails closed for missing fields, non-numeric comparisons, and non-matching values", () => {
    const event = createCheerEvent({
      amount: 100,
      metadata: {
        giftCount: "five"
      }
    });

    expect(evaluate({ field: "unknown", operator: "equals", value: "anything" }, event)).toBe(false);
    expect(evaluate({ field: "metadata.giftCount", operator: "min", value: 5 }, event)).toBe(false);
    expect(evaluate({ field: "amount", operator: "range", value: [150, 250] }, event)).toBe(false);
    expect(evaluate({ field: "message", operator: "includes", value: "generous" }, event)).toBe(false);
    expect(evaluate({ field: "amount", operator: "equals", value: "100" }, event)).toBe(false);
  });

  function evaluate(condition: AlertCondition, event: NormalizedStreamEvent): boolean {
    return evaluator.evaluate(condition, event);
  }
});

function createCheerEvent(overrides: Partial<CheerEvent> = {}): CheerEvent {
  return {
    id: "event-cheer",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    occurredAt: "2026-05-30T09:00:00.000Z",
    type: "cheer",
    actor: {
      id: "viewer-1",
      displayName: "Viewer"
    },
    message: null,
    amount: 100,
    metadata: {},
    ...overrides
  };
}

function createSubscriptionEvent(overrides: Partial<SubscriptionEvent> = {}): SubscriptionEvent {
  return {
    id: "event-subscription",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    occurredAt: "2026-05-30T09:00:00.000Z",
    type: "subscription",
    actor: {
      id: "viewer-2",
      displayName: "Subscriber"
    },
    message: null,
    amount: 1,
    tier: "2000",
    metadata: {},
    ...overrides
  };
}

function createResubscriptionEvent(overrides: Partial<ResubscriptionEvent> = {}): ResubscriptionEvent {
  return {
    id: "event-resubscription",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    occurredAt: "2026-05-30T09:00:00.000Z",
    type: "resubscription",
    actor: {
      id: "viewer-3",
      displayName: "Resubscriber"
    },
    message: null,
    amount: 1,
    tier: "1000",
    streakMonths: 12,
    metadata: {},
    ...overrides
  };
}

function createRaidEvent(overrides: Partial<RaidEvent> = {}): RaidEvent {
  return {
    id: "event-raid",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    occurredAt: "2026-05-30T09:00:00.000Z",
    type: "raid",
    actor: {
      id: "viewer-4",
      displayName: "Raider"
    },
    message: null,
    amount: 40,
    metadata: {},
    ...overrides
  };
}

function createChannelPointEvent(overrides: Partial<ChannelPointRedemptionEvent> = {}): ChannelPointRedemptionEvent {
  return {
    id: "event-channel-point",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    occurredAt: "2026-05-30T09:00:00.000Z",
    type: "channel_point_redemption",
    actor: {
      id: "viewer-5",
      displayName: "Redeemer"
    },
    message: null,
    amount: null,
    rewardId: "reward-1",
    rewardTitle: "Hydrate",
    userInput: null,
    metadata: {},
    ...overrides
  };
}
