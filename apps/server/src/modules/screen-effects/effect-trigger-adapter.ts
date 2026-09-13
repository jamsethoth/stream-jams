import { createHash } from "node:crypto";
import {
  effectTriggerSchema,
  externalStreamEventSchema,
  type EffectTrigger,
  type NormalizedStreamEvent,
  type StreamerBotSubscriptionSelection
} from "@stream-jams/core";
import type { StreamerBotEventEnvelope } from "../streamerbot/streamerbot-client.js";

export interface StreamerBotEffectTriggerContext {
  readonly providerId: string;
  readonly twitchBroadcasterId: string | null;
  readonly externalSubscriptions: readonly StreamerBotSubscriptionSelection[];
}

export interface EffectTriggerSink {
  handleTriggers(triggers: readonly EffectTrigger[]): Promise<unknown>;
}

export function createNormalizedEffectTriggers(event: NormalizedStreamEvent): readonly EffectTrigger[] {
  if (event.ingestProvider !== "twitch" || event.type !== "channel_point_redemption") {
    return [];
  }

  const broadcasterId = boundedIdentity(event.metadata.twitchBroadcasterUserId);
  if (broadcasterId === null) {
    return [];
  }

  return [effectTriggerSchema.parse({
    kind: "twitch-reward",
    eventId: event.id,
    occurredAt: event.occurredAt,
    broadcasterId,
    rewardId: event.rewardId,
    summary: safeSummary(event.rewardTitle, "Channel point reward")
  })];
}

export function createStreamerBotEffectTriggers(
  envelope: StreamerBotEventEnvelope,
  normalizedEvent: NormalizedStreamEvent | null,
  context: StreamerBotEffectTriggerContext
): readonly EffectTrigger[] {
  const eventId = normalizedEvent?.id ?? stableEnvelopeEventId(envelope);
  const triggers: EffectTrigger[] = [];

  if (
    normalizedEvent?.type === "channel_point_redemption"
    && context.twitchBroadcasterId !== null
  ) {
    triggers.push(effectTriggerSchema.parse({
      kind: "twitch-reward",
      eventId: normalizedEvent.id,
      occurredAt: normalizedEvent.occurredAt,
      broadcasterId: context.twitchBroadcasterId,
      rewardId: normalizedEvent.rewardId,
      summary: safeSummary(normalizedEvent.rewardTitle, "Channel point reward")
    }));
  }

  if (!isExplicitlySubscribed(envelope, context.externalSubscriptions)) {
    return triggers;
  }
  const externalEvent = externalStreamEventSchema.parse({
    id: eventId,
    ingestProvider: "streamerbot",
    subscriptionSourceKey: envelope.event.source,
    upstreamSource: envelope.event.source,
    upstreamType: envelope.event.type,
    occurredAt: normalizedEvent?.occurredAt ?? envelope.timeStamp,
    receivedAt: envelope.timeStamp,
    payload: envelope.data,
    metadata: {
      upstreamSource: envelope.event.source,
      upstreamType: envelope.event.type
    }
  });

  triggers.push(effectTriggerSchema.parse({
    kind: "streamerbot-event",
    eventId: externalEvent.id,
    occurredAt: externalEvent.occurredAt,
    providerId: context.providerId,
    sourceKey: externalEvent.subscriptionSourceKey,
    eventType: externalEvent.upstreamType,
    summary: summaryFromPayload(externalEvent.payload, externalEvent.upstreamSource, externalEvent.upstreamType)
  }));
  return triggers;
}

function isExplicitlySubscribed(
  envelope: StreamerBotEventEnvelope,
  selections: readonly StreamerBotSubscriptionSelection[]
): boolean {
  return selections.some(
    (selection) => selection.sourceKey === envelope.event.source
      && selection.eventTypes.includes(envelope.event.type)
  );
}

function stableEnvelopeEventId(envelope: StreamerBotEventEnvelope): string {
  const transportId = boundedIdentity(envelope.id);
  if (transportId !== null) return transportId;
  const fingerprint = canonicalJson({
    timeStamp: envelope.timeStamp,
    event: envelope.event,
    data: envelope.data
  });
  return `streamerbot:${createHash("sha256").update(fingerprint).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

function summaryFromPayload(payload: Record<string, unknown>, source: string, type: string): string {
  for (const key of ["summary", "message", "title", "name", "sceneName"] as const) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return safeSummary(value, `${source}.${type}`);
    }
  }
  return safeSummary(`${source}.${type}`, "Streamer.bot event");
}

function safeSummary(value: string, fallback: string): string {
  const sanitized = Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && !(code >= 127 && code <= 159);
    })
    .join("")
    .trim();
  return (sanitized.length === 0 ? fallback : sanitized).slice(0, 256);
}

function boundedIdentity(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return null;
  return Array.from(trimmed).every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && !(code >= 127 && code <= 159);
  }) ? trimmed : null;
}
