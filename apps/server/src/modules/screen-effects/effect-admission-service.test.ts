import {
  DefaultEffectQueue,
  DefaultPlaybackCooldownService,
  DefaultPlaybackDedupeService,
  createScreenEffectDocument,
  screenEffectDocumentSchema,
  type EffectContentSnapshot,
  type EffectTrigger,
  type ScreenEffectDocument
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
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

function effect(
  id: string,
  options: {
    readonly priority?: number;
    readonly cooldownSeconds?: number;
    readonly hasOutput?: boolean;
  } = {}
): ScreenEffectDocument {
  const draft = createScreenEffectDocument({ id, name: `Effect ${id}`, defaultVariantId: `variant-${id}` });
  return screenEffectDocumentSchema.parse({
    ...draft,
    enabled: true,
    priority: options.priority ?? 0,
    cooldownSeconds: options.cooldownSeconds ?? 0,
    bindings: [{
      id: `binding-${id}`,
      kind: "twitch-reward",
      broadcasterId: "broadcaster-1",
      rewardId: "reward-1"
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
    isEffectLive: options.isEffectLive ?? (() => true)
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
    await admission.handleTriggers([trigger("before-switch")]);
    expect(queue.snapshot().queued).toHaveLength(0);
    await admission.handleTriggers([trigger("after-switch")]);
    expect(queue.snapshot().queued.map((item) => item.content.effectId)).toEqual(["two"]);
    active = "one";
    expect(queue.snapshot().queued[0]!.content.effectId).toBe("two");
  });

  it("reserves a module-scoped event before async work so concurrent redelivery admits once", async () => {
    const queue = new DefaultEffectQueue();
    const admission = service({ documents: () => [effect("one")], queue });

    const results = await Promise.all([
      admission.handleTriggers([trigger("event-1")]),
      admission.handleTriggers([trigger("event-1")])
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

    const result = await admission.handleTriggers([trigger("event-order"), trigger("event-order")]);

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

  it("enforces exactly 100 pending items and does not consume cooldown on overflow", async () => {
    const queue = new DefaultEffectQueue();
    const fillAdmission = service({ documents: () => [effect("fill")], queue });
    for (let index = 0; index < 100; index += 1) {
      await fillAdmission.handleTriggers([trigger(`fill-${index}`)]);
    }
    expect(queue.snapshot().queued).toHaveLength(100);

    const blockedAdmission = service({
      documents: () => [effect("blocked", { cooldownSeconds: 60 })],
      queue
    });
    await expect(blockedAdmission.handleTriggers([trigger("overflow")])).resolves.toMatchObject({
      outcomes: [{ effectId: "blocked", status: "full" }]
    });
    expect(queue.snapshot().queued).toHaveLength(100);
    expect(queue.snapshot().queued.some((item) => item.content.effectId === "blocked")).toBe(false);

    queue.clearPending();
    await expect(blockedAdmission.handleTriggers([trigger("after-overflow")])).resolves.toMatchObject({
      outcomes: [{ effectId: "blocked", status: "queued" }]
    });
  });

  it("commits effect cooldown only after admission", async () => {
    const documents = [effect("cooled", { cooldownSeconds: 60 }), effect("always")];
    const admission = service({ documents: () => documents });

    await admission.handleTriggers([trigger("first")]);
    await expect(admission.handleTriggers([trigger("second")])).resolves.toMatchObject({
      outcomes: [
        { effectId: "always", status: "queued" },
        { effectId: "cooled", status: "cooldown" }
      ]
    });
  });

  it("serializes cooldown admission across distinct concurrent events", async () => {
    const queue = new DefaultEffectQueue();
    let releaseFirstValidation: (() => void) | undefined;
    const firstValidationBlocked = new Promise<void>((resolve) => {
      releaseFirstValidation = resolve;
    });
    let validationCalls = 0;
    let firstValidationStarted: (() => void) | undefined;
    const firstValidationEntered = new Promise<void>((resolve) => {
      firstValidationStarted = resolve;
    });
    const admission = service({
      documents: () => [effect("cooled", { cooldownSeconds: 60 })],
      queue,
      validateReferences: async () => {
        validationCalls += 1;
        if (validationCalls === 1) {
          firstValidationStarted?.();
          await firstValidationBlocked;
        }
        return true;
      }
    });

    const first = admission.handleTriggers([trigger("event-first")]);
    await firstValidationEntered;
    const second = admission.handleTriggers([trigger("event-second")]);
    await Promise.resolve();
    releaseFirstValidation?.();

    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.outcomes[0]?.status).sort()).toEqual(["cooldown", "queued"]);
    expect(validationCalls).toBe(1);
    expect(queue.snapshot().queued).toHaveLength(1);
  });

  it("checks module cooldown once so one event can intentionally admit multiple effects", async () => {
    const admission = service({
      documents: () => [effect("second"), effect("first", { priority: 1 })],
      moduleCooldownSeconds: () => 60
    });

    await expect(admission.handleTriggers([trigger("first-event")])).resolves.toMatchObject({
      outcomes: [
        { effectId: "first", status: "queued" },
        { effectId: "second", status: "queued" }
      ]
    });
    await expect(admission.handleTriggers([trigger("second-event")])).resolves.toMatchObject({
      outcomes: [
        { effectId: "first", status: "cooldown" },
        { effectId: "second", status: "cooldown" }
      ]
    });
  });

  it("rejects a selected variant with no destination without consuming its cooldown", async () => {
    let document = effect("output", { cooldownSeconds: 60, hasOutput: false });
    const admission = service({ documents: () => [document] });

    await expect(admission.handleTriggers([trigger("no-output")])).resolves.toMatchObject({
      outcomes: [{ effectId: "output", status: "no-output" }]
    });
    document = effect("output", { cooldownSeconds: 60 });
    await expect(admission.handleTriggers([trigger("with-output")])).resolves.toMatchObject({
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

    await expect(admission.handleTriggers([trigger("gated-event")])).resolves.toEqual({
      status: "module-disabled",
      eventId: "gated-event",
      outcomes: []
    });
    await expect(admission.testEffectVariant("gated", "variant-gated")).resolves.toMatchObject({
      effectId: "gated",
      status: "module-disabled"
    });
    enabled = true;
    await expect(admission.handleTriggers([trigger("gated-event")])).resolves.toMatchObject({
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
    await expect(missing.handleTriggers([trigger("missing-event")])).resolves.toMatchObject({
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

  it("rejects a trigger batch that mixes upstream event IDs", async () => {
    const admission = service({ documents: () => [effect("one")] });

    await expect(admission.handleTriggers([trigger("event-1"), trigger("event-2")])).rejects.toThrow(
      "one upstream event"
    );
  });

  it("snapshots selected content so later definition edits cannot retarget queued work", async () => {
    const queue = new DefaultEffectQueue();
    let document = effect("snapshot");
    const admission = service({ documents: () => [document], queue });

    await admission.handleTriggers([trigger("snapshot-event")]);
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
    const admitted = await admission.handleTriggers([trigger("replay-event")]);
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
    const admitted = await admission.handleTriggers([trigger("replay-missing")]);
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
});
