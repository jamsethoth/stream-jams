import { randomUUID } from "node:crypto";
import { manualEventSubmissionSchema, normalizedStreamEventSchema, type ExternalEventIdentity, type ManualBusEvent, type ManualEventAction, type ManualEventSubmission, type ManualSubmissionReceipt, type ManualSubmissionChannel } from "@stream-jams/core";
import type { AutomationScope } from "../automation/automation-credential-service.js";
import { createNormalizedEffectTriggers } from "../screen-effects/effect-trigger-adapter.js";
import type { EventBus } from "./event-bus.js";

/** Constructed only by authenticated management/operator or scoped automation adapters, never request bodies. */
export type TrustedManualSubmissionContext =
  | { readonly channel: "management" | "operator" }
  | { readonly channel: "automation"; readonly scopes: readonly AutomationScope[] };

export interface ManualEventServiceOptions {
  readonly bus: Pick<EventBus, "publishManual" | "externalPayloadIdentities" | "recordRejected">;
  /** Validate saved targets, exact profiles, assets/routes and declared external identities before journaling. */
  readonly validateReferences: (action: ManualEventAction, context: TrustedManualSubmissionContext) => Promise<boolean>;
  readonly generateEventId?: () => string;
  readonly generateReferenceId?: () => string;
  readonly now?: () => Date;
}

/**
 * Payload declarations follow the bus's external payload semantics: source keys compare case-insensitively (as
 * Streamer.bot source names always have) and event types exactly.
 */
export function isDeclaredExternalPayloadIdentity(declared: readonly ExternalEventIdentity[], identity: ExternalEventIdentity): boolean {
  return declared.some(candidate => candidate.providerKind === identity.providerKind
    && candidate.sourceKey.toLowerCase() === identity.sourceKey.toLowerCase() && candidate.eventType === identity.eventType);
}

/**
 * Whether a simulated external event has any declared consumer. Payload declarations compare source keys
 * case-insensitively; alert rules and trigger selectors match exactly, as their own matchers do.
 */
export function hasExternalSimulationConsumer(identity: ExternalEventIdentity, consumers: {
  readonly payloadIdentities: readonly ExternalEventIdentity[];
  readonly exactIdentities: readonly ExternalEventIdentity[];
}): boolean {
  return isDeclaredExternalPayloadIdentity(consumers.payloadIdentities, identity)
    || consumers.exactIdentities.some(candidate => candidate.providerKind === identity.providerKind
      && candidate.sourceKey === identity.sourceKey && candidate.eventType === identity.eventType);
}

export class ManualSubmissionRejectedError extends Error {
  constructor(readonly reason: "invalid-action" | "forbidden" | "invalid-reference", readonly referenceId: string) {
    super("Manual submission was rejected. Review its action, permissions and references before submitting again.");
    this.name = "ManualSubmissionRejectedError";
  }
}

/** Assigns identity once and publishes through ordinary bounded journal delivery; never directly enqueues. */
export class ManualEventService {
  constructor(private readonly options: ManualEventServiceOptions) {}

  async submit(input: ManualEventSubmission, context: TrustedManualSubmissionContext): Promise<ManualSubmissionReceipt> {
    const parsed = manualEventSubmissionSchema.safeParse(input);
    if (!parsed.success) return this.#reject("invalid-action", context.channel);
    if (context.channel === "automation" && (parsed.data.action.kind !== "video-request" || !context.scopes.includes("videos:submit"))) {
      return this.#reject("forbidden", context.channel);
    }
    const receivedAt = (this.options.now?.() ?? new Date()).toISOString();
    const eventId = this.options.generateEventId?.() ?? `manual_${randomUUID()}`;
    const action: ManualEventAction = parsed.data.action.kind === "simulate-canonical"
      ? { kind: "simulate-canonical", event: normalizedStreamEventSchema.parse({ ...parsed.data.action.event, id: eventId, occurredAt: receivedAt }) }
      : parsed.data.action;
    let validReferences: boolean;
    try { validReferences = await this.options.validateReferences(action, context); }
    // error-provenance: allow expected -- unavailable or invalid references are rejected with bounded evidence before journal insertion
    catch { return this.#reject("invalid-reference", context.channel); }
    if (!validReferences) return this.#reject("invalid-reference", context.channel);
    // Preserve the provider payload subscription limit: undeclared consumers never acquire arbitrary payloads.
    const journalAction: ManualEventAction = action.kind === "simulate-external" && !isDeclaredExternalPayloadIdentity(this.options.bus.externalPayloadIdentities(), action.identity)
      ? { kind: "simulate-external", identity: action.identity }
      : action;
    const event: Omit<ManualBusEvent, "sequence" | "busId"> = {
      kind: "manual", sourceKind: "manual", sourceRegistrationId: null, correlationKey: null,
      eventId, receivedAt, action: journalAction,
      submission: { channel: context.channel, mayAutoplay: context.channel !== "automation" || context.scopes.includes("videos:control") },
      effectTriggers: journalAction.kind === "simulate-canonical" ? createNormalizedEffectTriggers(journalAction.event) : []
    };
    return this.options.bus.publishManual(event);
  }

  #reject(reason: ManualSubmissionRejectedError["reason"], channel: ManualSubmissionChannel): never {
    const referenceId = this.options.generateReferenceId?.() ?? `manual_rejected_${randomUUID()}`;
    this.options.bus.recordRejected("manual", referenceId, channel);
    throw new ManualSubmissionRejectedError(reason, referenceId);
  }
}
