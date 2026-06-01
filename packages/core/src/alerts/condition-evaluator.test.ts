import type { AlertCondition } from "./types.js";
import type {
  ChannelPointRedemptionEvent,
  CheerEvent,
  NormalizedStreamEvent,
  RaidEvent,
  ResubscriptionEvent,
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
    expect(evaluate({ field: "giftCount", operator: "min", value: 5 }, createCheerEvent({ metadata: { giftCount: 8 } }))).toBe(true);
    expect(evaluate({ field: "raidViewers", operator: "min", value: 25 }, createRaidEvent())).toBe(true);
    expect(evaluate({ field: "cheerAmount", operator: "max", value: 1000 }, createCheerEvent({ amount: 750 }))).toBe(true);
    expect(evaluate({ field: "channelPointReward", operator: "equals", value: "reward-1" }, createChannelPointEvent())).toBe(true);
    expect(evaluate({ field: "rewardTitle", operator: "includes", value: "Hydrate" }, createChannelPointEvent())).toBe(true);
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
