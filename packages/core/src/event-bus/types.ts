import type { IngestProviderId, NormalizedStreamEvent } from "../events/types.js";
import type { EffectTrigger } from "../screen-effects/types.js";

interface BusEventBase {
  /** Journal-assigned, strictly increasing delivery order. */
  readonly sequence: number;
  readonly busId: string;
  /** Upstream event identity used for same-source duplicate protection. */
  readonly eventId: string;
  readonly sourceKind: IngestProviderId;
  readonly sourceRegistrationId: string | null;
  readonly receivedAt: string;
  /** Cross-source identity of a Twitch occurrence; null for external events. */
  readonly correlationKey: string | null;
  /** Screen Effects triggers derived at intake; replaced by shared selectors in a later slice. */
  readonly effectTriggers: readonly EffectTrigger[];
}

export interface CanonicalBusEvent extends BusEventBase {
  readonly kind: "canonical";
  readonly event: NormalizedStreamEvent;
}

/** Exact identity of an external event: the only thing that selects it. */
export interface ExternalEventIdentity {
  readonly providerKind: "streamerbot";
  readonly sourceKey: string;
  readonly eventType: string;
}

/**
 * Untrusted JSON object an external source sent with the event. It is journaled only when a registered
 * consumer declared the event's identity in `externalPayloads`, and each such consumer validates it with
 * its own schema. It never selects, routes or chooses media.
 */
export type ExternalEventPayload = Readonly<Record<string, unknown>>;

export interface ExternalBusEvent extends BusEventBase {
  readonly kind: "external";
  readonly payload?: ExternalEventPayload | undefined;
}

export type BusEvent = CanonicalBusEvent | ExternalBusEvent;

export type BusEventInput =
  | Omit<CanonicalBusEvent, "sequence" | "busId">
  | Omit<ExternalBusEvent, "sequence" | "busId">;

/** What a consumer did with one event; recorded for Diagnostics. */
export type EventBusConsumerOutcome = "admitted" | "no-match" | "failed" | "expired";

/** What a consumer's handler reports; `expired` is decided by the bus before delivery. */
export type EventBusHandleOutcome = Exclude<EventBusConsumerOutcome, "expired">;

/** What intake did with one event a source delivered; recorded for Diagnostics. */
export type EventBusIntakeOutcome = "accepted" | "duplicate" | "merged" | "rejected";

/** Default and bounds of how old a pending event may be and still be delivered after a restart. */
export const eventBusReplayAgeDefaultSeconds = 120;
export const eventBusReplayAgeMaxSeconds = 1_800;

/** Passed with each delivery. */
export interface EventBusDeliveryContext {
  /**
   * Records this event as handled for the consumer. Call it inside the consumer's own SQLite transaction on the
   * bus database connection, so the state change and the cursor commit or roll back together. An event whose
   * checkpoint committed is never handed to the consumer again, even when `handle` later throws.
   */
  checkpoint(): void;
}

/**
 * How a module registers with the central event bus. Each consumer receives every accepted event once per
 * journal row, in journal order, through its own persisted cursor (at-least-once across crashes).
 */
export interface EventBusConsumerRegistration {
  /** Stable ID that names the persisted cursor; changing it loses the consumer's position. */
  readonly id: string;
  /** Total delivery attempts before the event is recorded as failed and skipped. Defaults to 3. */
  readonly maxAttempts?: number | undefined;
  /**
   * External identities whose payload this consumer needs. Payloads of other identities are dropped at
   * intake. Declaring an identity also makes the source subscribe to it while the consumer is registered.
   */
  readonly externalPayloads?: readonly ExternalEventIdentity[] | undefined;
  /**
   * When true (the default), events older than the configured replay age are skipped and recorded as expired,
   * for example after a restart. State consumers that must see every event set it to false.
   */
  readonly expiresAfterReplayAge?: boolean | undefined;
  /**
   * Handles one event. Without a checkpoint it must be idempotent by `busId`, because delivery is at least once.
   * A thrown error is retried, then recorded and skipped. Returns whether the event was admitted or matched
   * nothing; a consumer that handled its own error returns `failed`. No result counts as admitted.
   */
  handle(event: BusEvent, context: EventBusDeliveryContext): Promise<EventBusHandleOutcome | void>;
}
