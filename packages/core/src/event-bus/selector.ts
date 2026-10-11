import { z } from "zod";
import { DefaultAlertConditionEvaluator } from "../alerts/condition-evaluator.js";
import { alertConditionSchema } from "../alerts/schemas.js";
import type { AlertCondition } from "../alerts/types.js";
import { validateAuthoredAlertConditions } from "../alerts/variation-authoring.js";
import { streamEventTypes, type IngestProviderId, type StreamEventType } from "../events/types.js";
import type { BusEvent } from "./types.js";

/** What a selector matches: a canonical event type, a stable Twitch reward, or an exact external identity. */
export type EventTriggerMatch =
  | { readonly kind: "canonical"; readonly type: StreamEventType }
  | { readonly kind: "twitch-reward"; readonly broadcasterId: string; readonly rewardId: string }
  | { readonly kind: "external"; readonly providerKind: "streamerbot"; readonly sourceKey: string; readonly eventType: string };

/**
 * Shared trigger used by every bus consumer. External matches use exact identity only: payload content is
 * untrusted and never selects anything. Conditions apply to canonical matches only.
 */
export interface EventTriggerSelector {
  readonly match: EventTriggerMatch;
  readonly sources: "any" | readonly IngestProviderId[];
  readonly conditions: readonly AlertCondition[];
}

const storageSafeIdSchema = z.string().trim().min(1).max(120).regex(
  /^[A-Za-z0-9_-]+$/u,
  "IDs may contain only letters, numbers, underscores, and hyphens"
);
const boundedIdentityTextSchema = z.string().trim().min(1).max(120).refine(
  (value) => Array.from(value).every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }),
  "Event identities cannot contain control characters"
);
const selectorSourceSchema = z.enum(["twitch", "streamerbot"]);

export const eventTriggerMatchSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("canonical"), type: z.enum(streamEventTypes) }).strict(),
  z.object({ kind: z.literal("twitch-reward"), broadcasterId: storageSafeIdSchema, rewardId: storageSafeIdSchema }).strict(),
  z.object({
    kind: z.literal("external"),
    providerKind: z.literal("streamerbot"),
    sourceKey: boundedIdentityTextSchema,
    eventType: boundedIdentityTextSchema
  }).strict()
]) satisfies z.ZodType<EventTriggerMatch>;

export const eventTriggerSelectorSchema = z.object({
  match: eventTriggerMatchSchema,
  sources: z.union([
    z.literal("any"),
    z.array(selectorSourceSchema).min(1).max(2).refine((sources) => new Set(sources).size === sources.length, "Sources must be unique")
  ]),
  conditions: z.array(alertConditionSchema).max(20)
}).strict().superRefine((selector, context) => {
  if (selector.match.kind !== "canonical") {
    if (selector.conditions.length > 0) {
      context.addIssue({ code: "custom", path: ["conditions"], message: "Only canonical events can have conditions" });
    }
    return;
  }
  for (const issue of validateAuthoredAlertConditions(selector.match.type, selector.conditions)) {
    context.addIssue({ code: "custom", path: ["conditions", issue.conditionIndex], message: issue.message });
  }
}) satisfies z.ZodType<EventTriggerSelector>;

const conditionEvaluator = new DefaultAlertConditionEvaluator();

/** The only matcher for selectors. Consumers decide what to do with a match. */
export function matchSelector(selector: EventTriggerSelector, event: BusEvent): boolean {
  if (selector.sources !== "any" && !selector.sources.includes(event.sourceKind)) return false;
  const { match } = selector;
  switch (match.kind) {
    case "canonical":
      return event.kind === "canonical"
        && event.event.type === match.type
        && selector.conditions.every((condition) => conditionEvaluator.evaluate(condition, event.event));
    case "twitch-reward":
      return event.effectTriggers.some((trigger) => trigger.kind === "twitch-reward"
        && trigger.broadcasterId === match.broadcasterId
        && trigger.rewardId === match.rewardId);
    case "external":
      return event.effectTriggers.some((trigger) => trigger.kind === "streamerbot-event"
        && trigger.sourceKey === match.sourceKey
        && trigger.eventType === match.eventType);
  }
}

/**
 * Stable identity for duplicate detection. Reward and external identities match the pre-selector binding
 * identities so stored rows migrate without recomputation; non-default sources or conditions are appended.
 */
export function eventTriggerSelectorIdentity(selector: EventTriggerSelector): string {
  const { match } = selector;
  const base = match.kind === "canonical"
    ? `canonical:${JSON.stringify([match.type])}`
    : match.kind === "twitch-reward"
      ? `twitch-reward:${JSON.stringify([match.broadcasterId, match.rewardId])}`
      : `external:${JSON.stringify([match.providerKind, match.sourceKey, match.eventType])}`;
  return selector.sources === "any" && selector.conditions.length === 0
    ? base
    : `${base}|${JSON.stringify([selector.sources, selector.conditions])}`;
}
