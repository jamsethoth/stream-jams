import type { NormalizedStreamEvent } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import type { StreamerBotEventEnvelope } from "../streamerbot/streamerbot-client.js";
import {
  createNormalizedEffectTriggers,
  createStreamerBotEffectTriggers,
  MissingStreamerBotEventIdError
} from "./effect-trigger-adapter.js";

describe("effect trigger adapters", () => {
  it("uses trusted normalized Twitch broadcaster and reward identities while allowing renamed summaries", () => {
    const triggers = createNormalizedEffectTriggers(rewardEvent({
      ingestProvider: "twitch",
      rewardTitle: "Renamed reward",
      metadata: { twitchBroadcasterUserId: "broadcaster-1" }
    }));

    expect(triggers).toEqual([{
      kind: "twitch-reward",
      eventId: "event-1",
      occurredAt: "2026-09-08T12:00:00.000Z",
      broadcasterId: "broadcaster-1",
      rewardId: "reward-1",
      summary: "Renamed reward"
    }]);
  });

  it("rejects a direct Twitch reward when normalized broadcaster identity is missing", () => {
    expect(createNormalizedEffectTriggers(rewardEvent({ metadata: {} }))).toEqual([]);
  });

  it("uses the explicit Streamer.bot broadcaster association and never guesses from payload actors", () => {
    const event = rewardEvent({
      ingestProvider: "streamerbot",
      metadata: { upstreamSource: "Twitch", upstreamType: "RewardRedemption" }
    });
    const envelope = streamerBotEnvelope("Twitch", "RewardRedemption", {
      id: "payload-event-id",
      broadcaster: { id: "untrusted-broadcaster" },
      path: "C:\\secret\\effect.mp4"
    });

    expect(createStreamerBotEffectTriggers(envelope, event, {
      providerId: "provider-streamerbot",
      twitchBroadcasterId: "verified-broadcaster",
      externalSubscriptions: []
    })).toEqual([{
      kind: "twitch-reward",
      eventId: "event-1",
      occurredAt: "2026-09-08T12:00:00.000Z",
      broadcasterId: "verified-broadcaster",
      rewardId: "reward-1",
      summary: "Original reward"
    }]);

    expect(createStreamerBotEffectTriggers(envelope, event, {
      providerId: "provider-streamerbot",
      twitchBroadcasterId: null,
      externalSubscriptions: []
    })).toEqual([]);
  });

  it("admits only exact configured source/type pairs and can preserve both facets of one event", () => {
    const event = rewardEvent({
      ingestProvider: "streamerbot",
      metadata: { upstreamSource: "Twitch", upstreamType: "RewardRedemption" }
    });
    const envelope = streamerBotEnvelope("Twitch", "RewardRedemption", {
      id: "payload-event-id",
      summary: "Redeemed!",
      routeId: "do-not-trust",
      command: "shutdown",
      url: "https://example.invalid/file",
      assetId: "payload-selected-asset"
    });

    const triggers = createStreamerBotEffectTriggers(envelope, event, {
      providerId: "provider-streamerbot",
      twitchBroadcasterId: "verified-broadcaster",
      externalSubscriptions: [{ sourceKey: "Twitch", eventTypes: ["RewardRedemption"] }]
    });

    expect(triggers).toHaveLength(2);
    expect(triggers.map((trigger) => trigger.eventId)).toEqual(["event-1", "event-1"]);
    expect(triggers[1]).toEqual({
      kind: "streamerbot-event",
      eventId: "event-1",
      occurredAt: "2026-09-08T12:00:00.000Z",
      providerId: "provider-streamerbot",
      sourceKey: "Twitch",
      eventType: "RewardRedemption",
      summary: "Redeemed!"
    });
    expect(JSON.stringify(triggers)).not.toContain("do-not-trust");
    expect(JSON.stringify(triggers)).not.toContain("shutdown");
    expect(JSON.stringify(triggers)).not.toContain("example.invalid");
    expect(JSON.stringify(triggers)).not.toContain("payload-selected-asset");

    expect(createStreamerBotEffectTriggers(envelope, event, {
      providerId: "provider-streamerbot",
      twitchBroadcasterId: "verified-broadcaster",
      externalSubscriptions: [{ sourceKey: "twitch", eventTypes: ["RewardRedemption"] }]
    })).toHaveLength(1);
  });

  it("sanitizes and bounds human-readable summaries", () => {
    const summary = `Scene\u0000 changed ${"x".repeat(400)}`;
    const triggers = createStreamerBotEffectTriggers(
      streamerBotEnvelope("OBS", "SceneChanged", { eventId: "event-2", summary }),
      null,
      {
        providerId: "provider-streamerbot",
        twitchBroadcasterId: null,
        externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }]
      }
    );

    expect(triggers).toHaveLength(1);
    expect(triggers[0]?.summary).not.toContain("\u0000");
    expect(triggers[0]?.summary).toHaveLength(256);
  });

  it("rejects configured custom envelopes that lack a stable event identity", () => {
    expect(() => createStreamerBotEffectTriggers(
      streamerBotEnvelope("OBS", "SceneChanged", { sceneName: "Live" }),
      null,
      {
        providerId: "provider-streamerbot",
        twitchBroadcasterId: null,
        externalSubscriptions: [{ sourceKey: "OBS", eventTypes: ["SceneChanged"] }]
      }
    )).toThrow(MissingStreamerBotEventIdError);
  });
});

function rewardEvent(overrides: Partial<NormalizedStreamEvent> = {}): NormalizedStreamEvent {
  return {
    id: "event-1",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    type: "channel_point_redemption",
    occurredAt: "2026-09-08T12:00:00.000Z",
    actor: { id: "viewer-1", displayName: "Viewer" },
    message: null,
    amount: null,
    rewardId: "reward-1",
    rewardTitle: "Original reward",
    userInput: null,
    metadata: { twitchBroadcasterUserId: "broadcaster-1" },
    ...overrides
  } as NormalizedStreamEvent;
}

function streamerBotEnvelope(
  source: string,
  type: string,
  data: Record<string, unknown>
): StreamerBotEventEnvelope {
  return {
    timeStamp: "2026-09-08T12:00:00.000Z",
    event: { source, type },
    data
  };
}
