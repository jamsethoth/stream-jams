import {
  DefaultAlertMatcher,
  DefaultAlertResolver,
  DefaultPlaybackCooldownService,
  DefaultPlaybackDedupeService,
  DefaultPlaybackQueue,
  type AlertResolverTarget,
  type AlertEditorDocument,
  type AlertRule,
  type AlertService,
  type AlertVariant,
  type AssetRepository,
  type NormalizedStreamEvent,
  type PlaybackQueue,
  type PlaybackQueueSnapshot,
  type ResolvedAlert
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import {
  PlaybackCoordinator,
  type OverlayPlaybackInstructionSink,
  type PlaybackCoordinatorDependencies
} from "./playback-coordinator.js";

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

  it("resolves visual media types from the asset repository", async () => {
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([
        createRule({
          id: "rule-gif",
          variants: [createVariant({ id: "variant-gif", visualAssetId: "asset-gif" })]
        })
      ]),
      assetRepository: new InMemoryAssetRepository({
        "asset-gif": "gif"
      })
    });

    const result = await coordinator.enqueueEvent(createCheerEvent({ amount: 500 }));

    expect(result.status).toBe("queued");
    expect(result.snapshot.current?.alerts[0]?.overlayInstruction.visual).toMatchObject({
      assetId: "asset-gif",
      mediaType: "gif"
    });
  });

  it("delivers each newly started current overlay instruction to the overlay sink once", async () => {
    const deliveredInstructionIds: string[] = [];
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([
        createRule({
          id: "rule-overlay",
          variants: [createVariant({ id: "variant-overlay" })]
        })
      ]),
      overlayPlaybackSink: {
        deliverPlaybackInstruction(instruction) {
          deliveredInstructionIds.push(instruction.id);
        }
      }
    });

    await coordinator.enqueueEvent(createCheerEvent({ amount: 500 }));
    coordinator.pause();
    coordinator.resume();

    expect(deliveredInstructionIds).toEqual(["overlay-instruction-2"]);
  });

  it("queues a resolved editor test through the normal queue and overlay sink", () => {
    const alertService = new RecordingAlertService([]);
    const deliveredInstructionIds: string[] = [];
    const coordinator = createCoordinator({
      alertService,
      overlayPlaybackSink: {
        deliverPlaybackInstruction(instruction) {
          deliveredInstructionIds.push(instruction.id);
        }
      }
    });
    const event = createCheerEvent({ id: "editor-test", metadata: { test: true } });
    const alert: ResolvedAlert = {
      id: "resolved-editor-test",
      sourceEventId: event.id,
      ruleId: "rule-editor",
      variantId: "layer-text",
      overlayInstruction: {
        id: "instruction-editor-test",
        overlayId: "overlay-1",
        moduleId: "alerts",
        purpose: "live",
        scope: "module",
        targetProfileId: "landscape",
        visual: null,
        audio: null,
        text: { text: "Test", layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } },
        tts: null,
        durationMs: 3_000
      }
    };

    const snapshot = coordinator.enqueueResolvedTest({ sourceEvent: event, alerts: [alert] });

    expect(snapshot.current?.alerts).toEqual([alert]);
    expect(deliveredInstructionIds).toEqual(["instruction-editor-test"]);
    expect(alertService.listActiveRuleCalls).toBe(0);
  });

  it("advances only after every delivered client finishes every current instruction", () => {
    const coordinator = createCoordinator({
      overlayPlaybackSink: {
        deliverPlaybackInstruction() {
          return { deliveredClientIds: ["client-1", "client-2"] };
        }
      }
    });
    const event = createCheerEvent({ id: "multi-layer" });
    const firstAlert = createResolvedAlert(event.id, "resolved-1", "instruction-1");
    const secondAlert = createResolvedAlert(event.id, "resolved-2", "instruction-2");
    const nextEvent = createCheerEvent({ id: "next-item" });
    const nextAlert = createResolvedAlert(nextEvent.id, "resolved-3", "instruction-3");

    coordinator.enqueueResolvedTest({ sourceEvent: event, alerts: [firstAlert, secondAlert] });
    coordinator.enqueueResolvedTest({ sourceEvent: nextEvent, alerts: [nextAlert] });

    expect(coordinator.reportInstructionFinished("client-1", "instruction-1").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("client-1", "instruction-1").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("client-1", "stale-instruction").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("unknown-client", "instruction-2").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("client-2", "instruction-1").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("client-1", "instruction-2").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("client-2", "instruction-2").current?.id).toBe("queue-item-2");
    expect(coordinator.reportInstructionFinished("client-2", "instruction-2").current?.id).toBe("queue-item-2");
    expect(coordinator.reportInstructionFinished("client-1", "instruction-3").current?.id).toBe("queue-item-2");
    expect(coordinator.reportInstructionFinished("client-2", "instruction-3").current).toBeNull();
  });

  it("releases every pending instruction when a delivered client disconnects", () => {
    const coordinator = createCoordinator({
      overlayPlaybackSink: {
        deliverPlaybackInstruction() {
          return { deliveredClientIds: ["client-1", "client-2"] };
        }
      }
    });
    const event = createCheerEvent({ id: "disconnect-mid-playback" });
    coordinator.enqueueResolvedTest({
      sourceEvent: event,
      alerts: [
        createResolvedAlert(event.id, "resolved-1", "instruction-1"),
        createResolvedAlert(event.id, "resolved-2", "instruction-2")
      ]
    });

    coordinator.reportInstructionFinished("client-1", "instruction-1");
    coordinator.reportInstructionFinished("client-1", "instruction-2");

    expect(coordinator.reportClientDisconnected("unknown-client").current).not.toBeNull();
    expect(coordinator.reportClientDisconnected("client-2").current).toBeNull();
  });

  it("immediately completes an item delivered to zero clients", () => {
    const coordinator = createCoordinator({
      overlayPlaybackSink: {
        deliverPlaybackInstruction() {
          return { deliveredClientIds: [] };
        }
      }
    });
    const event = createCheerEvent({ id: "no-recipients" });

    const snapshot = coordinator.enqueueResolvedTest({
      sourceEvent: event,
      alerts: [createResolvedAlert(event.id, "resolved-1", "instruction-1")]
    });

    expect(snapshot.current).toBeNull();
    expect(snapshot.recent[0]).toMatchObject({ id: "queue-item-1", status: "completed" });
  });

  it("drains a long zero-recipient queue without stack growth", () => {
    const itemCount = 10_000;
    let deliveryCount = 0;
    const coordinator = createCoordinator({
      queue: createSequentialPlaybackQueue(itemCount),
      overlayPlaybackSink: {
        deliverPlaybackInstruction() {
          deliveryCount += 1;
          return { deliveredClientIds: [] };
        }
      }
    });

    expect(coordinator.resume().current).toBeNull();
    expect(deliveryCount).toBe(itemCount);
  });

  it("resolves configured additional overlay targets into the same playback item", async () => {
    const deliveredScopes: string[] = [];
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([
        createRule({
          id: "rule-overlay",
          variants: [createVariant({ id: "variant-overlay" })]
        })
      ]),
      additionalTargets: [
        {
          overlayId: "overlay-1",
          purpose: "live",
          scope: "unified"
        }
      ],
      overlayPlaybackSink: {
        deliverPlaybackInstruction(instruction) {
          deliveredScopes.push(instruction.scope);
        }
      }
    });

    const result = await coordinator.enqueueEvent(createCheerEvent({ amount: 500 }));

    expect(result.status).toBe("queued");
    expect(result.enqueuedAlertIds).toEqual(["resolved-alert-1", "resolved-alert-3"]);
    expect(result.snapshot.current?.alerts.map((alert) => alert.overlayInstruction.scope)).toEqual([
      "module",
      "unified"
    ]);
    expect(deliveredScopes).toEqual(["module", "unified"]);
  });

  it("loads editor documents for profile targets and skips disabled profiles", async () => {
    const rule = createRule({ id: "rule-editor-live" });
    const document = createEditorDocument(rule);
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([rule]),
      additionalTargets: [
        { overlayId: "overlay-1", purpose: "live", scope: "module", targetProfileId: "landscape" },
        { overlayId: "overlay-1", purpose: "live", scope: "module", targetProfileId: "vertical" }
      ],
      findEditorDocument: async (ruleId) => ruleId === rule.id ? document : null
    });

    const result = await coordinator.enqueueEvent(createCheerEvent());

    expect(result.snapshot.current?.alerts.map((alert) => ({
      variantId: alert.variantId,
      targetProfileId: alert.overlayInstruction.targetProfileId,
      text: alert.overlayInstruction.text?.text,
      layout: alert.overlayInstruction.text?.layout
    }))).toEqual([
      expect.objectContaining({ variantId: "variant-1", targetProfileId: undefined }),
      {
        variantId: "variant-1",
        targetProfileId: "landscape",
        text: "Primary Viewer",
        layout: { layerId: "layer-primary", x: 100, y: 120, width: 500, height: 100, zIndex: 2 }
      },
      {
        variantId: "variant-1",
        targetProfileId: "landscape",
        text: "Secondary Viewer",
        layout: { layerId: "layer-secondary", x: 300, y: 400, width: 600, height: 120, zIndex: 3 }
      }
    ]);
  });

  it("loads variation editor documents for live profile playback", async () => {
    const baseRule = createRule({ id: "rule-variation-live" });
    const rule: AlertRule = {
      ...baseRule,
      variants: [
        { ...baseRule.variants[0]!, enabled: false },
        createVariant({ id: "variant-special", name: "Special", enabled: true, textTemplate: "Legacy special" })
      ]
    };
    const document: AlertEditorDocument = {
      ...createEditorDocument(rule),
      id: "variant-special",
      kind: "variation",
      parentAlertId: rule.id,
      name: "Special",
      layers: createEditorDocument(rule).layers.map((layer) =>
        layer.type === "text" ? { ...layer, template: "Saved variation {actor.displayName}" } : layer
      )
    };
    const requestedEditorIds: string[] = [];
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([rule]),
      additionalTargets: [
        { overlayId: "overlay-1", purpose: "live", scope: "module", targetProfileId: "landscape" }
      ],
      findEditorDocument: async (editorId) => {
        requestedEditorIds.push(editorId);
        return editorId === document.id ? document : null;
      }
    });

    const result = await coordinator.enqueueEvent(createCheerEvent());

    expect(requestedEditorIds).toContain("variant-special");
    expect(result.snapshot.current?.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        overlayInstruction: expect.objectContaining({ text: expect.objectContaining({ text: "Saved variation Viewer" }) })
      })
    ]));
  });

  it("selects one weighted variation for every target of the same event", async () => {
    const baseRule = createRule({ id: "rule-weighted" });
    const rule: AlertRule = {
      ...baseRule,
      variants: [
        createVariant({ id: "variant-a", name: "A", weight: 1 }),
        createVariant({ id: "variant-b", name: "B", weight: 1 })
      ]
    };
    const randomValues = [0.1, 0.9];
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([rule]),
      additionalTargets: [
        { overlayId: "overlay-1", purpose: "live", scope: "module", targetProfileId: "landscape" }
      ],
      random: () => randomValues.shift() ?? 0.9
    });

    const result = await coordinator.enqueueEvent(createCheerEvent());

    expect(result.snapshot.current?.alerts.map((alert) => alert.variantId)).toEqual(["variant-a", "variant-a"]);
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
    readonly assetRepository?: Pick<AssetRepository, "findById">;
    readonly additionalTargets?: readonly AlertResolverTarget[];
    readonly queue?: PlaybackQueue;
    readonly overlayPlaybackSink?: OverlayPlaybackInstructionSink;
    readonly findEditorDocument?: (alertId: string) => Promise<AlertEditorDocument | null>;
    readonly clock?: MutableClock;
    readonly random?: () => number;
  } = {}
): PlaybackCoordinator {
  const clock = options.clock ?? new MutableClock("2026-05-30T12:00:00.000Z");
  let nextQueueId = 1;
  let nextResolvedId = 1;

  const dependencies: PlaybackCoordinatorDependencies = {
    alertService: options.alertService ?? new RecordingAlertService([]),
    matcher: new DefaultAlertMatcher(),
    resolver: new DefaultAlertResolver({
      generateId: (kind) => `${kind}-${nextResolvedId++}`,
      random: options.random ?? (() => 0)
    }),
    queue: options.queue ?? new DefaultPlaybackQueue({
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
    },
    ...(options.additionalTargets === undefined ? {} : { additionalTargets: options.additionalTargets }),
    ...(options.assetRepository === undefined ? {} : { assetRepository: options.assetRepository }),
    ...(options.overlayPlaybackSink === undefined ? {} : { overlayPlaybackSink: options.overlayPlaybackSink }),
    ...(options.findEditorDocument === undefined ? {} : { findEditorDocument: options.findEditorDocument })
  };
  return new PlaybackCoordinator(dependencies);
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
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
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

class InMemoryAssetRepository implements Pick<AssetRepository, "findById"> {
  constructor(readonly mediaTypes: Readonly<Record<string, "image" | "gif" | "video" | "audio">>) {}

  async findById(assetId: string) {
    const mediaType = this.mediaTypes[assetId];
    return mediaType === undefined
      ? null
      : {
          id: assetId,
          originalFileName: assetId + ".bin",
          mediaType,
          mimeType: "application/octet-stream",
          sizeBytes: 1,
          checksum: "sha256:test",
          storagePath: "/assets/" + assetId
        };
  }
}

function createResolvedAlert(sourceEventId: string, id: string, instructionId: string): ResolvedAlert {
  return {
    id,
    sourceEventId,
    ruleId: "rule-editor",
    variantId: id,
    overlayInstruction: {
      id: instructionId,
      overlayId: "overlay-1",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      visual: null,
      audio: null,
      text: { text: id, layout: { x: 0, y: 0, width: 320, height: 180, zIndex: 1 } },
      tts: null,
      durationMs: 3_000
    }
  };
}

function createSequentialPlaybackQueue(itemCount: number): PlaybackQueue {
  const event = createCheerEvent({ id: "zero-recipient-queue" });
  let index = 0;
  const getSnapshot = (): PlaybackQueueSnapshot => ({
    current: index < itemCount
      ? {
          id: `queue-item-${index}`,
          sourceEvent: event,
          alerts: [createResolvedAlert(event.id, `resolved-${index}`, `instruction-${index}`)],
          priority: 0,
          status: "playing",
          enqueuedAt: "2026-05-30T12:00:00.000Z",
          startedAt: "2026-05-30T12:00:00.000Z",
          completedAt: null
        }
      : null,
    queued: [],
    recent: [],
    paused: false,
    muted: false,
    doNotDisturb: false
  });
  const advance = (): PlaybackQueueSnapshot => {
    index += 1;
    return getSnapshot();
  };

  return {
    getSnapshot,
    enqueue: getSnapshot,
    completeCurrent: advance,
    skipCurrent: advance,
    replayRecent: getSnapshot,
    pause: getSnapshot,
    resume: getSnapshot,
    mute: getSnapshot,
    unmute: getSnapshot,
    setDoNotDisturb: getSnapshot
  };
}

function createEditorDocument(rule: AlertRule): AlertEditorDocument {
  return {
    id: rule.id,
    setId: rule.collectionIds[0]!,
    providerKind: "twitch",
    eventType: rule.eventType,
    kind: "default",
    parentAlertId: null,
    name: rule.name,
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: rule.cooldownSeconds,
    rulePriority: rule.priority,
    durationMs: 3_000,
    layers: [
      { id: "layer-primary", name: "Primary", type: "text", visible: true, order: 0, animation, template: "Primary {actor.displayName}" },
      { id: "layer-secondary", name: "Secondary", type: "text", visible: true, order: 1, animation, template: "Secondary {actor.displayName}" }
    ],
    targetProfiles: [
      {
        id: "landscape",
        enabled: true,
        reviewState: "ready",
        layerLayouts: [
          { layerId: "layer-primary", x: 100, y: 120, width: 500, height: 100, zIndex: 2 },
          { layerId: "layer-secondary", x: 300, y: 400, width: 600, height: 120, zIndex: 3 }
        ]
      },
      { id: "vertical", enabled: false, reviewState: "needs-review", layerLayouts: [] }
    ],
    samplePayloads: [{ id: "normal", label: "Normal", kind: "built-in", payload: {} }]
  };
}

const animation = {
  mode: "preset" as const,
  entrance: "fade",
  exit: "fade",
  durationMs: 300,
  delayMs: 0,
  easing: "ease-out"
};
