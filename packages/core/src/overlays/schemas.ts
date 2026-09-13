import { z } from "zod";
import { playbackTimingSchema } from "./playback-timing.js";
import {
  alertTextBoxStyleSchema,
  alertTextStyleSchema,
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  compatibleRgbaColorSchema
} from "../alerts/text-style.js";
import { ttsPlaybackInstructionSchema } from "../tts/schemas.js";
import {
  nonEmptyStringSchema,
  nonNegativeIntegerSchema,
  overlayElementLayoutSchema,
  overlayPurposeSchema,
  overlayScopeSchema,
  overlayTargetProfileIdSchema,
  positiveIntegerSchema
} from "../shared/schemas.js";

export const moduleOutputRequestSchema = z.object({
  moduleId: nonEmptyStringSchema,
  overlayId: nonEmptyStringSchema,
  purpose: overlayPurposeSchema,
  targetProfileId: overlayTargetProfileIdSchema.nullable().optional()
});

export const unifiedOutputRequestSchema = z.object({
  overlayId: nonEmptyStringSchema,
  purpose: overlayPurposeSchema,
  enabledModuleIds: z.array(nonEmptyStringSchema)
});

export const overlayVisualInstructionSchema = z.object({
  assetId: nonEmptyStringSchema,
  mediaType: z.enum(["image", "gif", "video"]),
  layout: overlayElementLayoutSchema
});

export const overlayAudioInstructionSchema = z.object({
  assetId: nonEmptyStringSchema,
  volume: z.number().min(0).max(1),
  sourceKind: z.enum(["audio", "video-soundtrack"]).optional()
});

export const overlayTextInstructionSchema = z.object({
  text: z.string(),
  layout: overlayElementLayoutSchema,
  textStyle: alertTextStyleSchema.default(compatibilityAlertTextStyle),
  boxStyle: alertTextBoxStyleSchema.default(compatibilityAlertTextBoxStyle)
});

export const overlayShapeInstructionSchema = z.object({
  fill: compatibleRgbaColorSchema,
  layout: overlayElementLayoutSchema
});

export const overlayPresetAnimationInstructionSchema = z.object({
  mode: z.literal("preset"),
  entrance: nonEmptyStringSchema,
  exit: nonEmptyStringSchema,
  durationMs: nonNegativeIntegerSchema,
  delayMs: nonNegativeIntegerSchema,
  easing: nonEmptyStringSchema
});

export const overlayInstructionSchema = z.object({
  timing: playbackTimingSchema.optional(),
  id: nonEmptyStringSchema,
  overlayId: nonEmptyStringSchema,
  moduleId: nonEmptyStringSchema,
  operatorTest: z.literal(true).optional(),
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema,
  targetProfileId: overlayTargetProfileIdSchema.nullable().optional(),
  visual: overlayVisualInstructionSchema.nullable(),
  audio: overlayAudioInstructionSchema.nullable(),
  text: overlayTextInstructionSchema.nullable(),
  shape: overlayShapeInstructionSchema.nullable().optional(),
  animation: overlayPresetAnimationInstructionSchema.nullable().optional(),
  tts: ttsPlaybackInstructionSchema.nullable(),
  durationMs: positiveIntegerSchema.max(120_000)
});

export const overlayModuleSnapshotSchema = z.object({
  surfaceLayer: z.object({ visible: z.boolean(), zIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict().optional(),
  moduleId: nonEmptyStringSchema,
  enabled: z.boolean(),
  instructions: z.array(overlayInstructionSchema)
});

export const overlayCompositionSchema = z.object({
  overlayId: nonEmptyStringSchema,
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema,
  targetProfileId: overlayTargetProfileIdSchema.nullable().optional(),
  modules: z.array(overlayModuleSnapshotSchema)
});
