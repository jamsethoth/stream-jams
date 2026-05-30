import {
  DefaultAlertMatcher,
  DefaultAlertResolver,
  DefaultPlaybackCooldownService,
  DefaultPlaybackDedupeService,
  DefaultPlaybackQueue,
  type AlertRule,
  type AlertService,
  type AlertVariant,
  type NormalizedStreamEvent
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { PlaybackCoordinator } from "./playback-coordinator.js";

describe("PlaybackCoordinator", () => {
  it("rejects duplicate events before listing active rules", async () => {
    const event = createCheerEvent({ id: "event-duplicate" });
    const dedupeService = new DefaultPlaybackDedupeService({
      clock: () => new Date("2026-05-30T12:00:00.000Z"),
      windowMs: 60_000
    });
    expect(dedupeService.accept(event)).toBe(true);
    const alertService = new RecordingAlertService([]);
    const coordinator = createCoordinator({
      alertService,
      dedupeService
    });

    const result = await coordinator.enqueueEvent(event);

    expect(result.status).toBe("duplicate");
    expect(alertService.listActiveRuleCalls).toBe(0);
    expect(result.snapshot.current).toBeNull();
  });

  it("does not resolve or enqueue cooldown-suppressed matches", async () => {
    const clock = new MutableClock("2026-05-30T12:00:00.000Z");
    const cooldownService = new DefaultPlaybackCooldownService({ clock: () => clock.now() });
    cooldownService.recordPlayback({
      ruleId: "rule-cheer",
      eventType: "cheer",
      cooldownSeconds: 30
    });
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([
        createRule({
          id: "rule-cheer",
          cooldownSeconds: 30,
          conditions: [{ field: "amount", operator: "min", value: 100 }]
        })
      ]),
      cooldownService,
      clock
    });

    const result = await coordinator.enqueueEvent(createCheerEvent({ amount: 500 }));

    expect(result.status).toBe("cooldown");
    expect(result.snapshot.current).toBeNull();
    expect(result.matchedRuleIds).toEqual(["rule-cheer"]);
    expect(result.enqueuedAlertIds).toEqual([]);
  });

  it("matches, resolves, and enqueues all ready alerts from one accepted event", async () => {
    const clock = new MutableClock("2026-05-30T12:00:00.000Z");
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([
        createRule({
          id: "rule-low",
          priority: 1,
          cooldownSeconds: 30,
          conditions: [{ field: "amount", operator: "min", value: 100 }],
          variants: [createVariant({ id: "variant-low", textTemplate: "Low {actor.displayName}" })]
        }),
        createRule({
          id: "rule-high",
          priority: 10,
          cooldownSeconds: 30,
          conditions: [{ field: "amount", operator: "min", value: 500 }],
          variants: [createVariant({ id: "variant-high", textTemplate: "High {actor.displayName}" })]
        })
      ]),
      clock
    });

    const result = await coordinator.enqueueEvent(createCheerEvent({ amount: 500 }));

    expect(result.status).toBe("queued");
    expect(result.matchedRuleIds).toEqual(["rule-high", "rule-low"]);
    expect(result.enqueuedAlertIds).toEqual(["resolved-alert-1", "resolved-alert-3"]);
    expect(result.snapshot.current).toMatchObject({
      priority: 10,
      sourceEvent: {
        id: "event-cheer"
      },
      alerts: [
        {
          ruleId: "rule-high",
          variantId: "variant-high",
          overlayInstruction: {
            text: {
              text: "High Viewer"
            }
          }
        },
        {
          ruleId: "rule-low",
          variantId: "variant-low",
          overlayInstruction: {
            text: {
              text: "Low Viewer"
            }
          }
        }
      ]
    });

    clock.set("2026-05-30T12:00:01.000Z");
    const repeatedCheer = await coordinator.enqueueEvent(createCheerEvent({ id: "event-next", amount: 500 }));

    expect(repeatedCheer.status).toBe("cooldown");
  });
});

function createCoordinator(
  options: {
    readonly alertService?: Pick<AlertService, "listActiveRules">;
    readonly cooldownService?: DefaultPlaybackCooldownService;
    readonly dedupeService?: DefaultPlaybackDedupeService;
    readonly clock?: MutableClock;
  } = {}
): PlaybackCoordinator {
  const clock = options.clock ?? new MutableClock("2026-05-30T12:00:00.000Z");
  let nextQueueId = 1;
  let nextResolvedId = 1;

  return new PlaybackCoordinator({
    alertService: options.alertService ?? new RecordingAlertService([]),
    matcher: new DefaultAlertMatcher(),
    resolver: new DefaultAlertResolver({
      generateId: (kind) => `${kind}-${nextResolvedId++}`,
      random: () => 0
    }),
    queue: new DefaultPlaybackQueue({
      clock: () => clock.now(),
      generateId: () => `queue-item-${nextQueueId++}`
    }),
    cooldownService: options.cooldownService ?? new DefaultPlaybackCooldownService({ clock: () => clock.now() }),
    dedupeService:
      options.dedupeService ??
      new DefaultPlaybackDedupeService({
        clock: () => clock.now(),
        windowMs: 60_000
      }),
    defaultTarget: {
      overlayId: "overlay-1",
      purpose: "live",
      scope: "module"
    }
  });
}

class RecordingAlertService implements Pick<AlertService, "listActiveRules"> {
  listActiveRuleCalls = 0;

  constructor(readonly rules: readonly AlertRule[]) {}

  async listActiveRules(): Promise<readonly AlertRule[]> {
    this.listActiveRuleCalls += 1;
    return this.rules;
  }
}

class MutableClock {
  #value: string;

  constructor(initialValue: string) {
    this.#value = initialValue;
  }

  set(value: string): void {
    this.#value = value;
  }

  now(): Date {
    return new Date(this.#value);
  }
}

function createCheerEvent(overrides: Partial<NormalizedStreamEvent> = {}): NormalizedStreamEvent {
  return {
    id: "event-cheer",
    providerId: "twitch",
    occurredAt: "2026-05-30T11:59:59.000Z",
    type: "cheer",
    actor: {
      id: "viewer-1",
      displayName: "Viewer"
    },
    message: null,
    amount: 100,
    metadata: {},
    ...overrides
  } as NormalizedStreamEvent;
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
