import { expect, it } from "vitest";
import { timerEventRuleSchema, matchesTimerEventRule, timerEventAdjustmentMs, timerAdjustmentSchema } from "./event-rules.js";
import type { BusEvent } from "../event-bus/types.js";
import type { NormalizedStreamEvent } from "../events/types.js";

const cheer: NormalizedStreamEvent = { id: "cheer-1", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", occurredAt: "2026-10-01T00:00:00Z", actor: { id: "u", displayName: "Viewer" }, message: null, metadata: {}, type: "cheer", amount: 250 };
function busEvent(event: NormalizedStreamEvent): BusEvent {
  return { kind: "canonical", sequence: 1, busId: "bus-1", eventId: event.id, sourceKind: event.ingestProvider, sourceRegistrationId: null, receivedAt: event.occurredAt, correlationKey: null, effectTriggers: [], event };
}
const rule = timerEventRuleSchema.parse({ enabled: true, selector: { match: { kind: "canonical", type: "cheer" }, sources: ["twitch"], conditions: [] }, action: "increment", amountMs: 30_000, quantityUnit: 100, inactiveBehavior: "ignore" });
it("matches source and computes whole quantity units", () => {
  expect(matchesTimerEventRule(rule, busEvent(cheer))).toBe(true);
  expect(matchesTimerEventRule(rule, busEvent({ ...cheer, ingestProvider: "streamerbot" }))).toBe(false);
  expect(matchesTimerEventRule({ ...rule, enabled: false }, busEvent(cheer))).toBe(false);
  expect(timerEventAdjustmentMs(rule, busEvent(cheer))).toBe(60_000);
  expect(timerEventAdjustmentMs(rule, busEvent({ ...cheer, amount: 50 }))).toBe(0);
});
it("rejects irrelevant filters, invalid units, and unsafe manual amounts", () => {
  expect(timerEventRuleSchema.safeParse({ ...rule, selector: { ...rule.selector, conditions: [{ field: "channelPointReward", operator: "equals", value: "reward" }] } }).success).toBe(false);
  expect(timerEventRuleSchema.safeParse({ ...rule, quantityUnit: 0 }).success).toBe(false);
  expect(timerEventRuleSchema.safeParse({ ...rule, selector: { ...rule.selector, match: { kind: "canonical", type: "follow" } } }).success).toBe(false);
  expect(timerEventRuleSchema.safeParse({ ...rule, selector: { match: { kind: "external", providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" }, sources: "any", conditions: [] } }).success).toBe(false);
  expect(timerAdjustmentSchema.safeParse({ action: "set", amountMs: Number.MAX_SAFE_INTEGER }).success).toBe(false);
  expect(timerAdjustmentSchema.safeParse({ action: "set", amountMs: -1 }).success).toBe(false);
});
it("filters subscriptions by tier through a canonical condition", () => {
  const tierThree = timerEventRuleSchema.parse({ ...rule, quantityUnit: null, selector: { match: { kind: "canonical", type: "subscription" }, sources: "any", conditions: [{ field: "tier", operator: "equals", value: "3000" }] } });
  const subscription: NormalizedStreamEvent = { ...cheer, id: "sub-1", type: "subscription", amount: 1, tier: "3000" };
  expect(matchesTimerEventRule(tierThree, busEvent(subscription))).toBe(true);
  expect(matchesTimerEventRule(tierThree, busEvent({ ...subscription, tier: "1000" }))).toBe(false);
});
it("filters redemptions by reward and accepts Prime tier conditions, as migrated legacy rules do", () => {
  const reward = timerEventRuleSchema.parse({ ...rule, quantityUnit: null, selector: { match: { kind: "canonical", type: "channel_point_redemption" }, sources: ["streamerbot"], conditions: [{ field: "channelPointReward", operator: "equals", value: "cat-paws" }] } });
  const redemption: NormalizedStreamEvent = { ...cheer, id: "redeem-1", ingestProvider: "streamerbot", type: "channel_point_redemption", amount: null, rewardId: "cat-paws", rewardTitle: "Cat paws", userInput: null };
  expect(matchesTimerEventRule(reward, busEvent(redemption))).toBe(true);
  expect(matchesTimerEventRule(reward, busEvent({ ...redemption, rewardId: "other" }))).toBe(false);
  expect(matchesTimerEventRule(reward, busEvent({ ...redemption, ingestProvider: "twitch" }))).toBe(false);
  const prime = timerEventRuleSchema.parse({ ...rule, quantityUnit: null, selector: { match: { kind: "canonical", type: "subscription" }, sources: "any", conditions: [{ field: "tier", operator: "equals", value: "prime" }] } });
  expect(matchesTimerEventRule(prime, busEvent({ ...cheer, id: "sub-prime", type: "subscription", amount: 1, tier: "prime" }))).toBe(true);
});
