import { matchSelector } from "../event-bus/selector.js";
import type { BusEvent } from "../event-bus/types.js";
import type { EffectBinding, EffectTrigger } from "./types.js";

/** The trigger recorded on an occurrence when `binding` matches `event`, or null when it does not match. */
export function matchEffectBinding(binding: EffectBinding, event: BusEvent): EffectTrigger | null {
  if (!matchSelector(binding.selector, event)) return null;
  const { match } = binding.selector;
  if (match.kind === "canonical") {
    if (event.kind !== "canonical") return null;
    return {
      kind: "canonical-event",
      eventId: event.eventId,
      occurredAt: event.event.occurredAt,
      eventType: event.event.type,
      summary: canonicalSummary(event.event.type, event.event.actor.displayName)
    };
  }
  return event.effectTriggers.find((trigger) => match.kind === "twitch-reward"
    ? trigger.kind === "twitch-reward" && trigger.broadcasterId === match.broadcasterId && trigger.rewardId === match.rewardId
    : trigger.kind === "streamerbot-event" && trigger.sourceKey === match.sourceKey && trigger.eventType === match.eventType) ?? null;
}

function canonicalSummary(type: string, displayName: string): string {
  const viewer = Array.from(displayName).filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join("").trim();
  const label = type.replaceAll("_", " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} from ${viewer.length === 0 ? "Anonymous viewer" : viewer}`.slice(0, 256);
}
