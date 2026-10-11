import { z } from "zod";
import { manualEventActionSchema, manualSubmissionChannelSchema } from "./manual-submission.js";
import { ingestProviderIdSchema, normalizedStreamEventSchema } from "../events/schemas.js";
import { effectTriggerSchema } from "../screen-effects/schemas.js";
import { isoDateTimeSchema } from "../shared/schemas.js";
import { eventBusReplayAgeMaxSeconds, type BusEvent } from "./types.js";

const busIdentitySchema = z.string().trim().min(1).max(512);

import { externalEventPayloadSchema } from "./external-payload.js";
export { externalEventPayloadSchema, externalEventPayloadMaxBytes } from "./external-payload.js";

const busEventBaseSchema = z.object({
  sequence: z.number().int().positive(),
  busId: busIdentitySchema,
  eventId: busIdentitySchema,
  sourceKind: ingestProviderIdSchema,
  sourceRegistrationId: busIdentitySchema.nullable(),
  receivedAt: isoDateTimeSchema,
  correlationKey: busIdentitySchema.nullable(),
  effectTriggers: z.array(effectTriggerSchema)
});

export const busEventSchema = z.discriminatedUnion("kind", [
  busEventBaseSchema.extend({ kind: z.literal("canonical"), event: normalizedStreamEventSchema }).strict(),
  busEventBaseSchema.extend({ kind: z.literal("external"), payload: externalEventPayloadSchema.optional() }).strict(),
  busEventBaseSchema.extend({ kind: z.literal("manual"), sourceKind: z.literal("manual"), sourceRegistrationId: z.null(), correlationKey: z.null(), action: manualEventActionSchema, submission: z.object({ channel: manualSubmissionChannelSchema, mayAutoplay: z.boolean() }).strict() }).strict()
]).superRefine((value, context) => {
  if (value.effectTriggers.some((trigger) => trigger.eventId !== value.eventId)) {
    context.addIssue({ code: "custom", path: ["effectTriggers"], message: "effect triggers must belong to the bus event" });
  }
  if (value.kind === "manual") {
    if (value.action.kind === "simulate-canonical" && (value.action.event.id !== value.eventId || value.action.event.occurredAt !== value.receivedAt)) {
      context.addIssue({ code: "custom", path: ["action"], message: "Manual canonical identity and time must match the bus event" });
    }
    if (value.action.kind === "simulate-canonical" && value.effectTriggers.some(trigger => trigger.kind !== "twitch-reward" || trigger.occurredAt !== value.receivedAt || value.action.kind !== "simulate-canonical" || value.action.event.type !== "channel_point_redemption" || trigger.rewardId !== value.action.event.rewardId || trigger.broadcasterId !== value.action.event.metadata.twitchBroadcasterUserId)) {
      context.addIssue({ code: "custom", path: ["effectTriggers"], message: "Manual reward triggers must match the normalized simulation" });
    }
    if (value.action.kind !== "simulate-canonical" && value.effectTriggers.length !== 0) {
      context.addIssue({ code: "custom", path: ["effectTriggers"], message: "Only canonical manual simulations can carry derived reward triggers" });
    }
  }
  if (value.kind === "external" && value.correlationKey !== null) {
    context.addIssue({ code: "custom", path: ["correlationKey"], message: "external events have no correlation key" });
  }
  if (value.kind === "canonical" && value.event.id !== value.eventId) {
    context.addIssue({ code: "custom", path: ["eventId"], message: "eventId must match the canonical event ID" });
  }
}) satisfies z.ZodType<BusEvent>;

/** Management settings for the bus. Replay age is how old a pending event may be and still be delivered. */
export const eventBusSettingsSchema = z.object({
  replayAgeSeconds: z.number().int().min(0).max(eventBusReplayAgeMaxSeconds)
}).strict();

export type EventBusSettings = z.infer<typeof eventBusSettingsSchema>;

const outcomeReferenceSchema = z.string().trim().min(1).max(200).nullable();

/** Recent intake and per-consumer outcomes for Diagnostics. Never carries payloads, route keys or secrets. */
export const eventBusActivityViewSchema = z.object({
  events: z.array(z.object({
    id: z.number().int().positive(),
    receivedAt: isoDateTimeSchema,
    sourceKind: z.enum(["twitch", "streamerbot", "manual"]),
    submissionChannel: manualSubmissionChannelSchema.optional(),
    kind: z.enum(["canonical", "external", "manual"]).nullable(),
    eventType: z.string().max(250).nullable(),
    outcome: z.enum(["accepted", "duplicate", "merged", "rejected"]),
    referenceId: outcomeReferenceSchema,
    consumers: z.array(z.object({
      consumerId: z.string().trim().min(1).max(120),
      outcome: z.enum(["admitted", "no-match", "failed", "expired", "pending"]),
      referenceId: outcomeReferenceSchema
    }).strict())
  }).strict()).max(200)
}).strict();

export type EventBusActivityView = z.infer<typeof eventBusActivityViewSchema>;
