import { z } from "zod";
import { ingestProviderIdSchema, normalizedStreamEventSchema } from "../events/schemas.js";
import { effectTriggerSchema } from "../screen-effects/schemas.js";
import { isoDateTimeSchema } from "../shared/schemas.js";
import type { BusEvent } from "./types.js";

const busIdentitySchema = z.string().trim().min(1).max(512);

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
  busEventBaseSchema.extend({ kind: z.literal("external") }).strict()
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
