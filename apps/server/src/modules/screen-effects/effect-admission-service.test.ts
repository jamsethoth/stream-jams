import {
  DefaultEffectQueue,
  DefaultPlaybackCooldownService,
  DefaultPlaybackDedupeService,
  createScreenEffectDocument,
  screenEffectDocumentSchema,
  type BusEvent,
  type EffectContentSnapshot,
  type EffectTrigger,
  type ScreenEffectDocument
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { canonicalBusEvent } from "../../test-support/bus-event-fixtures.js";
import { EffectAdmissionService } from "./effect-admission-service.js";

function trigger(eventId: string): EffectTrigger {
  return {
    kind: "twitch-reward",
    eventId,
    occurredAt: "2026-09-13T12:00:00.000Z",
    broadcasterId: "broadcaster-1",
    rewardId: "reward-1",
    summary: "Neutral reward"
  };
}

function rewardEvent(eventId: string): BusEvent {
  return canonicalBusEvent({
    id: eventId,
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    occurredAt: "2026-09-13T12:00:00.000Z",
    actor: { id: "viewer", displayName: "Viewer" },
    message: null,
    metadata: {},
    type: "channel_point_redemption",
    amount: null,
    rewardId: "reward-1",
    rewardTitle: "Neutral reward",
    userInput: null
  }, [trigger(eventId)]);
}

function effect(
  id: string,
  options: {
    readonly priority?: number;
    readonly hasOutput?: boolean;
    readonly selector?: ScreenEffectDocument["bindings"][number]["selector"];
  } = {}
): ScreenEffectDocument {
  const draft = createScreenEffectDocument({ id, name: `Effect ${id}`, defaultVariantId: `variant-${id}` });
  return screenEffectDocumentSchema.parse({
    ...draft,
    enabled: true,
    priority: options.priority ?? 0,
    bindings: [{
      id: `binding-${id}`,
      selector: options.selector ?? { match: { kind: "twitch-reward", broadcasterId: "broadcaster-1", rewardId: "reward-1" }, sources: "any", conditions: [] }
    }],
    variants: [{
      ...draft.variants[0]!,
      sound: { assetId: "tone", volume: 0.5 },
      outputs: {
        browserSource: false,
        deviceRouteIds: options.hasOutput === false ? [] : ["headphones"]
      }
    }]
  });
}

function service(options: {
  readonly documents: () => readonly ScreenEffectDocument[];
  readonly queue?: DefaultEffectQueue;
  readonly moduleCooldownSeconds?: () => number;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly validateReferences?: (content: EffectContentSnapshot) => Promise<boolean>;
  readonly validateOutputAvailability?: (content: EffectContentSnapshot) => Promise<boolean>;
  readonly isModuleEnabled?: () => Promise<boolean>;
  readonly isEffectLive?: (id: string) => boolean;
  readonly assetDurationCatalog?: ConstructorParameters<typeof EffectAdmissionService>[0]["assetDurationCatalog"];
}) {
  let nextId = 0;
  return new EffectAdmissionService({
    repository: {
      list: async () => options.documents(),
      find: async (id) => options.documents().find((document) => document.id === id) ?? null,
    },
    queue: options.queue ?? new DefaultEffectQueue(),
    dedupe: new DefaultPlaybackDedupeService(),
    cooldowns: new DefaultPlaybackCooldownService({
      clock: () => new Date(options.now?.() ?? 1_000)
    }),
    getModuleCooldownSeconds: async () => options.moduleCooldownSeconds?.() ?? 0,
    generateOccurrenceId: () => `occurrence-${nextId++}`,
    random: options.random ?? (() => 0),
    now: options.now ?? (() => 1_000),
    validateReferences: options.validateReferences ?? (async () => true),
    validateOutputAvailability: options.validateOutputAvailability ?? (async () => true),
    isModuleEnabled: options.isModuleEnabled ?? (async () => true),
    isEffectLive: options.isEffectLive ?? (() => true),
    ...(options.assetDurationCatalog === undefined ? {} : { assetDurationCatalog: options.assetDurationCatalog })
  });
}

describe("EffectAdmissionService", () => {
  it("excludes a previous set when activation changes during asynchronous admission", async () => {
    let active = "one";
    const queue = new DefaultEffectQueue();
    const admission = service({ documents: () => [effect(active)], queue,
      isEffectLive: (id) => id === active,
      validateReferences: async () => { active = "two"; return true; }
    });
    await admission.handleEvent(rewardEvent("before-switch"));
    expect(queue.snapshot().queued).toHaveLength(0);
    await admission.handleEvent(rewardEvent("after-switch"));
    expect(queue.snapshot().queued.map((item) => item.content.effectId)).toEqual(["two"]);
    active = "one";
    expect(queue.snapshot().queued[0]!.content.effectId).toBe("two");
  });

  it("reserves a module-scoped event before async work so concurrent redelivery admits once", async () => {
    const queue = new DefaultEffectQueue();
    const admission = service({ documents: () => [effect("one")], queue });

    const results = await Promise.all([
      admission.handleEvent(rewardEvent("event-1")),
      admission.handleEvent(rewardEvent("event-1"))
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["duplicate", "processed"]);
    expect(queue.snapshot().queued).toHaveLength(1);
  });

  it("admits distinct matching effects once in priority-descending, stable-ID order", async () => {
    const queue = new DefaultEffectQueue();
    const admission = service({
      documents: () => [effect("z-low"), effect("z-high", { priority: 5 }), effect("a-high", { priority: 5 })],
      queue
    });

    const result = await admission.handleEvent(rewardEvent("event-order"));

    expect(result).toMatchObject({
      status: "processed",
      outcomes: [
        { effectId: "a-high", status: "queued" },
        { effectId: "z-high", status: "queued" },
        { effectId: "z-low", status: "queued" }
      ]
    });
    expect(queue.snapshot().queued.map((item) => item.content.effectId)).toEqual(["a-high", "z-high", "z-low"]);
  });

  it("enforces exactly 100 pending items and admits later work after capacity returns", async () => {
    const queue = new DefaultEffectQueue();
    const fillAdmission = service({ documents: () => [effect("fill")], queue });
    for (let index = 0; index < 100; index += 1) {
      await fillAdmission.handleEvent(rewardEvent(`fill-${index}`));
    }
    expect(queue.snapshot().queued).toHaveLength(100);

    const blockedAdmission = service({
      documents: () => [effect("blocked")],
      queue
    });
    await expect(blockedAdmission.handleEvent(rewardEvent("overflow"))).resolves.toMatchObject({
      outcomes: [{ effectId: "blocked", status: "full" }]
    });
    expect(queue.snapshot().queued).toHaveLength(100);
    expect(queue.snapshot().queued.some((item) => item.content.effectId === "blocked")).toBe(false);

    queue.clearPending();
    await expect(blockedAdmission.handleEvent(rewardEvent("after-overflow"))).resolves.toMatchObject({
      outcomes: [{ effectId: "blocked", status: "queued" }]
    });
  });

  it("admits the same effect for distinct events without a per-effect cooldown", async () => {
    const queue = new DefaultEffectQueue();
    const admission = service({ documents: () => [effect("repeated")], queue });

    await admission.handleEvent(rewardEvent("event-first"));
    await admission.handleEvent(rewardEvent("event-second"));

    expect(queue.snapshot().queued.map((item) => item.content.effectId)).toEqual(["repeated", "repeated"]);
  });

  it("checks module cooldown once so one event can intentionally admit multiple effects", async () => {
    const admission = service({
      documents: () => [effect("second"), effect("first", { priority: 1 })],
      moduleCooldownSeconds: () => 60
    });

    await expect(admission.handleEvent(rewardEvent("first-event"))).resolves.toMatchObject({
      outcomes: [
        { effectId: "first", status: "queued" },
        { effectId: "second", status: "queued" }
      ]
    });
    await expect(admission.handleEvent(rewardEvent("second-event"))).resolves.toMatchObject({
      outcomes: [
        { effectId: "first", status: "cooldown" },
        { effectId: "second", status: "cooldown" }
      ]
    });
  });

  it("rejects a selected variant with no destination and accepts it after an output is added", async () => {
    let document = effect("output", { hasOutput: false });
    const admission = service({ documents: () => [document] });

    await expect(admission.handleEvent(rewardEvent("no-output"))).resolves.toMatchObject({
      outcomes: [{ effectId: "output", status: "no-output" }]
    });
    document = effect("output");
    await expect(admission.handleEvent(rewardEvent("with-output"))).resolves.toMatchObject({
      outcomes: [{ effectId: "output", status: "queued" }]
    });
  });

  it("does not reserve dedupe or enqueue work while the module is disabled", async () => {
    const queue = new DefaultEffectQueue();
    let enabled = false;
    const admission = service({
      documents: () => [effect("gated")],
      queue,
      isModuleEnabled: async () => enabled
    });

    await expect(admission.handleEvent(rewardEvent("gated-event"))).resolves.toEqual({
      status: "module-disabled",
      eventId: "gated-event",
      outcomes: []
    });
    await expect(admission.testEffectVariant("gated", "variant-gated")).resolves.toMatchObject({
      effectId: "gated",
      status: "module-disabled"
    });
    enabled = true;
    await expect(admission.handleEvent(rewardEvent("gated-event"))).resolves.toMatchObject({
      status: "processed",
      outcomes: [{ effectId: "gated", status: "queued" }]
    });
    expect(queue.snapshot().queued).toHaveLength(1);
  });

  it("fails closed when references or every selected output are unavailable", async () => {
    const missing = service({
      documents: () => [effect("missing")],
      validateReferences: async () => false
    });
    await expect(missing.handleEvent(rewardEvent("missing-event"))).resolves.toMatchObject({
      outcomes: [{ effectId: "missing", status: "missing-reference" }]
    });

    const unavailable = service({
      documents: () => [effect("unavailable")],
      validateOutputAvailability: async () => false
    });
    await expect(unavailable.testEffectVariant("unavailable", "variant-unavailable")).resolves.toMatchObject({
      effectId: "unavailable",
      status: "unavailable-output"
    });
  });

  it("admits canonical selectors with conditions and records a canonical trigger", async () => {
    const queue = new DefaultEffectQueue();
    const raidSelector = { match: { kind: "canonical" as const, type: "raid" as const }, sources: "any" as const, conditions: [{ field: "raidViewers", operator: "min" as const, value: 10 }] };
    const admission = service({ documents: () => [effect("raid", { selector: raidSelector })], queue });
    const raid = (id: string, amount: number) => canonicalBusEvent({
      id, providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "streamerbot", occurredAt: "2026-09-13T12:00:00.000Z",
      actor: { id: "raider", displayName: "Raider" }, message: null, metadata: {}, type: "raid", amount
    });

    await expect(admission.handleEvent(raid("small-raid", 3))).resolves.toMatchObject({ status: "no-matches" });
    await expect(admission.handleEvent(raid("big-raid", 25))).resolves.toMatchObject({ status: "processed", outcomes: [{ effectId: "raid", status: "queued" }] });
    expect(queue.snapshot().queued[0]!.trigger).toEqual({
      kind: "canonical-event", eventId: "big-raid", occurredAt: "2026-09-13T12:00:00.000Z", eventType: "raid", summary: "Raid from Raider"
    });
  });

  it("snapshots selected content so later definition edits cannot retarget queued work", async () => {
    const queue = new DefaultEffectQueue();
    let document = effect("snapshot");
    const admission = service({ documents: () => [document], queue });

    await admission.handleEvent(rewardEvent("snapshot-event"));
    document = screenEffectDocumentSchema.parse({
      ...document,
      name: "Edited later",
      variants: [{
        ...document.variants[0]!,
        sound: { assetId: "replacement-tone", volume: 1 },
        outputs: { browserSource: true, deviceRouteIds: [] }
      }]
    });

    expect(queue.snapshot().queued[0]?.content).toMatchObject({
      effectName: "Effect snapshot",
      variant: {
        sound: { assetId: "tone", volume: 0.5 },
        outputs: { browserSource: false, deviceRouteIds: ["headphones"] }
      }
    });
  });

  it("replays the exact recent snapshot under a new occurrence ID without rerolling", async () => {
    const queue = new DefaultEffectQueue();
    let randomCalls = 0;
    const admission = service({
      documents: () => [effect("replay")],
      queue,
      random: () => {
        randomCalls += 1;
        return 0;
      }
    });
    const admitted = await admission.handleEvent(rewardEvent("replay-event"));
    const originalId = admitted.outcomes[0]!.occurrenceId!;
    queue.advance({ paused: false, muted: false, doNotDisturb: false });
    queue.complete(originalId, "completed", 2_000);

    await expect(admission.replayRecent(originalId)).resolves.toMatchObject({
      effectId: "replay",
      status: "queued",
      occurrenceId: "occurrence-1"
    });
    expect(randomCalls).toBe(1);
    const replay = queue.snapshot().queued[0]!;
    expect(replay.id).not.toBe(originalId);
    expect(replay.content).toEqual(queue.snapshot().recent[0]!.content);
    expect(replay.trigger).toEqual(queue.snapshot().recent[0]!.trigger);
  });

  it("rejects expired and missing-reference replay without mutating pending work", async () => {
    const queue = new DefaultEffectQueue();
    let referencesAvailable = true;
    const admission = service({
      documents: () => [effect("replay")],
      queue,
      validateReferences: async () => referencesAvailable
    });

    await expect(admission.replayRecent("expired")).rejects.toThrow("not retained");
    const admitted = await admission.handleEvent(rewardEvent("replay-missing"));
    const originalId = admitted.outcomes[0]!.occurrenceId!;
    queue.advance({ paused: false, muted: false, doNotDisturb: false });
    queue.complete(originalId, "completed", 2_000);
    referencesAvailable = false;

    await expect(admission.replayRecent(originalId)).resolves.toMatchObject({
      effectId: "replay",
      status: "missing-reference"
    });
    expect(queue.snapshot().queued).toEqual([]);
  });

  it("supports explicit tests of valid disabled effects through a separate entry point", async () => {
    const queue = new DefaultEffectQueue();
    const disabled = { ...effect("test"), enabled: false };
    const admission = service({ documents: () => [disabled], queue });

    await expect(admission.testEffect("test")).resolves.toMatchObject({
      effectId: "test",
      status: "queued"
    });
    expect(queue.snapshot().queued[0]).toMatchObject({ trigger: null, content: { effectId: "test" } });
  });

  it("snapshots the longest stored media duration and per-source lengths before admission", async () => {
    const queue = new DefaultEffectQueue();
    const document = effect("timed");
    const variant = document.variants[0]!;
    const timed: ScreenEffectDocument = {
      ...document,
      variants: [{
        ...variant,
        durationMode: "media",
        durationMs: 10_000,
        visual: { mediaType: "video", assetId: "clip", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 }, playEmbeddedAudio: true, audioVolume: 1 }
      }]
    };
    const records = new Map([
      ["clip", { id: "clip", originalFileName: "clip.webm", mediaType: "video" as const, mimeType: "video/webm", sizeBytes: 1, checksum: "clip", storagePath: "clip.webm", durationMs: 8_000 }],
      ["tone", { id: "tone", originalFileName: "tone.wav", mediaType: "audio" as const, mimeType: "audio/wav", sizeBytes: 1, checksum: "tone", storagePath: "tone.wav", durationMs: 12_000 }]
    ]);
    const admission = service({ documents: () => [timed], queue, assetDurationCatalog: { getMany: async () => records } });

    await admission.testEffect("timed");

    expect(queue.snapshot().queued[0]?.content).toMatchObject({
      variant: { durationMs: 12_000 },
      assetDurations: { clip: 8_000, tone: 12_000 }
    });
  });
});
