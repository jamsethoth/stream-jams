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
  /** Screen Effects triggers derived at intake; replaced by shared selectors in a later slice. */
  readonly effectTriggers: readonly EffectTrigger[];
}

export interface CanonicalBusEvent extends BusEventBase {
  readonly kind: "canonical";
  readonly event: NormalizedStreamEvent;
}

export interface ExternalBusEvent extends BusEventBase {
  readonly kind: "external";
}

export type BusEvent = CanonicalBusEvent | ExternalBusEvent;

export type BusEventInput =
  | Omit<CanonicalBusEvent, "sequence" | "busId">
  | Omit<ExternalBusEvent, "sequence" | "busId">;
