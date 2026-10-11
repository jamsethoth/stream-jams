import { describe, expect, it } from "vitest";
import type { NormalizedStreamEvent } from "../events/types.js";
import type { EffectTrigger } from "../screen-effects/types.js";
import { eventTriggerSelectorIdentity, eventTriggerSelectorSchema, matchSelector, type EventTriggerSelector } from "./selector.js";
import type { BusEvent } from "./types.js";

const raid: NormalizedStreamEvent = {
  id: "raid-1",
  providerId: "twitch",
  sourcePlatform: "twitch",
  ingestProvider: "twitch",
  occurredAt: "2026-10-08T12:00:00.000Z",
  actor: { id: "raider", displayName: "Raider" },
  message: null,
  metadata: {},
  type: "raid",
  amount: 25
};

function canonical(event: NormalizedStreamEvent, triggers: readonly EffectTrigger[] = []): BusEvent {
  return {
    kind: "canonical",
    sequence: 1,
    busId: "bus-1",
    eventId: event.id,
    sourceKind: event.ingestProvider,
    sourceRegistrationId: null,
    receivedAt: event.occurredAt,
    correlationKey: null,
    effectTriggers: triggers,
    event
  };
}

function external(trigger: EffectTrigger): BusEvent {
  return {
    kind: "external",
    sequence: 2,
    busId: "bus-2",
    eventId: trigger.eventId,
    sourceKind: "streamerbot",
    sourceRegistrationId: null,
    receivedAt: trigger.occurredAt,
    correlationKey: null,
    effectTriggers: [trigger]
  };
}

function selector(input: Partial<EventTriggerSelector> & Pick<EventTriggerSelector, "match">): EventTriggerSelector {
  return eventTriggerSelectorSchema.parse({ sources: "any", conditions: [], ...input });
}

const sceneChanged: EffectTrigger = {
  kind: "streamerbot-event",
  eventId: "external-1",
  occurredAt: "2026-10-08T12:00:00.000Z",
  providerId: "provider-bot",
  sourceKey: "OBS",
  eventType: "SceneChanged",
  summary: "C:\\media\\boom.mp4"
};

describe("matchSelector", () => {
  it("matches a canonical type with typed conditions from any source", () => {
    const bigRaid = selector({ match: { kind: "canonical", type: "raid" }, conditions: [{ field: "raidViewers", operator: "min", value: 10 }] });
    expect(matchSelector(bigRaid, canonical(raid))).toBe(true);
    expect(matchSelector(bigRaid, canonical({ ...raid, ingestProvider: "streamerbot" }))).toBe(true);
    expect(matchSelector(bigRaid, canonical({ ...raid, amount: 5 }))).toBe(false);
    expect(matchSelector(bigRaid, canonical({ ...raid, type: "cheer" }))).toBe(false);
    expect(matchSelector(bigRaid, external(sceneChanged))).toBe(false);
  });

  it("restricts matches to the selected source kinds", () => {
    const fromStreamerBot = selector({ match: { kind: "canonical", type: "raid" }, sources: ["streamerbot"] });
    expect(matchSelector(fromStreamerBot, canonical(raid))).toBe(false);
    expect(matchSelector(fromStreamerBot, canonical({ ...raid, ingestProvider: "streamerbot" }))).toBe(true);
  });

  it("matches rewards by broadcaster and reward ID, not by title", () => {
    const reward = selector({ match: { kind: "twitch-reward", broadcasterId: "100", rewardId: "reward-1" } });
    const trigger: EffectTrigger = {
      kind: "twitch-reward",
      eventId: "redemption-1",
      occurredAt: raid.occurredAt,
      broadcasterId: "100",
      rewardId: "reward-1",
      summary: "Renamed reward"
    };
    const redemption: NormalizedStreamEvent = { ...raid, id: "redemption-1", type: "channel_point_redemption", amount: null, rewardId: "reward-1", rewardTitle: "Renamed reward", userInput: null };
    expect(matchSelector(reward, canonical(redemption, [trigger]))).toBe(true);
    expect(matchSelector(reward, canonical(redemption, [{ ...trigger, broadcasterId: "200" }]))).toBe(false);
    expect(matchSelector(reward, canonical(redemption, [{ ...trigger, rewardId: "reward-2" }]))).toBe(false);
    expect(matchSelector(reward, canonical(redemption))).toBe(false);
  });

  it("matches external events by exact source and type and ignores payload content", () => {
    const scene = selector({ match: { kind: "external", providerKind: "streamerbot", sourceKey: "OBS", eventType: "SceneChanged" } });
    expect(matchSelector(scene, external(sceneChanged))).toBe(true);
    expect(matchSelector(scene, external({ ...sceneChanged, providerId: "another-registration" }))).toBe(true);
    expect(matchSelector(scene, external({ ...sceneChanged, sourceKey: "obs" }))).toBe(false);
    expect(matchSelector(scene, external({ ...sceneChanged, eventType: "scenechanged" }))).toBe(false);
    expect(matchSelector(scene, external({ ...sceneChanged, eventType: "RecordingStarted", summary: "OBS.SceneChanged" }))).toBe(false);
    expect(matchSelector(selector({ ...scene, sources: ["twitch"] }), external(sceneChanged))).toBe(false);
  });
});

describe("eventTriggerSelectorSchema", () => {
  it("rejects conditions on reward and external matches", () => {
    expect(eventTriggerSelectorSchema.safeParse({
      match: { kind: "external", providerKind: "streamerbot", sourceKey: "General", eventType: "Custom" },
      sources: "any",
      conditions: [{ field: "url", operator: "equals", value: "file:///etc/passwd" }]
    }).success).toBe(false);
  });

  it("rejects conditions the canonical type does not support", () => {
    expect(eventTriggerSelectorSchema.safeParse({
      match: { kind: "canonical", type: "follow" },
      sources: "any",
      conditions: [{ field: "raidViewers", operator: "min", value: 10 }]
    }).success).toBe(false);
  });

  it("rejects empty or repeated source lists", () => {
    const base = { match: { kind: "canonical", type: "follow" }, conditions: [] };
    expect(eventTriggerSelectorSchema.safeParse({ ...base, sources: [] }).success).toBe(false);
    expect(eventTriggerSelectorSchema.safeParse({ ...base, sources: ["twitch", "twitch"] }).success).toBe(false);
  });
});

describe("eventTriggerSelectorIdentity", () => {
  it("keeps pre-selector identities for unrestricted reward and external matches", () => {
    expect(eventTriggerSelectorIdentity(selector({ match: { kind: "twitch-reward", broadcasterId: "b", rewardId: "r" } })))
      .toBe('twitch-reward:["b","r"]');
    expect(eventTriggerSelectorIdentity(selector({ match: { kind: "external", providerKind: "streamerbot", sourceKey: "OBS", eventType: "SceneChanged" } })))
      .toBe('external:["streamerbot","OBS","SceneChanged"]');
  });

  it("distinguishes sources and conditions", () => {
    const follow = { match: { kind: "canonical" as const, type: "follow" as const } };
    expect(eventTriggerSelectorIdentity(selector(follow))).not.toBe(eventTriggerSelectorIdentity(selector({ ...follow, sources: ["twitch"] })));
  });
});
