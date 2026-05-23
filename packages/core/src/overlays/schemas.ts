import { z } from "zod";
import {
  nonEmptyStringSchema,
  overlayElementLayoutSchema,
  overlayPurposeSchema,
  overlayScopeSchema,
  positiveIntegerSchema
} from "../shared/schemas.js";

export const moduleOutputRequestSchema = z.object({
  moduleId: nonEmptyStringSchema,
  overlayId: nonEmptyStringSchema,
  purpose: overlayPurposeSchema
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
  volume: z.number().min(0).max(1)
});

export const overlayTextInstructionSchema = z.object({
  text: z.string(),
  layout: overlayElementLayoutSchema
});

export const overlayInstructionSchema = z.object({
  id: nonEmptyStringSchema,
  overlayId: nonEmptyStringSchema,
  moduleId: nonEmptyStringSchema,
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema,
  visual: overlayVisualInstructionSchema.nullable(),
  audio: overlayAudioInstructionSchema.nullable(),
  text: overlayTextInstructionSchema.nullable(),
  tts: z.unknown().nullable(),
  durationMs: positiveIntegerSchema.max(120_000)
});

export const overlayModuleSnapshotSchema = z.object({
  moduleId: nonEmptyStringSchema,
  enabled: z.boolean(),
  instructions: z.array(overlayInstructionSchema)
});

export const overlayCompositionSchema = z.object({
  overlayId: nonEmptyStringSchema,
  purpose: overlayPurposeSchema,
  scope: overlayScopeSchema,
  modules: z.array(overlayModuleSnapshotSchema)
});
