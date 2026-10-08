import type { BusEvent, EffectTrigger, NormalizedStreamEvent } from "@stream-jams/core";

/** A journal-shaped canonical bus event for consumer tests. */
export function canonicalBusEvent(event: NormalizedStreamEvent, effectTriggers: readonly EffectTrigger[] = []): BusEvent {
  return {
    kind: "canonical",
    sequence: 1,
    busId: `bus-${event.id}`,
    eventId: event.id,
    sourceKind: event.ingestProvider,
    sourceRegistrationId: null,
    receivedAt: event.occurredAt,
    correlationKey: null,
    effectTriggers,
    event
  };
}

/** A journal-shaped external Streamer.bot bus event carrying its derived triggers. */
export function externalBusEvent(effectTriggers: readonly EffectTrigger[]): BusEvent {
  const first = effectTriggers[0];
  if (first === undefined) throw new Error("External bus events need at least one trigger");
  return {
    kind: "external",
    sequence: 1,
    busId: `bus-${first.eventId}`,
    eventId: first.eventId,
    sourceKind: "streamerbot",
    sourceRegistrationId: null,
    receivedAt: first.occurredAt,
    correlationKey: null,
    effectTriggers
  };
}
