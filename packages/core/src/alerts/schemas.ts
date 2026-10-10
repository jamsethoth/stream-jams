import { z } from "zod";
import { alertEventTypes, streamEventTypes } from "../events/types.js";
import { normalizedStreamEventSchema } from "../events/schemas.js";
import type { AlertSourceEvent, ExternalAlertEvent } from "../events/types.js";
import {
  isoDateTimeSchema,
  metadataSchema,
  nonEmptyStringSchema,
  nonNegativeIntegerSchema,
  overlayElementLayoutSchema,
  positiveIntegerSchema
} from "../shared/schemas.js";
import { channelPointRewardIdsSchema } from "./channel-point-reward-selection.js";

export const alertCollectionSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  enabled: z.boolean()
});

export const alertConditionSchema = z.union([
  z.object({
    field: nonEmptyStringSchema,
    operator: z.enum(["equals", "min", "max", "range", "includes"]),
    value: z.union([z.string(), z.number(), z.boolean(), z.tuple([z.number(), z.number()])])
  }),
  z.object({
    field: z.literal("channelPointReward"),
    operator: z.literal("oneOf"),
    value: channelPointRewardIdsSchema
  })
]);

export const alertTtsConfigSchema = z.object({
  enabled: z.boolean(),
  providerId: nonEmptyStringSchema,
  voiceId: nonEmptyStringSchema.nullable(),
  template: z.string(),
  minimumAmount: positiveIntegerSchema.nullable()
});

export const alertVariantSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  enabled: z.boolean(),
  weight: positiveIntegerSchema,
  conditions: z.array(alertConditionSchema).optional(),
  priority: z.number().int().optional(),
  visualAssetId: nonEmptyStringSchema.nullable(),
  audioAssetId: nonEmptyStringSchema.nullable(),
  textTemplate: z.string(),
  ttsConfig: alertTtsConfigSchema.nullable(),
  durationMs: positiveIntegerSchema.max(120_000),
  layout: overlayElementLayoutSchema
});

export const streamEventTypeSchema = z.enum(streamEventTypes);
export const alertEventTypeSchema = z.enum(alertEventTypes);

/** Bounded external identity text shared by alert rules and event trigger selectors. */
export const externalIdentityTextSchema = z.string().trim().min(1).max(120).refine(
  (value) => Array.from(value).every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127 && (code < 128 || code > 159);
  }),
  "Event identities cannot contain control characters"
);

export const externalAlertIdentitySchema = z.object({
  providerKind: z.literal("streamerbot"),
  sourceKey: externalIdentityTextSchema,
  eventType: externalIdentityTextSchema
}).strict();

export const alertRuleSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  eventType: alertEventTypeSchema,
  /** Required exactly when `eventType` is `external_event`; see `alertRuleExternalIdentityIssue`. */
  externalIdentity: externalAlertIdentitySchema.optional(),
  enabled: z.boolean(),
  collectionIds: z.array(nonEmptyStringSchema),
  conditions: z.array(alertConditionSchema),
  variants: z.array(alertVariantSchema).min(1),
  cooldownSeconds: nonNegativeIntegerSchema,
  priority: z.number().int()
});

export const alertActivationStateSchema = z.object({
  enabledCollectionIds: z.array(nonEmptyStringSchema),
  disabledRuleIds: z.array(nonEmptyStringSchema)
});

export const externalAlertEventSchema = z.object({
  id: nonEmptyStringSchema,
  type: z.literal("external_event"),
  providerId: z.literal("streamerbot"),
  ingestProvider: z.literal("streamerbot"),
  occurredAt: isoDateTimeSchema,
  actor: z.object({ id: z.null(), displayName: nonEmptyStringSchema.max(100) }),
  message: z.null(),
  metadata: metadataSchema,
  amount: z.null(),
  identity: externalAlertIdentitySchema,
  summary: z.string().max(256),
  userName: z.string().max(100)
}).strict() satisfies z.ZodType<ExternalAlertEvent>;

export const alertSourceEventSchema = z.union([normalizedStreamEventSchema, externalAlertEventSchema]) satisfies z.ZodType<AlertSourceEvent>;

/** External rules need an exact identity and no conditions; canonical rules carry no identity. */
export function alertRuleExternalIdentityIssue(rule: {
  readonly eventType: string;
  readonly externalIdentity?: unknown;
  readonly conditions: readonly unknown[];
  readonly variants?: readonly { readonly conditions?: readonly unknown[] | undefined }[];
}): string | null {
  if (rule.eventType !== "external_event") {
    return rule.externalIdentity === undefined ? null : "Only external event alerts can select an external identity";
  }
  if (rule.externalIdentity === undefined) return "External event alerts must select an external identity";
  if (rule.conditions.length > 0 || rule.variants?.some((variant) => (variant.conditions?.length ?? 0) > 0) === true) {
    return "External event alerts cannot have conditions";
  }
  return null;
}
