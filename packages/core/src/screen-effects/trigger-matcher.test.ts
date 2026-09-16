import { describe, expect, it } from "vitest";
import { effectTriggerSchema } from "./schemas.js";
import { matchesEffectBinding } from "./trigger-matcher.js";

describe("matchesEffectBinding", () => {
  it("matches broadcaster and reward IDs rather than a renamed display summary", () => {
    const binding = {
      id: "binding-reward",
      kind: "twitch-reward" as const,
      broadcasterId: "100",
      rewardId: "reward-1"
    };
    const trigger = effectTriggerSchema.parse({
      kind: "twitch-reward",
      eventId: "event-1",
      occurredAt: "2026-09-08T12:00:00.000Z",
      broadcasterId: "100",
      rewardId: "reward-1",
      summary: "Renamed reward"
    });
    expect(trigger.kind).toBe("twitch-reward");
    if (trigger.kind !== "twitch-reward") {
      throw new Error("Expected a Twitch reward trigger");
    }

    expect(matchesEffectBinding(binding, trigger)).toBe(true);
    expect(matchesEffectBinding(binding, { ...trigger, summary: "Another title" })).toBe(true);
    expect(matchesEffectBinding(binding, { ...trigger, broadcasterId: "200" })).toBe(false);
    expect(matchesEffectBinding(binding, { ...trigger, rewardId: "reward-2" })).toBe(false);
  });

  it("matches Streamer.bot provider, source, and event type exactly", () => {
    const binding = {
      id: "binding-streamerbot",
      kind: "streamerbot-event" as const,
      providerId: "provider-1",
      sourceKey: "OBS",
      eventType: "SceneChanged"
    };
    const trigger = effectTriggerSchema.parse({
      kind: "streamerbot-event",
      eventId: "event-2",
      occurredAt: "2026-09-08T12:00:00.000Z",
      providerId: "provider-1",
      sourceKey: "OBS",
      eventType: "SceneChanged",
      summary: "Scene changed"
    });
    expect(trigger.kind).toBe("streamerbot-event");
    if (trigger.kind !== "streamerbot-event") {
      throw new Error("Expected a Streamer.bot trigger");
    }

    expect(matchesEffectBinding(binding, trigger)).toBe(true);
    expect(matchesEffectBinding(binding, { ...trigger, providerId: "provider-2" })).toBe(false);
    expect(matchesEffectBinding(binding, { ...trigger, sourceKey: "obs" })).toBe(false);
    expect(matchesEffectBinding(binding, { ...trigger, eventType: "scenechanged" })).toBe(false);
  });

  it("does not match trigger kinds across binding types", () => {
    expect(matchesEffectBinding(
      { id: "binding", kind: "twitch-reward", broadcasterId: "100", rewardId: "reward-1" },
      effectTriggerSchema.parse({
        kind: "streamerbot-event",
        eventId: "event-2",
        occurredAt: "2026-09-08T12:00:00.000Z",
        providerId: "provider-1",
        sourceKey: "Twitch",
        eventType: "RewardRedemption",
        summary: "Reward"
      })
    )).toBe(false);
  });
});
