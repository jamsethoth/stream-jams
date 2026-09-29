import { z } from "zod";
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
  OverlayModulePresentation,
  TimerCommandResult,
  TimerDefinition,
  TimerDefinitionSnapshot,
  TimerOverlayCard,
  TimerRunState,
  TimerStackProjection,
  TimerStackRegion,
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
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
}).strict() satisfies z.ZodType<TimerDefinition>;

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

export const timersOverlayModuleConfigSchema = z.object({
  profiles: z.object({
    landscape: regionFor("landscape"),
    vertical: regionFor("vertical")
  }).strict()
}).strict() satisfies z.ZodType<TimersOverlayModuleConfig>;

const cardBase = {
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
  overflowCount: nonNegativeIntegerSchema
}).strict().superRefine((projection, context) => {
  if (projection.cards.length > projection.region.maxVisible) {
    context.addIssue({ code: "custom", path: ["cards"], message: "Timer card count exceeds visible capacity" });
  }
  const identities = projection.cards.map(card => card.definitionId);
  if (new Set(identities).size !== identities.length) {
    context.addIssue({ code: "custom", path: ["cards"], message: "Timer cards must have unique definition IDs" });
  }
}) satisfies z.ZodType<TimerStackProjection>;

export const overlayModulePresentationSchema = z.object({
  kind: z.literal("timer-stack"),
  stack: timerStackProjectionSchema
}).strict() satisfies z.ZodType<OverlayModulePresentation>;
