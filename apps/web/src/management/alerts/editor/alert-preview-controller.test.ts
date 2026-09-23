import { type AlertEditorDocument } from "@stream-jams/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAlertPreviewController,
  type AlertPreviewAudioElement,
  type AlertPreviewFailure
} from "./alert-preview-controller.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("createAlertPreviewController", () => {
  it("owns the preview clock and playback controls", async () => {
    let now = 100;
    const controller = createController({ now: () => now });

    await controller.start(startInput(documentWithoutMedia()));
    expect(controller.getSnapshot()).toEqual({ active: true, playing: true, elapsedMs: 0, durationMs: 5_000, runId: 1 });

    now = 1_100;
    controller.pause();
    expect(controller.getSnapshot()).toMatchObject({ active: true, playing: false, elapsedMs: 1_000 });

    controller.seek(2_000);
    controller.play();
    now = 1_600;
    controller.pause();
    expect(controller.getSnapshot()).toMatchObject({ playing: false, elapsedMs: 2_500 });

    controller.stop();
    expect(controller.getSnapshot()).toMatchObject({ active: false, playing: false, elapsedMs: 0, durationMs: 0 });
  });

  it("finishes naturally at the document duration", async () => {
    vi.useFakeTimers();
    const controller = createController();

    await controller.start(startInput({ ...documentWithoutMedia(), durationMs: 1_000 }));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(controller.getSnapshot()).toEqual({ active: true, playing: false, elapsedMs: 1_000, durationMs: 1_000, runId: 1 });
  });

  it("bounds preparation and ignores a blob that arrives after the deadline", async () => {
    vi.useFakeTimers();
    let resolveBlob!: (blob: Blob) => void;
    const failures: AlertPreviewFailure[] = [];
    const createAudio = vi.fn();
    const controller = createController({
      getAssetFile: () => new Promise((resolve) => { resolveBlob = resolve; }),
      createAudio,
      onError: (failure) => failures.push(failure),
      preparationTimeoutMs: 5_000
    });

    const started = controller.start(startInput({ ...documentWithAudio(), durationMs: 30_000 }));
    await vi.advanceTimersByTimeAsync(5_000);
    await started;

    expect(failures).toEqual([expect.objectContaining({ summary: "Local preview media could not be played" })]);
    resolveBlob(new Blob(["late"]));
    await Promise.resolve();
    expect(createAudio).not.toHaveBeenCalled();
  });

  it("cancels a superseded start before it can allocate media", async () => {
    let resolveFirst!: (blob: Blob) => void;
    let resolveSecond!: (blob: Blob) => void;
    const getAssetFile = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const createAudio = vi.fn(() => readyAudio());
    const controller = createController({ getAssetFile, createAudio });

    const first = controller.start(startInput(documentWithAudio()));
    const second = controller.start(startInput(documentWithAudio()));
    resolveFirst(new Blob(["first"]));
    await first;
    expect(createAudio).not.toHaveBeenCalled();

    resolveSecond(new Blob(["second"]));
    await second;
    expect(createAudio).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().runId).toBe(2);
  });

  it("prevents pending work from allocating media after stop", async () => {
    let resolveBlob!: (blob: Blob) => void;
    const createAudio = vi.fn();
    const controller = createController({
      getAssetFile: () => new Promise((resolve) => { resolveBlob = resolve; }),
      createAudio
    });

    const started = controller.start(startInput(documentWithAudio()));
    controller.stop();
    resolveBlob(new Blob(["late"]));
    await started;

    expect(createAudio).not.toHaveBeenCalled();
    expect(controller.getSnapshot().active).toBe(false);
  });

  it("releases media and permanently rejects new work after disposal", async () => {
    const audio = readyAudio();
    const gain = { setGain: vi.fn(), dispose: vi.fn() };
    const revokeObjectUrl = vi.fn();
    const listener = vi.fn();
    const controller = createController({
      getAssetFile: async () => new Blob(["audio"]),
      createAudio: () => audio,
      createGainController: () => gain,
      revokeObjectUrl
    });
    controller.subscribe(listener);

    await controller.start(startInput(documentWithAudio()));
    controller.dispose();

    expect(audio.pause).toHaveBeenCalled();
    expect(gain.dispose).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:preview");
    expect(controller.getSnapshot().active).toBe(false);
    await expect(controller.start(startInput(documentWithoutMedia()))).rejects.toThrow("disposed");
  });

  it("cancels speech when disposed", async () => {
    const speech = { available: () => true, cancel: vi.fn(), speak: vi.fn() };
    const controller = createController({ speech });

    await controller.start({
      ...startInput(documentWithTts()),
      includeAudio: false,
      includeTts: true,
      ttsTextByLayerId: { tts: "Moderated speech" }
    });
    controller.dispose();

    expect(speech.speak).toHaveBeenCalledWith("Moderated speech");
    expect(speech.cancel).toHaveBeenCalledTimes(2);
  });
});

function createController(overrides: Partial<Parameters<typeof createAlertPreviewController>[0]> = {}) {
  return createAlertPreviewController({
    getAssetFile: overrides.getAssetFile ?? (async () => new Blob(["audio"])),
    getVisualAssetMediaTypes: () => ({}),
    getAssetDurations: () => ({}),
    now: () => 0,
    requestFrame: () => 1,
    cancelFrame: () => undefined,
    createObjectUrl: () => "blob:preview",
    revokeObjectUrl: () => undefined,
    createAudio: () => readyAudio(),
    createGainController: () => ({ setGain: () => undefined, dispose: () => undefined }),
    speech: { available: () => true, cancel: () => undefined, speak: () => undefined },
    onError: () => undefined,
    ...overrides
  });
}

function readyAudio(): AlertPreviewAudioElement {
  return {
    readyState: 1,
    currentTime: 0,
    volume: 1,
    src: "blob:preview",
    onended: null,
    onloadedmetadata: null,
    onerror: null,
    play: vi.fn(async () => undefined),
    pause: vi.fn()
  } as unknown as AlertPreviewAudioElement;
}

function startInput(document: AlertEditorDocument) {
  return { document, ttsTextByLayerId: {}, includeAudio: true, includeTts: false };
}

function documentWithoutMedia(): AlertEditorDocument {
  return { ...baseDocument(), layers: [] };
}

function documentWithAudio(): AlertEditorDocument {
  return {
    ...baseDocument(),
    layers: [{
      id: "audio",
      name: "Audio",
      type: "audio",
      visible: true,
      order: 0,
      assetId: "asset-audio",
      volume: 1,
      animation: previewAnimation()
    }]
  };
}

function documentWithTts(): AlertEditorDocument {
  return {
    ...baseDocument(),
    layers: [{
      id: "tts",
      name: "Speech",
      type: "tts",
      visible: true,
      order: 0,
      enabled: true,
      providerId: "provider",
      template: "Hello",
      animation: previewAnimation()
    }]
  };
}

function previewAnimation() {
  return { mode: "preset" as const, entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" };
}

function baseDocument(): AlertEditorDocument {
  return {
    schemaVersion: 1,
    id: "alert",
    setId: "set",
    providerKind: "twitch",
    eventType: "follow",
    kind: "default",
    parentAlertId: null,
    name: "Alert",
    enabled: true,
    conditions: [],
    variantConditions: [],
    weight: 1,
    priority: null,
    cooldownSeconds: 0,
    rulePriority: 0,
    durationMs: 5_000,
    outputs: { browserSource: true, deviceRouteIds: [] },
    layers: [],
    targetProfiles: [],
    samplePayloads: []
  };
}
