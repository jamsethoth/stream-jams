import { z } from "zod";
import { normalizedStreamEventSchema } from "../events/schemas.js";
import type { NormalizedStreamEvent } from "../events/types.js";
import { alertEditorTestRequestSchema } from "../management/contracts.js";
import { overlayTargetProfileIdSchema } from "../shared/schemas.js";
import { videoRequestInputSchema } from "../videos/request-schema.js";
import { externalEventPayloadSchema } from "./external-payload.js";
import { eventTriggerMatchSchema } from "./selector.js";

/** Bounds the whole action, including existing module schemas with flexible sample metadata. */
export const manualEventActionMaxBytes = 65_536;
export function isBoundedManualJson(value: unknown): boolean {
  try {
    const pending: unknown[] = [value];
    const seen = new Set<object>();
    while (pending.length > 0) {
      const item = pending.pop();
      if (item === null || typeof item === "string" || typeof item === "boolean") continue;
      if (typeof item === "number" && Number.isFinite(item)) continue;
      if (typeof item !== "object" || seen.has(item)) return false;
      seen.add(item);
      if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) return false;
      if (Object.getOwnPropertySymbols(item).length > 0) return false;
      pending.push(...Object.values(item));
    }
    const text = JSON.stringify(value);
    return text !== undefined && new TextEncoder().encode(text).byteLength <= manualEventActionMaxBytes;
  }
  // error-provenance: allow expected -- cycles and BigInt are invalid boundary inputs
  catch { return false; }
}

const targetIdSchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/u);
const externalIdentitySchema = eventTriggerMatchSchema.options[2].omit({ kind: true });
/** Canonical simulation data has no client-assigned identity or timestamp. */
type WithoutIdentity<T> = T extends unknown ? Omit<T, "id" | "occurredAt"> : never;
export type ManualCanonicalInput = WithoutIdentity<NormalizedStreamEvent>;
const manualCanonicalInputSchema = z.custom<ManualCanonicalInput>(value => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if ("id" in value || "occurredAt" in value || "sourceRegistrationId" in value || "recipients" in value) return false;
  const schema = normalizedStreamEventSchema.options.find(option => option.shape.type.value === (value as { type?: unknown }).type);
  return schema?.strict().safeParse({ ...value, id: "manual-validation", occurredAt: "2026-01-01T00:00:00.000Z" }).success === true;
});

const targetActions = [
  z.object({ kind: z.literal("alert-draft-test"), request: alertEditorTestRequestSchema.strict() }).strict(),
  z.object({ kind: z.literal("alert-saved-test"), alertId: targetIdSchema, targetProfileId: overlayTargetProfileIdSchema.nullable(), samplePayload: z.record(z.string(), z.unknown()), includeAudio: z.boolean(), includeTts: z.boolean() }).strict(),
  z.object({ kind: z.literal("effect-test"), effectId: targetIdSchema, variantId: targetIdSchema, confirmLiveImpact: z.literal(true) }).strict(),
  z.object({ kind: z.literal("video-request"), request: videoRequestInputSchema }).strict()
] as const;

export const manualEventSubmissionSchema = z.object({ action: z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("simulate-canonical"), event: manualCanonicalInputSchema }).strict(),
  z.object({ kind: z.literal("simulate-external"), identity: externalIdentitySchema, payload: externalEventPayloadSchema.optional() }).strict(),
  ...targetActions
]) }).strict().refine(isBoundedManualJson, "Manual actions exceed the bounded JSON size limit");
export type ManualEventSubmission = z.infer<typeof manualEventSubmissionSchema>;

/** Journaled canonical simulations contain only the server-normalized identity and time. */
export const manualEventActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("simulate-canonical"), event: normalizedStreamEventSchema }).strict(),
  z.object({ kind: z.literal("simulate-external"), identity: externalIdentitySchema, payload: externalEventPayloadSchema.optional() }).strict(),
  ...targetActions
]).refine(isBoundedManualJson, "Manual actions exceed the bounded JSON size limit");
export type ManualEventAction = z.infer<typeof manualEventActionSchema>;
export const manualSubmissionChannelSchema = z.enum(["management", "operator", "automation"]);
export type ManualSubmissionChannel = z.infer<typeof manualSubmissionChannelSchema>;

/** Journal acceptance is separate from delivery/admission; pending never claims a queued item. */
export interface ManualSubmissionReceipt {
  readonly status: "accepted" | "duplicate";
  readonly busId: string;
  readonly eventId: string;
  readonly consumers: readonly { readonly consumerId: string; readonly outcome: "admitted" | "no-match" | "failed" | "expired" | "pending"; readonly referenceId: string | null }[];
}
