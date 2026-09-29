import { describe, expect, it, vi } from "vitest";
import type { AssetRecord, DeviceAudioBatch, TimerRunState } from "@stream-jams/core";
import { TimerCueService } from "./timer-cue-service.js";

const audioAsset: AssetRecord = {
  id: "bell", originalFileName: "bell.wav", mediaType: "audio", mimeType: "audio/wav",
  sizeBytes: 12, checksum: `sha256:${"a".repeat(64)}`, storagePath: "audio/bell.wav", durationMs: 1_250
};

function run(outputs = { browserSource: true, deviceRouteIds: ["speakers", "speakers", "headphones"] }): TimerRunState {
  return {
    status: "running",
    definitionId: "cats",
    generation: "run-1",
    snapshot: {
      id: "cats", label: "Cat paws", durationMs: 10_000, iconAssetId: null,
      startAudioAssetId: "bell", endAudioAssetId: "bell", outputs
    },
    startedAtEpochMs: 1_000,
    endsAtEpochMs: 11_000
  };
}

function setup(asset: AssetRecord | null = audioAsset) {
  const browser = { play: vi.fn(), stop: vi.fn() };
  const batches: DeviceAudioBatch[] = [{
    playbackId: "run-1", documentId: "timer:cats:start", durationMs: 1_250, muted: false,
    layers: [{ sourceKind: "audio", layerId: "timer-cue", assetId: "bell", volume: 1, playbackDurationMs: 1_250 }],
    destinations: [{ routeIds: ["speakers"], deviceId: "device-a" }]
  }];
  const audioOutputService = {
    preparePlayback: vi.fn().mockResolvedValue({ batches, unavailableRouteIds: ["headphones"] })
  };
  const audioPlaybackSink = { play: vi.fn().mockResolvedValue({ failedRouteIds: [] }), stop: vi.fn().mockResolvedValue(undefined) };
  const logger = { error: vi.fn().mockResolvedValue(undefined) };
  const service = new TimerCueService({
    assets: { findById: vi.fn().mockResolvedValue(asset) },
    browser,
    audioOutputService,
    audioPlaybackSink,
    logger,
    generateReferenceId: () => "reference-1"
  });
  return { service, browser, audioOutputService, audioPlaybackSink, logger };
}

describe("TimerCueService", () => {
  it("does not admit cues whose asset lookup completes after Stop", async () => {
    let release!: (asset: AssetRecord) => void;
    const browser = { play: vi.fn(), stop: vi.fn() };
    const service = new TimerCueService({ assets: { findById: () => new Promise<AssetRecord>(resolve => { release = resolve; }) }, browser });
    const playing = service.play({ cue: "start", run: run() });
    await service.stop("run-1");
    release(audioAsset);
    await playing;
    expect(browser.play).not.toHaveBeenCalled();
  });

  it("does not admit device cues whose preparation completes after Stop", async () => {
    const { service, audioOutputService, audioPlaybackSink } = setup();
    let release!: (value: { batches: DeviceAudioBatch[]; unavailableRouteIds: string[] }) => void;
    const prepared = await audioOutputService.preparePlayback();
    audioOutputService.preparePlayback.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const playing = service.play({ cue: "start", run: run() });
    await vi.waitFor(() => expect(release).toBeDefined());
    await service.stop("run-1");
    release(prepared);
    await playing;
    expect(audioPlaybackSink.play).not.toHaveBeenCalled();
  });
  it("normalizes one browser cue and one routed device admission from the run snapshot", async () => {
    const { service, browser, audioOutputService, audioPlaybackSink, logger } = setup();
    await service.play({ cue: "start", run: run() });

    expect(browser.play).toHaveBeenCalledWith(expect.objectContaining({
      id: "timer-cue:run-1:start",
      moduleId: "timers",
      audio: { assetId: "bell", volume: 1, sourceKind: "audio", playbackDurationMs: 1_250 },
      durationMs: 1_250
    }));
    expect(audioOutputService.preparePlayback).toHaveBeenCalledWith("run-1", [{
      documentId: "timer:cats:start",
      durationMs: 1_250,
      outputs: { browserSource: false, deviceRouteIds: ["speakers", "headphones"] },
      layers: [{ sourceKind: "audio", layerId: "timer-cue", assetId: "bell", volume: 1, playbackDurationMs: 1_250 }]
    }]);
    expect(audioPlaybackSink.play).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("unavailable"), expect.objectContaining({
      metadata: expect.objectContaining({ unavailableRouteIds: ["headphones"] })
    }));
  });

  it("uses the end asset, skips absent cues, and does not duplicate named routes", async () => {
    const { service, audioOutputService } = setup();
    const running = run();
    const completed: TimerRunState = {
      status: "completed",
      definitionId: running.definitionId,
      generation: running.generation,
      snapshot: running.snapshot,
      completedAtEpochMs: 11_000,
      expiresAtEpochMs: 14_000
    };
    await service.play({ cue: "end", run: completed });
    expect(audioOutputService.preparePlayback).toHaveBeenCalledWith("run-1", [expect.objectContaining({
      documentId: "timer:cats:end", outputs: { browserSource: false, deviceRouteIds: ["speakers", "headphones"] }
    })]);

    const original = run();
    const withoutCue: TimerRunState = { ...original, snapshot: { ...original.snapshot, startAudioAssetId: null } };
    await service.play({ cue: "start", run: withoutCue });
    expect(audioOutputService.preparePlayback).toHaveBeenCalledTimes(1);
  });

  it("isolates browser, preparation, device, missing-asset, and diagnostic failures", async () => {
    const { service, browser, audioOutputService, audioPlaybackSink, logger } = setup();
    browser.play.mockImplementation(() => { throw new Error("browser failed"); });
    audioPlaybackSink.play.mockRejectedValueOnce(new Error("device failed"));
    logger.error.mockRejectedValue(new Error("logger failed"));
    await expect(service.play({ cue: "start", run: run() })).resolves.toBeUndefined();

    audioOutputService.preparePlayback.mockRejectedValueOnce(new Error("prepare failed"));
    await expect(service.play({ cue: "start", run: run() })).resolves.toBeUndefined();
    const missing = setup(null);
    await expect(missing.service.play({ cue: "start", run: run() })).resolves.toBeUndefined();
  });

  it("stops browser and device playback owned by a generation", async () => {
    const { service, browser, audioPlaybackSink } = setup();
    await service.stop("run-1");
    expect(browser.stop).toHaveBeenCalledWith(["timer-cue:run-1:start", "timer-cue:run-1:end"]);
    expect(audioPlaybackSink.stop).toHaveBeenCalledWith("run-1");
  });
});
