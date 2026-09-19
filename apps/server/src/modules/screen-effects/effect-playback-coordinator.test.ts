import {
  DefaultEffectQueue,
  type DeviceAudioBatch,
  type EffectOccurrence,
  type OverlayInstruction
} from "@stream-jams/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EffectPlaybackCoordinator,
  effectOccurrenceKey,
  type EffectPlaybackAudioOutputService
} from "./effect-playback-coordinator.js";

function occurrence(id: string, mode: "combined" | "audio" | "visual" = "combined"): EffectOccurrence {
  return {
    id,
    moduleId: "screen-effects",
    trigger: {
      kind: "twitch-reward",
      eventId: `event-${id}`,
      occurredAt: "2026-09-13T12:00:00.000Z",
      broadcasterId: "broadcaster",
      rewardId: "reward",
      summary: "Neutral effect"
    },
    content: {
      effectId: `effect-${id}`,
      effectName: `Effect ${id}`,
      priority: 0,
      variant: {
        id: `variant-${id}`,
        name: "Default",
        enabled: true,
        weight: 1,
        visual: mode === "audio" ? null : {
          mediaType: "video",
          assetId: "clip",
          layout: { x: 100, y: 100, width: 800, height: 450, zIndex: 2 },
          playEmbeddedAudio: mode === "combined",
          audioVolume: 0.4
        },
        sound: mode === "visual" ? null : { assetId: "tone", volume: 0.5 },
        durationMs: 10_000,
        outputs: {
          browserSource: mode !== "visual",
          deviceRouteIds: mode === "visual" ? [] : ["headphones"]
        },
        visualOutputs: {
          browserSource: mode !== "audio",
          desktop: mode !== "audio"
        }
      }
    },
    enqueuedAtMs: 1_000,
    sequence: 0,
    startedAtMs: null,
    completedAtMs: null,
    status: "queued"
  };
}

function harness(item: EffectOccurrence, options: {
  readonly noOutputs?: boolean;
  readonly isModuleEnabled?: () => boolean | Promise<boolean>;
  readonly validateReferences?: () => boolean | Promise<boolean>;
  readonly validateOutputAvailability?: () => boolean | Promise<boolean>;
} = {}) {
  const queue = new DefaultEffectQueue({ now: () => Date.now() });
  queue.enqueue(item);
  const delivered: OverlayInstruction[] = [];
  const audioBatches: DeviceAudioBatch[] = [];
  const stopFailures: Array<{ readonly error: unknown; readonly occurrenceId: string }> = [];
  const browser = {
    deliverPlaybackInstruction: vi.fn((instruction: OverlayInstruction) => {
      delivered.push(instruction);
      return { deliveredClientIds: options.noOutputs ? [] : ["obs"] };
    }),
    stopPlaybackInstructions: vi.fn()
  };
  const audioOutputService: EffectPlaybackAudioOutputService = {
    preparePlayback: vi.fn(async (playbackId, audio) => ({
      batches: options.noOutputs || audio.length === 0 ? [] : [{
        playbackId,
        documentId: audio[0]!.documentId,
        durationMs: audio[0]!.durationMs,
        muted: false,
        layers: audio[0]!.layers,
        destinations: [{ deviceId: "device", routeIds: ["headphones"] }]
      }],
      unavailableRouteIds: []
    }))
  };
  const audio = {
    play: vi.fn(async (batch: DeviceAudioBatch) => {
      audioBatches.push(batch);
      return { failedRouteIds: [] };
    }),
    stop: vi.fn(async () => {}),
    setMuted: vi.fn(async () => {}),
    close: vi.fn(async () => {})
  };
  const desktop = {
    play: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    close: vi.fn(async () => {})
  };
  const coordinator = new EffectPlaybackCoordinator({
    queue,
    getSafety: () => ({ paused: false, muted: false, doNotDisturb: false }),
    overlayPlaybackSink: options.noOutputs ? undefined : browser,
    audioOutputService: options.noOutputs ? undefined : audioOutputService,
    audioPlaybackSink: options.noOutputs ? undefined : audio,
    desktopVisualSink: options.noOutputs ? undefined : desktop,
    isModuleEnabled: options.isModuleEnabled ?? (() => true),
    validateReferences: options.validateReferences ?? (() => true),
    validateOutputAvailability: options.validateOutputAvailability ?? (() => true),
    onStopFailure(error, occurrenceId) { stopFailures.push({ error, occurrenceId }); },
    now: () => Date.now()
  });
  return {
    coordinator,
    queue,
    browser,
    audioOutputService,
    audio,
    desktop,
    delivered,
    audioBatches,
    stopFailures
  };
}

