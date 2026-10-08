import { z } from "zod";
import { eventTriggerSelectorSchema, matchSelector } from "../event-bus/selector.js";
import type { BusEvent } from "../event-bus/types.js";

// Thirty days is ample for a subathon and keeps all duration arithmetic bounded.
export const MAX_TIMER_REMAINING_MS = 30 * 24 * 60 * 60 * 1000;
export const timerAdjustmentSchema = z.object({
  action: z.enum(["increment", "decrement", "set"]),
  amountMs: z.number().int().min(0).max(MAX_TIMER_REMAINING_MS)
}).strict();
export type TimerAdjustment = z.infer<typeof timerAdjustmentSchema>;
const countBearingEventTypes: readonly string[] = ["cheer", "raid", "gift_subscription", "community_gift"];
export const timerEventRuleSchema = z.object({
  enabled: z.boolean(),
  selector: eventTriggerSelectorSchema,
  action: z.enum(["start", "stop", "increment", "decrement", "restart"]),
  amountMs: z.number().int().min(0).max(MAX_TIMER_REMAINING_MS),
  quantityUnit: z.number().int().min(1).max(1_000_000_000).nullable(),
  inactiveBehavior: z.enum(["ignore", "start", "paused"])
}).strict().superRefine((rule, context) => {
  const { match } = rule.selector;
  if (rule.quantityUnit !== null && !(match.kind === "canonical" && countBearingEventTypes.includes(match.type))) {
    context.addIssue({ code: "custom", message: "Quantity requires a count-bearing event", path: ["quantityUnit"] });
  }
});
export const timerEventRulesSchema = timerEventRuleSchema.array().max(50);
export type TimerEventRule = z.infer<typeof timerEventRuleSchema>;

export function matchesTimerEventRule(rule: TimerEventRule, event: BusEvent): boolean {
  return rule.enabled && matchSelector(rule.selector, event);
}
export function timerEventAdjustmentMs(rule: TimerEventRule, event: BusEvent): number {
  const amount = event.kind === "canonical" ? event.event.amount ?? 0 : 0;
  const quantity = rule.quantityUnit === null ? 1 : Math.floor(Math.max(0, amount) / rule.quantityUnit);
  return Math.min(MAX_TIMER_REMAINING_MS, rule.amountMs * quantity);
}
