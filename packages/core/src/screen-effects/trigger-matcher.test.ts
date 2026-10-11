import { describe, expect, it } from "vitest";
import type { BusEvent } from "../event-bus/types.js";
import type { NormalizedStreamEvent } from "../events/types.js";
import { matchEffectBinding } from "./trigger-matcher.js";
import type { EffectBinding, EffectTrigger } from "./types.js";

const rewardTrigger: EffectTrigger = {
  kind: "twitch-reward",
  eventId: "event-1",
  occurredAt: "2026-09-08T12:00:00.000Z",
  broadcasterId: "100",
  rewardId: "reward-1",
  summary: "Renamed reward"
};

function busEvent(triggers: readonly EffectTrigger[], event?: NormalizedStreamEvent): BusEvent {
  const base = {
    sequence: 1,
    busId: "bus-1",
    eventId: event?.id ?? triggers[0]!.eventId,
    sourceKind: "twitch" as const,
    sourceRegistrationId: null,
    receivedAt: "2026-09-08T12:00:00.000Z",
    correlationKey: null,
    effectTriggers: triggers
  };
  return event === undefined ? { ...base, kind: "external" } : { ...base, kind: "canonical", event };
}

function binding(selector: EffectBinding["selector"]): EffectBinding {
  return { id: "binding", selector };
}

describe("matchEffectBinding", () => {
  it("records the matching reward trigger regardless of its display summary", () => {
    const reward = binding({ match: { kind: "twitch-reward", broadcasterId: "100", rewardId: "reward-1" }, sources: "any", conditions: [] });
    expect(matchEffectBinding(reward, busEvent([rewardTrigger]))).toEqual(rewardTrigger);
    expect(matchEffectBinding(reward, busEvent([{ ...rewardTrigger, summary: "Another title" }]))?.summary).toBe("Another title");
    expect(matchEffectBinding(reward, busEvent([{ ...rewardTrigger, rewardId: "reward-2" }]))).toBeNull();
  });

  it("records the external trigger for an exact Streamer.bot identity", () => {
    const trigger: EffectTrigger = { kind: "streamerbot-event", eventId: "event-2", occurredAt: rewardTrigger.occurredAt, providerId: "provider-1", sourceKey: "OBS", eventType: "SceneChanged", summary: "Scene changed" };
    const scene = binding({ match: { kind: "external", providerKind: "streamerbot", sourceKey: "OBS", eventType: "SceneChanged" }, sources: "any", conditions: [] });
    expect(matchEffectBinding(scene, busEvent([rewardTrigger, trigger]))).toEqual(trigger);
    expect(matchEffectBinding(scene, busEvent([rewardTrigger]))).toBeNull();
  });

  it("builds a canonical trigger with a bounded viewer summary", () => {
    const raid: NormalizedStreamEvent = {
      id: "raid-1",
      providerId: "twitch",
      sourcePlatform: "twitch",
      ingestProvider: "twitch",
      occurredAt: "2026-09-08T12:00:00.000Z",
      actor: { id: "raider", displayName: "Raider\u0007" },
      message: null,
      metadata: {},
      type: "raid",
      amount: 25
    };
    const bigRaid = binding({ match: { kind: "canonical", type: "raid" }, sources: "any", conditions: [{ field: "raidViewers", operator: "min", value: 10 }] });
    expect(matchEffectBinding(bigRaid, busEvent([], raid))).toEqual({
      kind: "canonical-event",
      eventId: "raid-1",
      occurredAt: raid.occurredAt,
      eventType: "raid",
      summary: "Raid from Raider"
    });
    expect(matchEffectBinding(bigRaid, busEvent([], { ...raid, amount: 3 }))).toBeNull();
  });
});