describe("EffectPlaybackCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(5_000);
  });
  afterEach(() => vi.useRealTimers());

  it("does not collide with another module's local occurrence ID", () => {
    expect(effectOccurrenceKey("alerts", "same")).not.toBe(
      effectOccurrenceKey("screen-effects", "same")
    );
  });

  it("delivers combined visual and audio selections with one timing and one device batch", async () => {
    const { coordinator, queue, desktop, delivered, audioBatches } = harness(occurrence("combined"));

    await coordinator.startNext();
    await vi.advanceTimersByTimeAsync(0);

    expect(queue.snapshot().current?.id).toBe("combined");
    expect(desktop.play).toHaveBeenCalledOnce();
    expect(audioBatches).toHaveLength(1);
    expect(audioBatches[0]!.layers.map((layer) => layer.sourceKind)).toEqual([
      "video-soundtrack",
      "audio"
    ]);
    expect(new Set(delivered.map((instruction) => instruction.timing?.startsAtEpochMs)).size).toBe(1);
    expect(delivered.every((instruction) => instruction.purpose === "live")).toBe(true);
    expect(delivered.every((instruction) => instruction.targetProfileId === undefined)).toBe(true);
    for (const instruction of delivered) {
      coordinator.reportInstructionFinished("obs", instruction.id);
    }
    await vi.advanceTimersByTimeAsync(0);

    expect(queue.snapshot().current).toBeNull();
    expect(queue.snapshot().recent[0]).toMatchObject({ id: "combined", status: "completed" });
  });

  it("does not advance while disabled and reports an empty disabled module snapshot", async () => {
    const setup = harness(occurrence("disabled"), { isModuleEnabled: () => false });

    await setup.coordinator.startNext();

    expect(setup.queue.snapshot()).toMatchObject({ current: null, queued: [{ id: "disabled" }] });
    expect(setup.browser.deliverPlaybackInstruction).not.toHaveBeenCalled();
    await expect(setup.coordinator.getModuleSnapshot({
      overlayId: "default",
      moduleId: "screen-effects",
      purpose: "live",
      scope: "module",
      targetProfileId: null
    })).resolves.toEqual({ moduleId: "screen-effects", enabled: false, instructions: [] });
  });

  it("revalidates snapshots and output readiness immediately before dispatch", async () => {
    const stale = harness(occurrence("stale"), { validateReferences: () => false });
    await stale.coordinator.startNext();
    expect(stale.queue.snapshot().recent[0]).toMatchObject({ id: "stale", status: "failed" });
    expect(stale.browser.deliverPlaybackInstruction).not.toHaveBeenCalled();

    const unavailable = harness(occurrence("unavailable"), {
      validateOutputAvailability: () => false
    });
    await unavailable.coordinator.startNext();
    expect(unavailable.queue.snapshot().recent[0]).toMatchObject({ id: "unavailable", status: "failed" });
    expect(unavailable.browser.deliverPlaybackInstruction).not.toHaveBeenCalled();
  });

  it("stops current work and clears pending work when the module is disabled", async () => {
    const setup = harness(occurrence("current", "visual"));
    setup.queue.enqueue({ ...occurrence("pending", "visual"), sequence: 1 });
    await setup.coordinator.startNext();

    await setup.coordinator.disable();

    expect(setup.browser.stopPlaybackInstructions).toHaveBeenCalled();
    expect(setup.queue.snapshot()).toMatchObject({ current: null, queued: [] });
    expect(setup.queue.snapshot().recent[0]).toMatchObject({ id: "current", status: "failed" });
  });

  it("uses a module-qualified transport key so skipping an effect cannot stop an alert batch", async () => {
    const item = occurrence("same", "audio");
    const { coordinator, audio } = harness(item);
    let finishAlert!: () => void;
    let alertSettled = false;
    audio.play.mockImplementationOnce(() => new Promise((resolve) => {
      finishAlert = () => resolve({ failedRouteIds: [] });
    }));
    const alertBatch = audio.play({
      playbackId: effectOccurrenceKey("alerts", "same"),
      documentId: "alert",
      durationMs: 10_000,
      muted: false,
      layers: [],
      destinations: []
    }).then((result) => {
      alertSettled = true;
      return result;
    });

    await coordinator.startNext();
    await coordinator.skip("same");

    expect(audio.stop).toHaveBeenCalledWith(effectOccurrenceKey("screen-effects", "same"));
    expect(audio.stop).not.toHaveBeenCalledWith(effectOccurrenceKey("alerts", "same"));
    expect(alertSettled).toBe(false);
    finishAlert();
    await expect(alertBatch).resolves.toEqual({ failedRouteIds: [] });
  });

  it("holds the queue until a rejected local stop is retried successfully", async () => {
    const setup = harness(occurrence("current"));
    setup.queue.enqueue({ ...occurrence("next", "visual"), sequence: 1 });
    setup.audio.stop.mockRejectedValueOnce(new Error("silence not acknowledged"));
    await setup.coordinator.startNext();

    await expect(setup.coordinator.skip("current")).rejects.toThrow("silence not acknowledged");
    await vi.advanceTimersByTimeAsync(0);

    expect(setup.queue.snapshot()).toMatchObject({
      current: { id: "current" },
      queued: [{ id: "next" }]
    });

    await expect(setup.coordinator.skip("current")).resolves.toBe(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(setup.queue.snapshot().current?.id).toBe("next");
  });

  it("does not resync browser instructions after a local stop is rejected", async () => {
    const setup = harness(occurrence("current"));
    setup.audio.stop.mockRejectedValueOnce(new Error("silence not acknowledged"));
    await setup.coordinator.startNext();

    await expect(setup.coordinator.skip("current")).rejects.toThrow("silence not acknowledged");

    await expect(setup.coordinator.getModuleSnapshot({
      overlayId: "default",
      moduleId: "screen-effects",
      purpose: "live",
      scope: "module",
      targetProfileId: null
    })).resolves.toEqual({
      moduleId: "screen-effects",
      enabled: true,
      instructions: []
    });
  });

  it("settles no-output work as failed instead of wedging the queue", async () => {
    const { coordinator, queue } = harness(occurrence("missing"), { noOutputs: true });

    await coordinator.startNext();
    await vi.advanceTimersByTimeAsync(0);

    expect(queue.snapshot()).toMatchObject({
      current: null,
      recent: [{ id: "missing", status: "failed" }]
    });
  });

  it("bounds a missing browser completion at duration plus five seconds", async () => {
    const { coordinator, queue, browser } = harness(occurrence("watchdog", "visual"));
    await coordinator.startNext();

    await vi.advanceTimersByTimeAsync(14_999);
    expect(queue.snapshot().current?.id).toBe("watchdog");
    await vi.advanceTimersByTimeAsync(1);

    expect(browser.stopPlaybackInstructions).toHaveBeenCalled();
    expect(queue.snapshot().recent[0]).toMatchObject({ id: "watchdog", status: "failed" });
  });

  it("retains an expired occurrence for explicit retry when its local stop is rejected", async () => {
    const setup = harness(occurrence("watchdog-retry", "audio"));
    setup.audio.stop.mockRejectedValueOnce(new Error("silence not acknowledged"));
    await setup.coordinator.startNext();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(setup.queue.snapshot().current?.id).toBe("watchdog-retry");
    expect(setup.stopFailures).toEqual([{
      error: expect.objectContaining({ message: "silence not acknowledged" }),
      occurrenceId: "watchdog-retry"
    }]);

    await expect(setup.coordinator.skip("watchdog-retry")).resolves.toBe(true);
    expect(setup.queue.snapshot().recent[0]).toMatchObject({ id: "watchdog-retry", status: "skipped" });
  });

  it("cancels pending device preparation and ignores its late result after skip", async () => {
    const { coordinator, queue, audioOutputService, audio } = harness(occurrence("preparing", "audio"));
    let finishPreparation!: (value: Awaited<ReturnType<EffectPlaybackAudioOutputService["preparePlayback"]>>) => void;
    vi.mocked(audioOutputService.preparePlayback).mockReturnValueOnce(new Promise((resolve) => {
      finishPreparation = resolve;
    }));

    await coordinator.startNext();
    await coordinator.skip("preparing");
    finishPreparation({
      unavailableRouteIds: [],
      batches: [{
        playbackId: effectOccurrenceKey("screen-effects", "preparing"),
        documentId: "effect-preparing",
        durationMs: 10_000,
        muted: false,
        layers: [],
        destinations: []
      }]
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.stop).toHaveBeenCalledExactlyOnceWith(
      effectOccurrenceKey("screen-effects", "preparing")
    );
    expect(queue.snapshot().recent[0]).toMatchObject({ id: "preparing", status: "skipped" });
  });

  it("settles browser obligations when a client disconnects and preserves failure status", async () => {
    const disconnected = harness(occurrence("disconnect", "visual"));
    await disconnected.coordinator.startNext();
    disconnected.coordinator.reportClientDisconnected("obs");
    await vi.advanceTimersByTimeAsync(0);
    expect(disconnected.queue.snapshot().recent[0]).toMatchObject({
      id: "disconnect",
      status: "completed"
    });

    const failed = harness(occurrence("failed-browser", "visual"));
    await failed.coordinator.startNext();
    failed.coordinator.reportInstructionFinished("obs", failed.delivered[0]!.id, true);
    for (const instruction of failed.delivered.slice(1)) {
      failed.coordinator.reportInstructionFinished("obs", instruction.id);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(failed.queue.snapshot().recent[0]).toMatchObject({
      id: "failed-browser",
      status: "failed"
    });
  });
});
