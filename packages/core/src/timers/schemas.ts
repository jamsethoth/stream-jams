import { z } from "zod";
import { timerEventRulesSchema } from "./event-rules.js";
import { timerOverflowGeometry } from "./output-geometry.js";
import { isExactLegacyTimerAppearance } from "./legacy-appearance.js";
import { alertAudioOutputsSchema } from "../audio/schemas.js";
import {
  isoDateTimeSchema,
  nonEmptyStringSchema,
  nonNegativeIntegerSchema,
  overlayElementLayoutSchema,
  overlayTargetProfileIdSchema,
  positiveIntegerSchema
} from "../shared/schemas.js";
import type {
  TimerCommandResult,
  TimerDefinition,
  TimerDefinitionInput,
  TimerDefinitionSnapshot,
  TimerOverlayCard,
  TimerRunState,
  TimerStackProjection,
  TimerStackRegion,
  TimerAppearance,
  TimerProfile,
  TimerTypography,
  TimerOverflowGeometry,
  TimersOverlayModuleConfig
} from "./types.js";

const timerIdSchema = nonEmptyStringSchema;
const epochMsSchema = nonNegativeIntegerSchema.max(Number.MAX_SAFE_INTEGER);
const durationMsSchema = positiveIntegerSchema.max(Number.MAX_SAFE_INTEGER);

export const timerDefinitionSnapshotSchema = z.object({
  id: timerIdSchema,
  label: nonEmptyStringSchema,
  durationMs: durationMsSchema,
  iconAssetId: timerIdSchema.nullable(),
  startAudioAssetId: timerIdSchema.nullable(),
  endAudioAssetId: timerIdSchema.nullable(),
  outputs: alertAudioOutputsSchema
}).strict() satisfies z.ZodType<TimerDefinitionSnapshot>;

export const timerDefinitionSchema = timerDefinitionSnapshotSchema.extend({
  eventRules: timerEventRulesSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
}).strict() satisfies z.ZodType<TimerDefinition>;

export const timerDefinitionInputSchema = timerDefinitionSnapshotSchema.omit({ id: true }).extend({ eventRules: timerEventRulesSchema.optional() })
  .strict() satisfies z.ZodType<TimerDefinitionInput>;

const runIdentityFields = {
  definitionId: timerIdSchema,
  generation: timerIdSchema,
  snapshot: timerDefinitionSnapshotSchema
};

export const timerRunStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("running"),
    ...runIdentityFields,
    startedAtEpochMs: epochMsSchema,
    endsAtEpochMs: epochMsSchema
  }).strict().refine(run => run.endsAtEpochMs > run.startedAtEpochMs, {
    path: ["endsAtEpochMs"],
    message: "Running timer deadline must follow its start"
  }),
  z.object({
    status: z.literal("paused"),
    ...runIdentityFields,
    remainingMs: durationMsSchema
  }).strict(),
  z.object({
    status: z.literal("completed"),
    ...runIdentityFields,
    completedAtEpochMs: epochMsSchema,
    expiresAtEpochMs: epochMsSchema
  }).strict().refine(run => run.expiresAtEpochMs > run.completedAtEpochMs, {
    path: ["expiresAtEpochMs"],
    message: "Completed timer expiry must follow completion"
  })
]) satisfies z.ZodType<TimerRunState>;

export const timerCommandResultSchema = z.object({
  changed: z.boolean(),
  state: timerRunStateSchema.nullable()
}).strict() satisfies z.ZodType<TimerCommandResult>;

const strictLayoutSchema = overlayElementLayoutSchema.strict();
export const timerStackRegionSchema = z.object({
  layout: strictLayoutSchema,
  orientation: z.enum(["vertical", "horizontal"]),
  maxVisible: z.number().int().min(1).max(12)
}).strict() satisfies z.ZodType<TimerStackRegion>;

export const timerProfileDimensions = {
  landscape: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 }
} as const;

function regionFor(profile: keyof typeof timerProfileDimensions) {
  const bounds = timerProfileDimensions[profile];
  return timerStackRegionSchema.superRefine((region, context) => {
    const { x, y, width, height } = region.layout;
    if (x < 0 || y < 0 || x + width > bounds.width || y + height > bounds.height) {
      context.addIssue({ code: "custom", path: ["layout"], message: `Timer region must fit the ${profile} canvas` });
    }
  });
}

export const legacyTimersOverlayModuleConfigSchema = z.object({
  profiles: z.object({
    landscape: regionFor("landscape"),
    vertical: regionFor("vertical")
  }).strict()
}).strict();

