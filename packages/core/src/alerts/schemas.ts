import { z } from "zod";
import {
  nonEmptyStringSchema,
  nonNegativeIntegerSchema,
  overlayElementLayoutSchema,
  positiveIntegerSchema
} from "../shared/schemas.js";

export const alertCollectionSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  enabled: z.boolean()
});

export const alertConditionSchema = z.object({
  field: nonEmptyStringSchema,
  operator: z.enum(["equals", "min", "max", "range", "includes"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.tuple([z.number(), z.number()])])
});

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
  visualAssetId: nonEmptyStringSchema.nullable(),
  audioAssetId: nonEmptyStringSchema.nullable(),
  textTemplate: z.string(),
  ttsConfig: alertTtsConfigSchema.nullable(),
  durationMs: positiveIntegerSchema.max(120_000),
  layout: overlayElementLayoutSchema
});

export const streamEventTypeSchema = z.enum([
  "follow",
  "subscription",
  "resubscription",
  "cheer",
  "raid",
  "channel_point_redemption"
]);

export const alertRuleSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  eventType: streamEventTypeSchema,
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
