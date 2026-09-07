import {
  DefaultAlertMatcher,
  DefaultAlertResolver,
  DefaultPlaybackCooldownService,
  DefaultPlaybackDedupeService,
  DefaultPlaybackQueue,
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type AlertResolverTarget,
  type AlertEditorDocument,
  type AlertRule,
  type AlertService,
  type AlertVariant,
  type AssetRepository,
  type NormalizedStreamEvent,
  type Logger,
  type PlaybackQueue,
  type PlaybackQueueSnapshot,
  type PlaybackSafetyState,
  type ResolvedAlert,
  type TtsService
} from "@stream-jams/core";
import type { AudioPlaybackSink, DeviceAudioResult, ResolvedAlertAudio } from "@stream-jams/core";
import { describe, expect, it, vi } from "vitest";
import {
  PlaybackCoordinator,
  type OverlayPlaybackInstructionSink,
  type PlaybackCoordinatorDependencies
} from "./playback-coordinator.js";

describe("PlaybackCoordinator", () => {
  it("retains a browser completion reported synchronously during delivery", () => {
    const coordinator = createCoordinator({
      overlayPlaybackSink: {
        deliverPlaybackInstruction(instruction) {
          coordinator.reportInstructionFinished("obs", instruction.id);
          return { deliveredClientIds: ["obs"] };
        }
      }
    });

    const event = createCheerEvent({ id: "synchronous-browser-completion" });
    const snapshot = coordinator.enqueueResolvedTest({
      sourceEvent: event,
      alerts: [createResolvedAlert(event.id, "resolved", "instruction")]
    });

    expect(snapshot.current).toBeNull();
    expect(snapshot.recent[0]).toMatchObject({ id: "queue-item-1", status: "completed" });
  });

  it("gives replayed browser instructions occurrence-specific acknowledgement IDs", () => {
    const deliveredIds: string[] = [];
    const coordinator = createCoordinator({
      overlayPlaybackSink: {
        deliverPlaybackInstruction(instruction) {
          deliveredIds.push(instruction.id);
          return { deliveredClientIds: ["obs"] };
        }
      }
    });
    const event = createCheerEvent({ id: "stale-browser-completion" });
    coordinator.enqueueResolvedTest({
      sourceEvent: event,
      alerts: [createResolvedAlert(event.id, "resolved", "instruction")]
    });
    const firstId = deliveredIds[0]!;
    coordinator.reportInstructionFinished("obs", firstId);

    coordinator.replayRecent("queue-item-1");
    const replayId = deliveredIds[1]!;

    expect(replayId).not.toBe(firstId);
    expect(coordinator.reportInstructionFinished("obs", firstId).current?.id).toBe("queue-item-2");
    expect(coordinator.reportInstructionFinished("obs", replayId).current).toBeNull();
  });

  it("settles a failed browser dispatch without clearing a healthy recipient", () => {
    const deliveredIds: string[] = [];
    const coordinator = createCoordinator({
      overlayPlaybackSink: {
        deliverPlaybackInstruction(instruction) {
          if (instruction.id.includes("failed-instruction")) throw new Error("browser disconnected");
          deliveredIds.push(instruction.id);
          return { deliveredClientIds: ["obs"] };
        }
      }
    });
    const event = createCheerEvent({ id: "one-browser-fails" });

    expect(() => coordinator.enqueueResolvedTest({
      sourceEvent: event,
      alerts: [
        createResolvedAlert(event.id, "failed", "failed-instruction"),
        createResolvedAlert(event.id, "healthy", "healthy-instruction")
      ]
    })).not.toThrow();
    expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("obs", deliveredIds[0]!).current).toBeNull();
  });

  it("keeps a healthy browser playing after device preparation expires", async () => {
    vi.useFakeTimers();
    try {
      const audio = audioFixture();
      const preparation = deferred<Awaited<ReturnType<typeof audio.dependencies.audioOutputService.preparePlayback>>>();
      audio.dependencies.audioOutputService.preparePlayback.mockReturnValueOnce(preparation.promise);
      const stopPlaybackInstructions = vi.fn();
      const delivered: string[] = [];
      const coordinator = createCoordinator({ ...audio.dependencies, overlayPlaybackSink: {
        deliverPlaybackInstruction(instruction) { delivered.push(instruction.id); return { deliveredClientIds: ["obs"] }; },
        stopPlaybackInstructions
      } });
      const event = createCheerEvent({ id: "slow-device-healthy-browser" });
      const alert = createResolvedAlert(event.id, "resolved", "instruction");
      coordinator.enqueueResolvedTest({ sourceEvent: event,
        alerts: [{ ...alert, overlayInstruction: { ...alert.overlayInstruction, durationMs: 30_000 } }],
        audio: [{ ...deviceAudio(), durationMs: 30_000 }] });
      await vi.advanceTimersByTimeAsync(5000);
      expect(stopPlaybackInstructions).not.toHaveBeenCalled();
      expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");
      preparation.resolve({ unavailableRouteIds: [], batches: [] });
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.sink.play).not.toHaveBeenCalled();
      expect(coordinator.reportInstructionFinished("obs", delivered[0]!).current).toBeNull();
      await coordinator.close();
    } finally { vi.useRealTimers(); }
  });

  it("stops a hung preparation at five seconds and never starts its late result", async () => {
    vi.useFakeTimers();
    try {
      const audio = audioFixture();
      const preparation = deferred<Awaited<ReturnType<typeof audio.dependencies.audioOutputService.preparePlayback>>>();
      const stopped = deferred<void>();
      audio.dependencies.audioOutputService.preparePlayback.mockReturnValueOnce(preparation.promise);
      audio.sink.stop.mockReturnValueOnce(stopped.promise);
      const delivered: string[] = [];
      const coordinator = createCoordinator({
        ...audio.dependencies,
        overlayPlaybackSink: {
          deliverPlaybackInstruction(instruction) {
            delivered.push(instruction.id);
            return { deliveredClientIds: [] };
          }
        }
      });
      const first = createCheerEvent({ id: "hung-preparation" });
      const next = createCheerEvent({ id: "after-hung-preparation" });
      coordinator.enqueueResolvedTest({ sourceEvent: first, alerts: [], audio: [deviceAudio()] });
      coordinator.enqueueResolvedTest({
        sourceEvent: next,
        alerts: [createResolvedAlert(next.id, "next", "next-instruction")]
      });

      await vi.advanceTimersByTimeAsync(4_999);
      expect(audio.sink.stop).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(audio.sink.stop).toHaveBeenCalledExactlyOnceWith("queue-item-1");
      expect(delivered).toEqual([]);

      stopped.resolve(undefined);
      await vi.advanceTimersByTimeAsync(0);
      expect(delivered).toHaveLength(1);
      expect(coordinator.getSnapshot().current).toBeNull();

      preparation.resolve({
        unavailableRouteIds: [],
        batches: [{
          ...deviceAudio(),
          playbackId: "queue-item-1",
          muted: false,
          destinations: [{ deviceId: "a", routeIds: ["personal"] }]
        }]
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.sink.play).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops browser and device work at duration plus five seconds before advancing", async () => {
    vi.useFakeTimers();
    try {
      const audio = audioFixture();
      const stopped = deferred<void>();
      audio.sink.stop.mockReturnValueOnce(stopped.promise);
      const delivered: string[] = [];
      const stoppedBrowser: string[][] = [];
      const coordinator = createCoordinator({
        ...audio.dependencies,
        overlayPlaybackSink: {
          deliverPlaybackInstruction(instruction) {
            delivered.push(instruction.id);
            return { deliveredClientIds: instruction.id.includes("first") ? ["obs"] : [] };
          },
          stopPlaybackInstructions(ids) {
            stoppedBrowser.push([...ids]);
          }
        }
      });
      const first = createCheerEvent({ id: "duration-watchdog" });
      const next = createCheerEvent({ id: "after-duration-watchdog" });
      coordinator.enqueueResolvedTest({
        sourceEvent: first,
        alerts: [createResolvedAlert(first.id, "first", "first-instruction")],
        audio: [{ ...deviceAudio(), durationMs: 2_000 }]
      });
      coordinator.enqueueResolvedTest({
        sourceEvent: next,
        alerts: [createResolvedAlert(next.id, "next", "next-instruction")]
      });

      await vi.advanceTimersByTimeAsync(7_999);
      expect(audio.sink.stop).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(audio.sink.stop).toHaveBeenCalledExactlyOnceWith("queue-item-1");
      expect(stoppedBrowser).toEqual([[delivered[0]!]]);
      expect(delivered).toHaveLength(1);

      stopped.resolve(undefined);
      await vi.advanceTimersByTimeAsync(0);
      expect(delivered).toHaveLength(2);
      expect(coordinator.getSnapshot().current).toBeNull();

      audio.finished.resolve({ failedRouteIds: [] });
      await vi.advanceTimersByTimeAsync(0);
      expect(delivered).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not advance at the watchdog when device silence cannot be established", async () => {
    vi.useFakeTimers();
    try {
      const audio = audioFixture();
      audio.sink.stop.mockRejectedValueOnce(new Error("silence unknown"));
      const delivered: string[] = [];
      const coordinator = createCoordinator({
        ...audio.dependencies,
        overlayPlaybackSink: {
          deliverPlaybackInstruction(instruction) {
            delivered.push(instruction.id);
            return { deliveredClientIds: ["obs"] };
          },
          stopPlaybackInstructions() {}
        }
      });
      const first = createCheerEvent({ id: "failed-watchdog-stop" });
      const next = createCheerEvent({ id: "after-failed-watchdog-stop" });
      coordinator.enqueueResolvedTest({
        sourceEvent: first,
        alerts: [createResolvedAlert(first.id, "first", "first-instruction")],
        audio: [deviceAudio()]
      });
      coordinator.enqueueResolvedTest({
        sourceEvent: next,
        alerts: [createResolvedAlert(next.id, "next", "next-instruction")]
      });

      await vi.advanceTimersByTimeAsync(8_000);

      expect(audio.sink.stop).toHaveBeenCalledExactlyOnceWith("queue-item-1");
      expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");
      expect(delivered).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still establishes device silence when browser stop throws", async () => {
    const audio = audioFixture();
    const coordinator = createCoordinator({
      ...audio.dependencies,
      overlayPlaybackSink: {
        deliverPlaybackInstruction() {
          return { deliveredClientIds: ["obs"] };
        },
        stopPlaybackInstructions() {
          throw new Error("browser already disconnected");
        }
      }
    });
    const event = createCheerEvent({ id: "browser-stop-failed" });
    coordinator.enqueueResolvedTest({
      sourceEvent: event,
      alerts: [createResolvedAlert(event.id, "first", "instruction")],
      audio: [deviceAudio()]
    });

    await expect(coordinator.skipCurrent()).resolves.toMatchObject({ current: null });
    expect(audio.sink.stop).toHaveBeenCalledExactlyOnceWith("queue-item-1");
  });

  it("closes device playback even when browser shutdown throws", async () => {
    const audio = audioFixture();
    const coordinator = createCoordinator({
      ...audio.dependencies,
      overlayPlaybackSink: {
        deliverPlaybackInstruction() {
          return { deliveredClientIds: ["obs"] };
        },
        stopPlaybackInstructions() {
          throw new Error("browser already disconnected");
        }
      }
    });
    const event = createCheerEvent({ id: "browser-close-failed" });
    coordinator.enqueueResolvedTest({
      sourceEvent: event,
      alerts: [createResolvedAlert(event.id, "first", "instruction")],
      audio: [deviceAudio()]
    });

    await expect(coordinator.close()).resolves.toBeUndefined();
    expect(audio.sink.close).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent skips through one silence acknowledgement", async () => {
    const audio = audioFixture();
    const stopped = deferred<void>();
    audio.sink.stop.mockReturnValueOnce(stopped.promise);
    const coordinator = createCoordinator(audio.dependencies);
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent({ id: "first" }), alerts: [], audio: [deviceAudio()] });
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent({ id: "next" }), alerts: [], audio: [deviceAudio()] });

    const firstSkip = coordinator.skipCurrent();
    const secondSkip = coordinator.skipCurrent();

    expect(secondSkip).toBe(firstSkip);
    expect(audio.sink.stop).toHaveBeenCalledExactlyOnceWith("queue-item-1");
    stopped.resolve(undefined);
    await Promise.all([firstSkip, secondSkip]);
    expect(coordinator.getSnapshot().current?.id).toBe("queue-item-2");
    await coordinator.close();
  });

  it("does not advance when close overtakes a pending skip", async () => {
    const audio = audioFixture();
    const preparation = deferred<Awaited<ReturnType<typeof audio.dependencies.audioOutputService.preparePlayback>>>();
    const stopped = deferred<void>();
    audio.dependencies.audioOutputService.preparePlayback.mockReturnValueOnce(preparation.promise);
    audio.sink.stop.mockReturnValueOnce(stopped.promise);
    const coordinator = createCoordinator(audio.dependencies);
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent({ id: "first" }), alerts: [], audio: [deviceAudio()] });
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent({ id: "next" }), alerts: [], audio: [deviceAudio()] });

    const skipping = coordinator.skipCurrent();
    const closing = coordinator.close();
    stopped.resolve(undefined);
    await Promise.all([skipping, closing]);
    preparation.resolve({ unavailableRouteIds: [], batches: [] });
    await Promise.resolve();

    expect(audio.sink.close).toHaveBeenCalledTimes(1);
    expect(audio.sink.play).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");
  });

  it("uses a concurrent persisted mute for playback still preparing", async () => {
    const audio = audioFixture();
    const preparation = deferred<Awaited<ReturnType<typeof audio.dependencies.audioOutputService.preparePlayback>>>();
    audio.dependencies.audioOutputService.preparePlayback.mockReturnValueOnce(preparation.promise);
    const coordinator = createCoordinator(audio.dependencies);
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent(), alerts: [], audio: [deviceAudio()] });

    await coordinator.mute();
    preparation.resolve({
      unavailableRouteIds: [],
      batches: [{
        ...deviceAudio(),
        playbackId: "queue-item-1",
        muted: false,
        destinations: [{ deviceId: "a", routeIds: ["personal"] }]
      }]
    });
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledWith(expect.objectContaining({ muted: true })));
    audio.finished.resolve({ failedRouteIds: [] });
    await vi.waitFor(() => expect(coordinator.getSnapshot().current).toBeNull());
  });

  it("awaits explicit device silence after play rejects before advancing", async () => {
    const audio = audioFixture();
    const stopped = deferred<void>();
    audio.sink.play.mockRejectedValueOnce(new Error("IPC link lost"));
    audio.sink.stop.mockReturnValueOnce(stopped.promise);
    const coordinator = createCoordinator(audio.dependencies);
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent({ id: "rejected-play" }), alerts: [], audio: [deviceAudio()] });
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent({ id: "next" }), alerts: [], audio: [deviceAudio()] });

    await vi.waitFor(() => expect(audio.sink.stop).toHaveBeenCalledExactlyOnceWith("queue-item-1"));
    expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");
    expect(audio.sink.play).toHaveBeenCalledTimes(1);

    stopped.resolve(undefined);
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(2));
    expect(coordinator.getSnapshot().current?.id).toBe("queue-item-2");
    await coordinator.close();
  });

  it("holds the queue when explicit silence after play rejection also fails", async () => {
    vi.useFakeTimers();
    try {
      const audio = audioFixture();
      audio.sink.play.mockRejectedValueOnce(new Error("IPC link lost"));
      audio.sink.stop.mockRejectedValueOnce(new Error("silence unknown"));
      const coordinator = createCoordinator(audio.dependencies);
      coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent({ id: "rejected-play-and-stop" }), alerts: [], audio: [deviceAudio()] });
      coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent({ id: "next" }), alerts: [], audio: [deviceAudio()] });

      await vi.advanceTimersByTimeAsync(0);
      expect(audio.sink.stop).toHaveBeenCalledExactlyOnceWith("queue-item-1");
      expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");
      expect(audio.sink.play).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(8_000);
      expect(audio.sink.stop).toHaveBeenCalledTimes(1);
      expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");

      await coordinator.skipCurrent();
      await vi.advanceTimersByTimeAsync(0);
      expect(audio.sink.play).toHaveBeenCalledTimes(2);
      expect(audio.sink.stop).toHaveBeenCalledTimes(2);
      await coordinator.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("prepares queued content only when it starts, keeps active bindings fixed, and uses fresh bindings for replay", async () => {
    const audio = audioFixture();
    let boundDeviceId = "original";
    audio.dependencies.audioOutputService.preparePlayback.mockImplementation(async (playbackId, items) => ({
      unavailableRouteIds: [], batches: items.map(item => ({
        playbackId, documentId: item.documentId, durationMs: item.durationMs, layers: item.layers, muted: false,
        destinations: [{ deviceId: boundDeviceId, routeIds: [...item.outputs.deviceRouteIds] }]
      }))
    }));
    const coordinator = createCoordinator(audio.dependencies);
    await coordinator.pause();
    const content = deviceAudio();
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent(), alerts: [], audio: [content] });
    expect(audio.dependencies.audioOutputService.preparePlayback).not.toHaveBeenCalled();
    boundDeviceId = "at-start";
    await coordinator.resume();
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(1));
    expect(audio.sink.play.mock.calls[0]?.[0].destinations[0]?.deviceId).toBe("at-start");
    boundDeviceId = "after-start";
    (content.layers[0]! as { assetId: string }).assetId = "changed";
    await coordinator.mute();
    expect(audio.sink.setMuted).toHaveBeenCalledWith(true);
    expect(audio.sink.play).toHaveBeenCalledTimes(1);
    audio.finished.resolve({ failedRouteIds: [] });
    await vi.waitFor(() => expect(coordinator.getSnapshot().current).toBeNull());
    coordinator.replayRecent("queue-item-1");
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(2));
    expect(audio.sink.play.mock.calls[1]?.[0]).toMatchObject({
      playbackId: "queue-item-2", muted: true, layers: [{ assetId: "tone" }],
      destinations: [{ deviceId: "after-start" }]
    });
    expect(audio.sink.play.mock.calls[0]?.[0].destinations[0]?.deviceId).toBe("at-start");
  });

  it("retains browser completion after device audio finishes first", async () => {
    const audio = audioFixture();
    const coordinator = createCoordinator({ ...audio.dependencies,
      overlayPlaybackSink: { deliverPlaybackInstruction: () => ({ deliveredClientIds: ["obs"] }) }
    });
    const event = createCheerEvent();
    coordinator.enqueueResolvedTest({ sourceEvent: event, alerts: [createResolvedAlert(event.id, "first", "visual")], audio: [deviceAudio()] });
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(1));
    audio.finished.resolve({ failedRouteIds: [] });
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("obs", "queue-item-1:visual").current).toBeNull();
  });

  it("does not advance when stopping fails, and allows an explicit retry", async () => {
    const audio = audioFixture();
    audio.sink.stop.mockRejectedValueOnce(new Error("Stop not acknowledged"));
    const coordinator = createCoordinator(audio.dependencies);
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent(), alerts: [], audio: [deviceAudio()] });
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent(), alerts: [], audio: [deviceAudio()] });
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(1));
    await expect(coordinator.skipCurrent()).rejects.toThrow("Stop not acknowledged");
    expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");
    expect(audio.sink.play).toHaveBeenCalledTimes(1);
    await coordinator.skipCurrent();
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(2));
    await coordinator.close();
  });

  it("waits for healthy audio documents after a sibling fails and safely completes wholly missing routes", async () => {
    const audio = audioFixture();
    const error = vi.fn(async () => {});
    audio.sink.play.mockRejectedValueOnce(new Error("private device details"));
    const coordinator = createCoordinator({ ...audio.dependencies, audioOutputService: {
      ...audio.dependencies.audioOutputService,
      listRoutes: () => [{ id: "personal", name: "Private headphones", deviceId: "private-device-id", deviceLabel: "Private device label" }]
    }, logger: { error }, generateReferenceId: () => "audio-ref" });
    coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent(), alerts: [], audio: [deviceAudio(), { ...deviceAudio(), documentId: "second" }] });
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(2));
    expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");
    expect(JSON.stringify(error.mock.calls)).not.toContain("private device details");
    audio.finished.resolve({ failedRouteIds: [] });
    await vi.waitFor(() => expect(coordinator.getSnapshot().current).toBeNull());
    audio.dependencies.audioOutputService.preparePlayback.mockResolvedValue({ batches: [], unavailableRouteIds: ["personal"] });
    coordinator.replayRecent("queue-item-1");
    await vi.waitFor(() => expect(coordinator.getSnapshot().recent[0]?.id).toBe("queue-item-2"));
    expect(audio.sink.play).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("unavailable"), expect.objectContaining({
      correlationId: "audio-ref", metadata: expect.objectContaining({ playbackId: "queue-item-2", routeIds: ["personal"], routeNames: ["Private headphones"], correctionRoute: "/manage/settings#audio-outputs" })
    }));
    expect(JSON.stringify(error.mock.calls)).not.toContain("private-device-id");
    expect(JSON.stringify(error.mock.calls)).not.toContain("Private device label");
  });

  it("does not enqueue a live event that was still resolving during shutdown", async () => {
    const docs = deferred<AlertEditorDocument | null>();
    const rule = createRule();
    const coordinator = createCoordinator({ alertService: new RecordingAlertService([rule]), findEditorDocument: () => docs.promise });
    const enqueue = coordinator.enqueueEvent(createCheerEvent());
    await coordinator.close();
    docs.resolve(createEditorDocument(rule));
    await expect(enqueue).rejects.toThrow(/stopped/);
    expect(coordinator.getSnapshot()).toMatchObject({ current: null, queued: [], recent: [] });
  });

  it.each([false, true])("delivers one canonical device batch for the selected variation without OBS (ready profiles: %s)", async readyProfiles => {
    const base = createRule();
    const rule = { ...base, variants: [
      { ...base.variants[0]!, enabled: false }, createVariant({ id: "chosen" })
    ] };
    const document: AlertEditorDocument = {
      ...createEditorDocument(rule), id: "chosen", kind: "variation", parentAlertId: rule.id,
      outputs: { browserSource: readyProfiles, deviceRouteIds: ["personal"] },
      targetProfiles: readyProfiles ? createEditorDocument(rule).targetProfiles.map(profile => ({ ...profile, enabled: true, reviewState: "ready" })) : [],
      layers: [
        { id: "one", name: "Sound", type: "audio", visible: true, order: 0, animation, assetId: "tone", volume: 0.5 },
        { id: "two", name: "Sound", type: "audio", visible: true, order: 1, animation, assetId: "tone", volume: 0.25 },
        { id: "hidden", name: "Hidden", type: "audio", visible: false, order: 2, animation, assetId: "secret", volume: 1 }
      ]
    };
    const audio = audioFixture();
    const findEditorDocument = vi.fn(async (id: string) => id === document.id ? document : null);
    const coordinator = createCoordinator({
      ...audio.dependencies, alertService: new RecordingAlertService([rule]), findEditorDocument,
      additionalTargets: ["landscape", "vertical"].map(targetProfileId => ({
        overlayId: "overlay-1", purpose: "live" as const, scope: "module" as const,
        targetProfileId: targetProfileId as "landscape" | "vertical"
      })),
      overlayPlaybackSink: { deliverPlaybackInstruction: () => ({ deliveredClientIds: [] }) }
    });
    await coordinator.enqueueEvent(createCheerEvent());
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(1));
    expect(findEditorDocument).toHaveBeenCalledExactlyOnceWith("chosen");
    expect(audio.sink.play).toHaveBeenCalledWith(expect.objectContaining({
      playbackId: "queue-item-1", documentId: "chosen",
      layers: [{ layerId: "one", assetId: "tone", volume: 0.5 }, { layerId: "two", assetId: "tone", volume: 0.25 }]
    }));
    expect(coordinator.getSnapshot().current?.audio).toHaveLength(1);
    audio.finished.resolve({ failedRouteIds: [] });
    await vi.waitFor(() => expect(coordinator.getSnapshot().current).toBeNull());
    coordinator.replayRecent("queue-item-1");
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(2));
    expect(audio.sink.play.mock.calls[1]?.[0]).toMatchObject({ playbackId: "queue-item-2", documentId: "chosen" });
  });

  it.each(["disabled", "no-routes", "hidden"] as const)("does not dispatch device audio for %s live content", async mode => {
    const audio = audioFixture();
    const rule = createRule();
    const document: AlertEditorDocument = {
      ...createEditorDocument(rule), enabled: mode !== "disabled",
      outputs: { browserSource: false, deviceRouteIds: mode === "no-routes" ? [] : ["personal"] },
      layers: [{ id: "one", name: "Sound", type: "audio", visible: mode !== "hidden", order: 0, animation, assetId: "tone", volume: 0.5 }]
    };
    const coordinator = createCoordinator({ ...audio.dependencies,
      alertService: new RecordingAlertService([rule]), findEditorDocument: async () => document,
      overlayPlaybackSink: { deliverPlaybackInstruction: () => ({ deliveredClientIds: [] }) }
    });
    await coordinator.enqueueEvent(createCheerEvent());
    expect(audio.dependencies.audioOutputService.preparePlayback).not.toHaveBeenCalled();
    expect(audio.sink.play).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().current).toBeNull();
  });

  it("waits for both device and browser completion and ignores old device completion after skip", async () => {
    const audio = audioFixture();
    const stop = deferred<void>();
    audio.sink.stop.mockReturnValue(stop.promise);
    const coordinator = createCoordinator({ ...audio.dependencies,
      overlayPlaybackSink: { deliverPlaybackInstruction: () => ({ deliveredClientIds: ["obs"] }) }
    });
    const event = createCheerEvent();
    coordinator.enqueueResolvedTest({ sourceEvent: event, alerts: [createResolvedAlert(event.id, "first", "visual")], audio: [deviceAudio()] });
    coordinator.enqueueResolvedTest({ sourceEvent: event, alerts: [], audio: [deviceAudio()] });
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(1));
    coordinator.reportInstructionFinished("obs", "queue-item-1:visual");
    expect(coordinator.getSnapshot().current?.id).toBe("queue-item-1");
    const skipping = coordinator.skipCurrent();
    expect(audio.sink.stop).toHaveBeenCalledWith("queue-item-1");
    expect(audio.sink.play).toHaveBeenCalledTimes(1);
    const nextFinished = deferred<DeviceAudioResult>();
    audio.sink.play.mockReturnValueOnce(nextFinished.promise);
    stop.resolve(undefined);
    await skipping;
    await vi.waitFor(() => expect(audio.sink.play).toHaveBeenCalledTimes(2));
    audio.finished.resolve({ failedRouteIds: [] });
    await Promise.resolve();
    expect(coordinator.getSnapshot().current?.id).toBe("queue-item-2");
    nextFinished.resolve({ failedRouteIds: [] });
    await vi.waitFor(() => expect(coordinator.getSnapshot().current).toBeNull());
  });

  it("does not start device audio after skip or shutdown cancels pending preparation", async () => {
    for (const action of ["skip", "close"] as const) {
      const audio = audioFixture();
      const preparing = deferred<Awaited<ReturnType<typeof audio.dependencies.audioOutputService.preparePlayback>>>();
      audio.dependencies.audioOutputService.preparePlayback.mockReturnValueOnce(preparing.promise);
      const coordinator = createCoordinator(audio.dependencies);
      coordinator.enqueueResolvedTest({ sourceEvent: createCheerEvent(), alerts: [], audio: [deviceAudio()] });
      expect(audio.dependencies.audioOutputService.preparePlayback).toHaveBeenCalledTimes(1);
      if (action === "skip") await coordinator.skipCurrent();
      else await coordinator.close();
      preparing.resolve({ unavailableRouteIds: [], batches: [{ ...deviceAudio(), playbackId: "queue-item-1", muted: false, destinations: [{ deviceId: "a", routeIds: ["personal"] }] }] });
      await Promise.resolve();
      await Promise.resolve();
      expect(audio.sink.play).not.toHaveBeenCalled();
    }
  });

  it("stops current playback and cannot advance on late client disconnects after shutdown", () => {
    const deliveries: string[] = [];
    const stops: string[][] = [];
    const coordinator = createCoordinator({ overlayPlaybackSink: {
      deliverPlaybackInstruction(instruction) { deliveries.push(instruction.id); return { deliveredClientIds: ["obs"] }; },
      stopPlaybackInstructions(ids) { stops.push([...ids]); }
    } });
    const event = createCheerEvent();
    coordinator.enqueueResolvedTest({ sourceEvent: event, alerts: [createResolvedAlert(event.id, "first", "first-instruction")] });
    coordinator.enqueueResolvedTest({ sourceEvent: event, alerts: [createResolvedAlert(event.id, "next", "next-instruction")] });
    coordinator.close();
    coordinator.close();
    coordinator.reportClientDisconnected("obs");
    coordinator.reportInstructionFinished("obs", "queue-item-1:first-instruction");
    expect(deliveries).toEqual(["queue-item-1:first-instruction"]);
    expect(stops).toEqual([["queue-item-1:first-instruction"]]);
    expect(() => coordinator.enqueueResolvedTest({ sourceEvent: event, alerts: [] })).toThrow(/stopped/);
  });
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

  it("bulk-loads assets only for the selected variant", async () => {
    const assets = new InMemoryAssetRepository({
      "asset-selected": "image",
      "asset-unselected": "video"
    });
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([
        createRule({
          variants: [
            createVariant({ id: "variant-selected", visualAssetId: "asset-selected" }),
            createVariant({ id: "variant-unselected", visualAssetId: "asset-unselected" })
          ]
        })
      ]),
      assetRepository: assets,
      random: () => 0
    });

    await coordinator.enqueueEvent(createCheerEvent());

    expect(assets.requestedIds).toEqual(["asset-selected"]);
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
    await coordinator.pause();
    await coordinator.resume();

    expect(deliveredInstructionIds).toEqual(["queue-item-1:overlay-instruction-2"]);
  });

  it("persists safety state before applying it and leaves runtime unchanged on failure", async () => {
    const observedPausedStates: boolean[] = [];
    const coordinator = createCoordinator({
      persistPlaybackSafetyState: async (patch) => {
        observedPausedStates.push(coordinator.getSnapshot().paused);
        return { paused: patch.paused ?? false, muted: false, doNotDisturb: false };
      }
    });

    await expect(coordinator.pause()).resolves.toMatchObject({ paused: true });
    expect(observedPausedStates).toEqual([false]);

    const failing = createCoordinator({
      persistPlaybackSafetyState: async () => {
        throw new Error("config write failed");
      }
    });

    await expect(failing.mute()).rejects.toThrow("config write failed");
    expect(failing.getSnapshot().muted).toBe(false);
  });

  it("broadcasts persisted mute state and stops current instructions before advancing", async () => {
    const calls: string[] = [];
    const coordinator = createCoordinator({
      persistPlaybackSafetyState: async (patch) => {
        calls.push(`persist:${String(patch.muted)}`);
        return { paused: false, muted: patch.muted ?? false, doNotDisturb: false };
      },
      overlayPlaybackSink: {
        deliverPlaybackInstruction(instruction) {
          calls.push(`deliver:${instruction.id}`);
        },
        setPlaybackMuted(muted) {
          calls.push(`mute:${String(muted)}`);
        },
        stopPlaybackInstructions(instructionIds) {
          calls.push(`stop:${instructionIds.join(",")}`);
        }
      }
    });
    const firstEvent = createCheerEvent({ id: "first" });
    const nextEvent = createCheerEvent({ id: "next" });
    coordinator.enqueueResolvedTest({
      sourceEvent: firstEvent,
      alerts: [
        createResolvedAlert(firstEvent.id, "first-a", "instruction-a"),
        createResolvedAlert(firstEvent.id, "first-b", "instruction-b")
      ]
    });
    coordinator.enqueueResolvedTest({
      sourceEvent: nextEvent,
      alerts: [createResolvedAlert(nextEvent.id, "next", "instruction-next")]
    });

    await coordinator.mute();
    coordinator.skipCurrent();

    expect(calls).toEqual([
      "deliver:queue-item-1:instruction-a",
      "deliver:queue-item-1:instruction-b",
      "persist:true",
      "mute:true",
      "stop:queue-item-1:instruction-a,queue-item-1:instruction-b",
      "deliver:queue-item-2:instruction-next"
    ]);
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
    expect(deliveredInstructionIds).toEqual(["queue-item-1:instruction-editor-test"]);
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

    expect(coordinator.reportInstructionFinished("client-1", "queue-item-1:instruction-1").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("client-1", "queue-item-1:instruction-1").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("client-1", "stale-instruction").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("unknown-client", "queue-item-1:instruction-2").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("client-2", "queue-item-1:instruction-1").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("client-1", "queue-item-1:instruction-2").current?.id).toBe("queue-item-1");
    expect(coordinator.reportInstructionFinished("client-2", "queue-item-1:instruction-2").current?.id).toBe("queue-item-2");
    expect(coordinator.reportInstructionFinished("client-2", "queue-item-1:instruction-2").current?.id).toBe("queue-item-2");
    expect(coordinator.reportInstructionFinished("client-1", "queue-item-2:instruction-3").current?.id).toBe("queue-item-2");
    expect(coordinator.reportInstructionFinished("client-2", "queue-item-2:instruction-3").current).toBeNull();
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

    coordinator.reportInstructionFinished("client-1", "queue-item-1:instruction-1");
    coordinator.reportInstructionFinished("client-1", "queue-item-1:instruction-2");

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

  it("drains a long zero-recipient queue without stack growth", async () => {
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

    expect((await coordinator.resume()).current).toBeNull();
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

    await Promise.resolve();
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

  it("dispatches one remote TTS trigger when the item becomes current", async () => {
    const rule = createRule({
      id: "rule-speakerbot",
      variants: [createVariant({
        ttsConfig: {
          enabled: true,
          providerId: "speakerbot",
          voiceId: null,
          template: "Welcome {actor.displayName}",
          minimumAmount: null
        }
      })]
    });
    const baseDocument = createEditorDocument(rule);
    const document: AlertEditorDocument = {
      ...baseDocument,
      layers: [{
        id: "layer-tts",
        name: "TTS",
        type: "tts",
        visible: true,
        order: 0,
        animation,
        enabled: true,
        providerId: "speakerbot",
        template: "Welcome {actor.displayName}"
      }],
      targetProfiles: baseDocument.targetProfiles.map((profile) => ({
        ...profile,
        enabled: true,
        reviewState: "ready" as const,
        layerLayouts: []
      }))
    };
    const calls: string[] = [];
    const deliveredProfiles: Array<string | null | undefined> = [];
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([rule]),
      additionalTargets: [
        { overlayId: "overlay-1", purpose: "live", scope: "module", targetProfileId: "landscape" },
        { overlayId: "overlay-1", purpose: "live", scope: "module", targetProfileId: "vertical" }
      ],
      findEditorDocument: async () => document,
      ttsService: {
        async createPlaybackInstructionFromModeratedText(input) {
          calls.push(`tts:${input.providerId}:${input.text}:${String(input.metadata?.layerId)}`);
          return {
            instruction: { mode: "remote-trigger", text: input.text, audioAssetId: null, providerPayload: null },
            moderationActions: []
          };
        }
      },
      overlayPlaybackSink: {
        deliverPlaybackInstruction(instruction) {
          deliveredProfiles.push(instruction.targetProfileId);
          calls.push(`overlay:${String(instruction.targetProfileId)}`);
          return { deliveredClientIds: [] };
        }
      }
    });

    const result = await coordinator.enqueueEvent(createCheerEvent());

    expect(result.status).toBe("queued");
    expect(calls).toEqual([
      "overlay:undefined",
      "overlay:landscape",
      "overlay:vertical",
      "tts:speakerbot:Welcome Viewer:layer-tts"
    ]);
    expect(deliveredProfiles).toEqual([undefined, "landscape", "vertical"]);
  });

  it("waits to dispatch remote TTS until playback starts and suppresses items that start muted", async () => {
    const dispatched: string[] = [];
    const ttsService: Pick<TtsService, "createPlaybackInstructionFromModeratedText"> = {
      async createPlaybackInstructionFromModeratedText(input) {
        dispatched.push(input.text);
        return {
          instruction: { mode: "remote-trigger", text: input.text, audioAssetId: null, providerPayload: null },
          moderationActions: []
        };
      }
    };
    const pausedQueue = new DefaultPlaybackQueue({
      generateId: () => "paused-item",
      initialSafetyState: { paused: true, muted: false, doNotDisturb: false }
    });
    const paused = createCoordinator({ queue: pausedQueue, ttsService });
    paused.enqueueResolvedTest({
      sourceEvent: createCheerEvent({ id: "paused-event" }),
      alerts: [createRemoteTtsAlert("paused-event", "speak-after-resume")]
    });

    expect(dispatched).toEqual([]);
    await paused.resume();
    await Promise.resolve();
    expect(dispatched).toEqual(["speak-after-resume"]);

    let mutedQueueId = 0;
    const mutedQueue = new DefaultPlaybackQueue({
      generateId: () => `muted-item-${++mutedQueueId}`,
      initialSafetyState: { paused: false, muted: true, doNotDisturb: false }
    });
    const muted = createCoordinator({ queue: mutedQueue, ttsService });
    muted.enqueueResolvedTest({
      sourceEvent: createCheerEvent({ id: "muted-event" }),
      alerts: [createRemoteTtsAlert("muted-event", "never-speak-late")]
    });

    await muted.unmute();
    await Promise.resolve();
    expect(dispatched).toEqual(["speak-after-resume"]);

    muted.completeCurrent();
    muted.enqueueResolvedTest({
      sourceEvent: createCheerEvent({ id: "future-event" }),
      alerts: [createRemoteTtsAlert("future-event", "future-speech")]
    });
    await Promise.resolve();
    expect(dispatched).toEqual(["speak-after-resume", "future-speech"]);
  });

  it("logs one referenced remote TTS failure and continues overlay delivery", async () => {
    const rule = createRule({
      id: "rule-speakerbot-failure",
      variants: [createVariant({
        ttsConfig: {
          enabled: true,
          providerId: "speakerbot",
          voiceId: null,
          template: "Do not leak {actor.displayName}",
          minimumAmount: null
        }
      })]
    });
    const errors: Array<{ readonly message: string; readonly context: Parameters<Logger["error"]>[1] }> = [];
    let deliveryCount = 0;
    const coordinator = createCoordinator({
      alertService: new RecordingAlertService([rule]),
      ttsService: {
        async createPlaybackInstructionFromModeratedText() {
          throw new Error("ws://127.0.0.1:7680/?token=secret failed");
        }
      },
      logger: {
        async error(message, context) {
          errors.push({ message, context });
        }
      },
      generateReferenceId: () => "ref-tts-failure",
      overlayPlaybackSink: {
        deliverPlaybackInstruction() {
          deliveryCount += 1;
          return { deliveredClientIds: [] };
        }
      }
    });

    const result = await coordinator.enqueueEvent(createCheerEvent());

    expect(result.status).toBe("queued");
    expect(deliveryCount).toBe(1);
    expect(errors).toEqual([{
      message: "Speaker.bot TTS playback failed. Visual and audio alert playback continued.",
      context: {
        module: "tts",
        source: "tts.remote-trigger.failed",
        correlationId: "ref-tts-failure",
        processingId: null,
        metadata: { providerId: "speakerbot", sourceEventId: "event-cheer", ruleId: "rule-speakerbot-failure" }
      }
    }]);
    expect(JSON.stringify(errors)).not.toContain("token=secret");
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

    expect(requestedEditorIds).toEqual(["variant-special"]);
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
    readonly assetRepository?: Pick<AssetRepository, "findManyByIds">;
    readonly additionalTargets?: readonly AlertResolverTarget[];
    readonly queue?: PlaybackQueue;
    readonly overlayPlaybackSink?: OverlayPlaybackInstructionSink;
    readonly findEditorDocument?: (alertId: string) => Promise<AlertEditorDocument | null>;
    readonly ttsService?: Pick<TtsService, "createPlaybackInstructionFromModeratedText">;
    readonly logger?: Pick<Logger, "error">;
    readonly generateReferenceId?: () => string;
    readonly persistPlaybackSafetyState?: (patch: Partial<PlaybackSafetyState>) => Promise<PlaybackSafetyState>;
    readonly clock?: MutableClock;
    readonly random?: () => number;
    readonly audioPlaybackSink?: AudioPlaybackSink;
    readonly audioOutputService?: PlaybackCoordinatorDependencies["audioOutputService"];
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
    ...(options.audioPlaybackSink === undefined ? {} : { audioPlaybackSink: options.audioPlaybackSink }),
    ...(options.audioOutputService === undefined ? {} : { audioOutputService: options.audioOutputService }),
    ...(options.findEditorDocument === undefined ? {} : {
      findEditorDocuments: async (editorIds: readonly string[]) => new Map(
        (await Promise.all(editorIds.map(async (editorId) => [
          editorId,
          await options.findEditorDocument!(editorId)
        ] as const))).flatMap(([editorId, document]) => document === null ? [] : [[editorId, document]])
      )
    }),
    ...(options.ttsService === undefined ? {} : { ttsService: options.ttsService }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    ...(options.generateReferenceId === undefined ? {} : { generateReferenceId: options.generateReferenceId }),
    ...(options.persistPlaybackSafetyState === undefined
      ? {}
      : { persistPlaybackSafetyState: options.persistPlaybackSafetyState })
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

class InMemoryAssetRepository implements Pick<AssetRepository, "findManyByIds"> {
  requestedIds: readonly string[] = [];

  constructor(readonly mediaTypes: Readonly<Record<string, "image" | "gif" | "video" | "audio">>) {}

  async findManyByIds(assetIds: readonly string[]) {
    this.requestedIds = [...assetIds];
    return new Map(assetIds.flatMap((assetId) => {
      const mediaType = this.mediaTypes[assetId];
      return mediaType === undefined
        ? []
        : [[assetId, {
          id: assetId,
          originalFileName: assetId + ".bin",
          mediaType,
          mimeType: "application/octet-stream",
          sizeBytes: 1,
          checksum: "sha256:test",
          storagePath: "/assets/" + assetId
        }] as const];
    }));
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

function createRemoteTtsAlert(sourceEventId: string, text: string): ResolvedAlert {
  const alert = createResolvedAlert(sourceEventId, `resolved-${text}`, `instruction-${text}`);
  return {
    ...alert,
    overlayInstruction: {
      ...alert.overlayInstruction,
      tts: {
        mode: "remote-trigger",
        text,
        audioAssetId: null,
        providerPayload: {
          providerId: "speakerbot",
          layerId: "layer-tts"
        }
      }
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
          audio: [],
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
    outputs: { browserSource: true, deviceRouteIds: [] },
    layers: [
      {
        id: "layer-primary",
        name: "Primary",
        type: "text",
        visible: true,
        order: 0,
        animation,
        template: "Primary {actor.displayName}",
        textStyle: structuredClone(compatibilityAlertTextStyle),
        boxStyle: structuredClone(compatibilityAlertTextBoxStyle)
      },
      {
        id: "layer-secondary",
        name: "Secondary",
        type: "text",
        visible: true,
        order: 1,
        animation,
        template: "Secondary {actor.displayName}",
        textStyle: structuredClone(compatibilityAlertTextStyle),
        boxStyle: structuredClone(compatibilityAlertTextBoxStyle)
      }
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function deviceAudio(): ResolvedAlertAudio {
  return { documentId: "document", durationMs: 3000,
    outputs: { browserSource: false, deviceRouteIds: ["personal"] },
    layers: [{ layerId: "sound", assetId: "tone", volume: 0.5 }] };
}

function audioFixture() {
  const finished = deferred<DeviceAudioResult>();
  const sink = {
    play: vi.fn<AudioPlaybackSink["play"]>(() => finished.promise),
    stop: vi.fn<AudioPlaybackSink["stop"]>(async () => {}),
    setMuted: vi.fn<AudioPlaybackSink["setMuted"]>(async () => {}),
    close: vi.fn<AudioPlaybackSink["close"]>(async () => {})
  };
  const audioOutputService = {
    preparePlayback: vi.fn(async (playbackId: string, audio: readonly ResolvedAlertAudio[]) => ({
      unavailableRouteIds: [] as string[], batches: audio.map(item => ({
        playbackId, documentId: item.documentId, durationMs: item.durationMs, layers: item.layers, muted: false,
        destinations: [{ deviceId: "a", routeIds: [...item.outputs.deviceRouteIds] }]
      }))
    }))
  };
  return { finished, sink, dependencies: { audioPlaybackSink: sink, audioOutputService } };
}