const color = z.string().regex(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/iu, "Use a six or eight digit hex color");
const px = (maximum: number) => z.number().finite().min(0).max(maximum);
export const timerTypographySchema = z.strictObject({
  fontPreset: z.enum(["system-sans", "rounded-sans", "serif", "monospace"]), fontSizePx: z.number().int().min(8).max(128),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800), z.literal(900)]), color,
  legacyFamily: z.enum(["Inter, ui-sans-serif, system-ui, sans-serif", "ui-monospace, SFMono-Regular, Consolas, monospace"]).optional()
}) satisfies z.ZodType<TimerTypography>;
export const timerAppearanceSchema = z.strictObject({
  cardWidthPx: z.number().finite().positive().max(1920), cardHeightPx: z.number().finite().positive().max(1920),
  orientation: z.enum(["vertical", "horizontal"]), reverse: z.boolean().optional(), maxVisible: z.number().int().min(1).max(12), stackGapPx: px(128),
  gapPx: px(128), blockPaddingPx: px(128), inlinePaddingPx: px(128), cornerRadiusPx: px(256), borderWidthPx: px(16),
  borderColor: color, backgroundColor: color, backgroundOpacity: z.number().finite().min(0).max(1),
  labelFont: timerTypographySchema, valueFont: timerTypographySchema, iconSizePx: px(256),
  runningAccent: color.nullable(), pausedAccent: color, completedAccent: color
}).superRefine((a, context) => {
  const innerHeight = a.cardHeightPx - 2 * (a.blockPaddingPx + a.borderWidthPx);
  const textWidth = a.cardWidthPx - 2 * (a.inlinePaddingPx + a.borderWidthPx) - a.iconSizePx - a.gapPx * 2 - a.valueFont.fontSizePx * 2.4;
  if (innerHeight < Math.max(a.iconSizePx, a.labelFont.fontSizePx, a.valueFont.fontSizePx) || textWidth < 1) {
    if (!isExactLegacyTimerAppearance(a)) {
      context.addIssue({ code: "custom", message: "Card dimensions must fit icon, padding and countdown text", path: ["cardWidthPx"] });
    }
  }
}) satisfies z.ZodType<TimerAppearance>;
export const timerProfileSchema = z.strictObject({ appearance: timerAppearanceSchema,
  desktopPlacement: z.strictObject({ x: px(1920), y: px(1920), zIndex: z.number().int().min(-10000).max(10000), scale: z.number().finite().positive().max(10), reverse: z.boolean().optional() })
}) satisfies z.ZodType<TimerProfile>;
function currentProfileFor(profile: keyof typeof timerProfileDimensions) {
  return timerProfileSchema.superRefine((value, context) => {
    const footprint = timerOverflowGeometry(value.appearance).footprint;
    const { x, y, scale } = value.desktopPlacement;
    const bounds = timerProfileDimensions[profile];
    if (x + footprint.width * scale > bounds.width + 1e-8 || y + footprint.height * scale > bounds.height + 1e-8) {
      context.addIssue({ code: "custom", path: ["desktopPlacement"], message: `Desktop Timer footprint must fit the ${profile} scene; reduce scale or move it` });
    }
  });
}
export const timersOverlayModuleConfigSchema = z.strictObject({ schemaVersion: z.literal(2), profiles: z.strictObject({
  landscape: currentProfileFor("landscape"), vertical: currentProfileFor("vertical")
}) }) satisfies z.ZodType<TimersOverlayModuleConfig>;
const timerOverflowSchema = z.strictObject({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().positive(), height: z.number().finite().positive(),
  fontSizePx: px(42), blockPaddingPx: px(10), inlinePaddingPx: px(16), offsetPx: px(14) }) satisfies z.ZodType<TimerOverflowGeometry>;

const cardBase = {
  iconVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  definitionId: timerIdSchema,
  generation: timerIdSchema,
  label: nonEmptyStringSchema,
  iconAssetId: timerIdSchema.nullable(),
  slot: strictLayoutSchema
};

export const timerOverlayCardSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("running"), ...cardBase, endsAtEpochMs: epochMsSchema }).strict(),
  z.object({ status: z.literal("paused"), ...cardBase, remainingMs: durationMsSchema }).strict(),
  z.object({ status: z.literal("completed"), ...cardBase, remainingMs: z.literal(0), expiresAtEpochMs: epochMsSchema }).strict()
]) satisfies z.ZodType<TimerOverlayCard>;

export const timerStackProjectionSchema = z.object({
  targetProfileId: overlayTargetProfileIdSchema,
  region: timerStackRegionSchema,
  cards: z.array(timerOverlayCardSchema),
  overflowCount: nonNegativeIntegerSchema,
  appearance: timerAppearanceSchema.optional(), overflow: timerOverflowSchema.optional(), renderScale: z.number().finite().positive().max(10).optional(),
  countdownMaxWidth: z.union([z.literal("8ch"), z.number().finite().min(0).max(1920)]).optional()
}).strict().superRefine((projection, context) => {
  if (projection.cards.length > projection.region.maxVisible) {
    context.addIssue({ code: "custom", path: ["cards"], message: "Timer card count exceeds visible capacity" });
  }
  const identities = projection.cards.map(card => card.definitionId);
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: "custom", path: ["cards"], message: "Timer cards must have unique definition IDs" });
  }
}) satisfies z.ZodType<TimerStackProjection>;

/** Compatibility alias; presentation ownership lives with overlay modules. */
export { overlayModulePresentationSchema } from "../overlay-modules/presentation.js";
