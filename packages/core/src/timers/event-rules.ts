import { z } from "zod";
import { streamEventTypes, type NormalizedStreamEvent } from "../events/types.js";

// Thirty days is ample for a subathon and keeps all duration arithmetic bounded.
export const MAX_TIMER_REMAINING_MS = 30 * 24 * 60 * 60 * 1000;
export const timerAdjustmentSchema = z.object({
  action: z.enum(["increment", "decrement", "set"]),
  amountMs: z.number().int().min(0).max(MAX_TIMER_REMAINING_MS)
}).strict();
export type TimerAdjustment = z.infer<typeof timerAdjustmentSchema>;
export const timerEventRuleSchema = z.object({
  enabled: z.boolean(),
  ingestProvider: z.enum(["any", "twitch", "streamerbot"]),
  eventType: z.enum(streamEventTypes),
  rewardId: z.string().trim().min(1).max(120).nullable(),
  tier: z.enum(["1000", "2000", "3000", "prime"]).nullable(),
  action: z.enum(["start", "stop", "increment", "decrement", "restart"]),
  amountMs: z.number().int().min(0).max(MAX_TIMER_REMAINING_MS),
  quantityUnit: z.number().int().min(1).max(1_000_000_000).nullable(),
  inactiveBehavior: z.enum(["ignore", "start", "paused"])
}).strict().superRefine((rule, context) => {
  if (rule.rewardId !== null && rule.eventType !== "channel_point_redemption") context.addIssue({ code: "custom", message: "Reward filters require a redemption event", path: ["rewardId"] });
  if (rule.tier !== null && !["subscription", "resubscription", "gift_subscription", "community_gift"].includes(rule.eventType)) context.addIssue({ code: "custom", message: "Tier filters require a subscription event", path: ["tier"] });
  if (rule.quantityUnit !== null && !["cheer", "raid", "gift_subscription", "community_gift"].includes(rule.eventType)) context.addIssue({ code: "custom", message: "Quantity requires a count-bearing event", path: ["quantityUnit"] });
});
export const timerEventRulesSchema = timerEventRuleSchema.array().max(50);
export type TimerEventRule = z.infer<typeof timerEventRuleSchema>;

export function matchesTimerEventRule(rule: TimerEventRule, event: NormalizedStreamEvent): boolean {
  return rule.enabled && rule.eventType === event.type && (rule.ingestProvider === "any" || rule.ingestProvider === event.ingestProvider)
    && (rule.rewardId === null || (event.type === "channel_point_redemption" && event.rewardId === rule.rewardId))
    && (rule.tier === null || ("tier" in event && event.tier === rule.tier));
}
export function timerEventAdjustmentMs(rule: TimerEventRule, event: NormalizedStreamEvent): number {
  const quantity = rule.quantityUnit === null ? 1 : Math.floor(Math.max(0, event.amount ?? 0) / rule.quantityUnit);
  return Math.min(MAX_TIMER_REMAINING_MS, rule.amountMs * quantity);
}
