import { z } from "zod";
import { alertAudioOutputsSchema } from "../audio/schemas.js";
import { overlayPresetAnimationInstructionSchema } from "../overlays/schemas.js";
import { overlayElementLayoutSchema } from "../shared/schemas.js";
import type {
  CreateScreenEffectDocumentInput,
  EffectBinding,
  EffectVariant,
  ScreenEffectDocument
} from "./types.js";

const storageSafeIdSchema = z.string().trim().min(1).max(120).regex(
  /^[A-Za-z0-9_-]+$/u,
  "IDs may contain only letters, numbers, underscores, and hyphens"
);
const boundedNameSchema = z.string().trim().min(1).max(120);
const boundedIdentityTextSchema = z.string().trim().min(1).max(120).refine(
  (value) => Array.from(value).every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }),
  "Event identities cannot contain control characters"
);
const safeIntegerSchema = z.number().int().refine(Number.isSafeInteger, "Priority must be a safe integer");
const volumeSchema = z.number().finite().min(0).max(1);

const twitchRewardBindingSchema = z.object({
  id: storageSafeIdSchema,
  kind: z.literal("twitch-reward"),
  broadcasterId: storageSafeIdSchema,
  rewardId: storageSafeIdSchema
}).strict();

const streamerBotEventBindingSchema = z.object({
  id: storageSafeIdSchema,
  kind: z.literal("streamerbot-event"),
  providerId: storageSafeIdSchema,
  sourceKey: boundedIdentityTextSchema,
  eventType: boundedIdentityTextSchema
}).strict();

export const effectBindingSchema = z.discriminatedUnion("kind", [
  twitchRewardBindingSchema,
  streamerBotEventBindingSchema
]) satisfies z.ZodType<EffectBinding>;

const effectLayoutSchema = overlayElementLayoutSchema.strict();
const imageEffectVisualSchema = z.object({
  mediaType: z.enum(["image", "gif"]),
  assetId: storageSafeIdSchema,
  layout: effectLayoutSchema
}).strict();
const videoEffectVisualSchema = z.object({
  mediaType: z.literal("video"),
  assetId: storageSafeIdSchema,
  layout: effectLayoutSchema,
  playEmbeddedAudio: z.boolean(),
  audioVolume: volumeSchema
}).strict();

export const effectVisualSchema = z.discriminatedUnion("mediaType", [
  imageEffectVisualSchema,
  videoEffectVisualSchema
]);

export const effectSoundSchema = z.object({
  assetId: storageSafeIdSchema,
  volume: volumeSchema
}).strict();

export const effectVisualOutputsSchema = z.object({
  browserSource: z.boolean(),
  desktop: z.boolean()
}).strict();

const effectAnimationSchema = overlayPresetAnimationInstructionSchema.extend({
  durationMs: z.number().int().min(0).max(120_000),
  delayMs: z.number().int().min(0).max(120_000)
}).strict();

export const effectVariantSchema = z.object({
  id: storageSafeIdSchema,
  name: boundedNameSchema,
  kind: z.enum(["default", "weighted"]),
  enabled: z.boolean(),
  weight: z.number().int().min(1).max(10_000),
  visual: effectVisualSchema.nullable(),
  sound: effectSoundSchema.nullable(),
  animation: effectAnimationSchema.nullable(),
  durationMs: z.number().int().min(1_000).max(120_000),
  outputs: alertAudioOutputsSchema,
  visualOutputs: effectVisualOutputsSchema
}).strict().superRefine((variant, context) => {
  if (variant.visual === null && variant.sound === null) {
    context.addIssue({
      code: "custom",
      path: ["visual"],
      message: "Choose visual media or an explicit sound"
    });
  }
}) satisfies z.ZodType<EffectVariant>;

export const screenEffectDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: storageSafeIdSchema,
  name: boundedNameSchema,
  enabled: z.boolean(),
  description: z.string().trim().min(1).max(2_000).nullable(),
  category: z.string().trim().min(1).max(80).nullable(),
  priority: safeIntegerSchema,
  cooldownSeconds: z.number().int().min(0).max(86_400),
  bindings: z.array(effectBindingSchema).max(100),
  variants: z.array(effectVariantSchema).min(1).max(50)
}).strict().superRefine((document, context) => {
  addDuplicateIssues(document.bindings.map((binding) => binding.id), ["bindings"], "binding ID", context);
  addDuplicateIssues(document.bindings.map(effectBindingIdentity), ["bindings"], "binding identity", context);
  addDuplicateIssues(document.variants.map((variant) => variant.id), ["variants"], "variant ID", context);

  const enabledDefaults = document.variants.filter(
    (variant) => variant.kind === "default" && variant.enabled
  );
  if (enabledDefaults.length !== 1) {
    context.addIssue({
      code: "custom",
      path: ["variants"],
      message: "Choose exactly one enabled default variant"
    });
  }
}) satisfies z.ZodType<ScreenEffectDocument>;

const createScreenEffectDocumentInputSchema = z.object({
  id: storageSafeIdSchema,
  name: boundedNameSchema,
  defaultVariantId: storageSafeIdSchema
}).strict();

export function createScreenEffectDocument(input: CreateScreenEffectDocumentInput): ScreenEffectDocument {
  const parsed = createScreenEffectDocumentInputSchema.parse(input);
  return {
    schemaVersion: 1,
    id: parsed.id,
    name: parsed.name,
    enabled: false,
    description: null,
    category: null,
    priority: 0,
    cooldownSeconds: 0,
    bindings: [],
    variants: [{
      id: parsed.defaultVariantId,
      name: "Default",
      kind: "default",
      enabled: true,
      weight: 1,
      visual: null,
      sound: null,
      animation: null,
      durationMs: 10_000,
      outputs: { browserSource: false, deviceRouteIds: [] },
      visualOutputs: { browserSource: false, desktop: false }
    }]
  };
}

export function effectBindingIdentity(binding: EffectBinding): string {
  return binding.kind === "twitch-reward"
    ? `${binding.kind}:${JSON.stringify([binding.broadcasterId, binding.rewardId])}`
    : `${binding.kind}:${JSON.stringify([binding.providerId, binding.sourceKey, binding.eventType])}`;
}

function addDuplicateIssues(
  values: readonly string[],
  path: readonly (string | number)[],
  label: string,
  context: z.RefinementCtx
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path: [...path], message: `Each ${label} must be unique` });
  }
}
