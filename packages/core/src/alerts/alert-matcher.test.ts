import type { CheerEvent } from "../events/types.js";
import type { AlertRule, AlertVariant } from "./types.js";
import { describe, expect, it } from "vitest";
import { DefaultAlertMatcher } from "./alert-matcher.js";

describe("DefaultAlertMatcher", () => {
  const matcher = new DefaultAlertMatcher();

  it("returns every active matching rule for one event in deterministic priority order", () => {
    const event = createCheerEvent({ amount: 750 });
    const matches = matcher.findMatches({
      event,
      rules: [
        createRule({ id: "medium-cheer", priority: 5, conditions: [{ field: "cheerAmount", operator: "min", value: 500 }] }),
        createRule({ id: "large-cheer-z", priority: 10, conditions: [{ field: "amount", operator: "range", value: [700, 900] }] }),
        createRule({ id: "large-cheer-a", priority: 10, conditions: [{ field: "amount", operator: "min", value: 700 }] })
      ]
    });

    expect(matches.map((match) => match.rule.id)).toEqual(["large-cheer-a", "large-cheer-z", "medium-cheer"]);
    expect(matches.every((match) => match.event === event)).toBe(true);
  });

  it("suppresses duplicate rule IDs from multiple active collection expansions", () => {
    const event = createCheerEvent({ amount: 300 });
    const duplicateRule = createRule({
      id: "shared-cheer",
      collectionIds: ["collection-a"],
      conditions: [{ field: "amount", operator: "min", value: 100 }]
    });

    const matches = matcher.findMatches({
      event,
      rules: [
        duplicateRule,
        {
          ...duplicateRule,
          collectionIds: ["collection-b"]
        }
      ]
    });

    expect(matches.map((match) => match.rule.id)).toEqual(["shared-cheer"]);
  });

  it("excludes disabled rules, mismatched event types, and rules whose conditions fail", () => {
    const event = createCheerEvent({ amount: 100 });
    const matches = matcher.findMatches({
      event,
      rules: [
        createRule({ id: "enabled-match", conditions: [{ field: "amount", operator: "min", value: 50 }] }),
        createRule({ id: "disabled", enabled: false }),
        createRule({ id: "wrong-type", eventType: "raid" }),
        createRule({ id: "condition-fails", conditions: [{ field: "amount", operator: "min", value: 500 }] })
      ]
    });

    expect(matches.map((match) => match.rule.id)).toEqual(["enabled-match"]);
  });
});

function createCheerEvent(overrides: Partial<CheerEvent> = {}): CheerEvent {
  return {
    id: "event-cheer",
    providerId: "twitch",
    occurredAt: "2026-05-30T09:00:00.000Z",
    type: "cheer",
    actor: {
      id: "viewer-1",
      displayName: "Viewer"
    },
    message: null,
    amount: 100,
    metadata: {},
    ...overrides
  };
}

function createRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule-1",
    name: "Cheer rule",
    eventType: "cheer",
    enabled: true,
    collectionIds: ["collection-1"],
    conditions: [],
    variants: [createVariant()],
    cooldownSeconds: 0,
    priority: 0,
    ...overrides
  };
}

function createVariant(overrides: Partial<AlertVariant> = {}): AlertVariant {
  return {
    id: "variant-1",
    name: "Default",
    enabled: true,
    weight: 1,
    visualAssetId: null,
    audioAssetId: null,
    textTemplate: "Thanks {actor.displayName}",
    ttsConfig: null,
    durationMs: 3000,
    layout: {
      x: 0,
      y: 0,
      width: 320,
      height: 180,
      zIndex: 1
    },
    ...overrides
  };
}
