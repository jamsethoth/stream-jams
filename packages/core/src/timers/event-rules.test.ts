import { expect, it } from "vitest";
import { timerEventRuleSchema, matchesTimerEventRule, timerEventAdjustmentMs, timerAdjustmentSchema } from "./event-rules.js";
import type { NormalizedStreamEvent } from "../events/types.js";

const event: NormalizedStreamEvent = { id: "cheer-1", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", occurredAt: "2026-10-01T00:00:00Z", actor: { id: "u", displayName: "Viewer" }, message: null, metadata: {}, type: "cheer", amount: 250 };
const rule = timerEventRuleSchema.parse({ enabled: true, ingestProvider: "twitch", eventType: "cheer", rewardId: null, tier: null, action: "increment", amountMs: 30_000, quantityUnit: 100, inactiveBehavior: "ignore" });
it("matches source and computes whole quantity units", () => {
  expect(matchesTimerEventRule(rule, event)).toBe(true);
  expect(matchesTimerEventRule(rule, { ...event, ingestProvider: "streamerbot" })).toBe(false);
  expect(timerEventAdjustmentMs(rule, event)).toBe(60_000);
  expect(timerEventAdjustmentMs(rule, { ...event, amount: 50 })).toBe(0);
});
it("rejects irrelevant filters, invalid units, and unsafe manual amounts", () => {
  expect(timerEventRuleSchema.safeParse({ ...rule, rewardId: "reward" }).success).toBe(false);
  expect(timerEventRuleSchema.safeParse({ ...rule, quantityUnit: 0 }).success).toBe(false);
  expect(timerAdjustmentSchema.safeParse({ action: "set", amountMs: Number.MAX_SAFE_INTEGER }).success).toBe(false);
  expect(timerAdjustmentSchema.safeParse({ action: "set", amountMs: -1 }).success).toBe(false);
});
