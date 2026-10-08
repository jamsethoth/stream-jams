import { z } from "zod";
import { ingestProviderIdSchema, normalizedStreamEventSchema } from "../events/schemas.js";
import { effectTriggerSchema } from "../screen-effects/schemas.js";
import { isoDateTimeSchema } from "../shared/schemas.js";
import { eventBusReplayAgeMaxSeconds, type BusEvent } from "./types.js";

const busIdentitySchema = z.string().trim().min(1).max(512);

/** Serialized size limit for a journaled external payload. Larger payloads are dropped at intake. */
export const externalEventPayloadMaxBytes = 16_384;

export const externalEventPayloadSchema = z.record(z.string(), z.unknown()).refine((value) => {
  try {
    const serialized = JSON.stringify(value);
    return serialized !== undefined && new TextEncoder().encode(serialized).byteLength <= externalEventPayloadMaxBytes;
  }
  // error-provenance: allow expected -- unserializable values (cycles, BigInt) are simply not valid payloads
  catch {
    return false;
  }
}, "External event payloads must be JSON objects within the size limit");

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
  busEventBaseSchema.extend({ kind: z.literal("external"), payload: externalEventPayloadSchema.optional() }).strict()
]).superRefine((value, context) => {
  if (value.effectTriggers.some((trigger) => trigger.eventId !== value.eventId)) {
    context.addIssue({ code: "custom", path: ["effectTriggers"], message: "effect triggers must belong to the bus event" });
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
    sourceKind: ingestProviderIdSchema,
    kind: z.enum(["canonical", "external"]).nullable(),
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
