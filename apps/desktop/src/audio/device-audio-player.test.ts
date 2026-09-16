import type { DeviceAudioBatch } from "@stream-jams/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeviceAudioPlayer,
  type AudioPlayerAsset,
  type DeviceAudioPlayerDependencies,
  type PlayerMediaElement
} from "./device-audio-player.js";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

interface ElementControl {
  readonly sink?: Deferred<void>;
  readonly play?: Deferred<void>;
  readonly sinkError?: Error;
  readonly playError?: Error;
}

class TestMediaElement implements PlayerMediaElement {
  currentTime = 0;
  readyState = 1;
  seeking = false;
  volume = 1;
  muted = false;
  readonly sinkIds: string[] = [];
  readonly mutedAtPlay: boolean[] = [];
  playCount = 0;
  pauseCount = 0;
  loadCount = 0;
  removeCount = 0;
  sourceRemoveCount = 0;
  readonly listeners = new Map<string, Set<EventListener>>();

  constructor(readonly control: ElementControl = {}) {}

  async setSinkId(id: string): Promise<void> {
    this.sinkIds.push(id);
    if (this.control.sinkError !== undefined) throw this.control.sinkError;
    if (this.control.sink !== undefined) await this.control.sink.promise;
  }

  async play(): Promise<void> {
    this.playCount += 1;
    this.mutedAtPlay.push(this.muted);
    if (this.control.playError !== undefined) throw this.control.playError;
    if (this.control.play !== undefined) await this.control.play.promise;
  }

  pause(): void { this.pauseCount += 1; }
  load(): void { this.loadCount += 1; }
  remove(): void { this.removeCount += 1; }
  removeAttribute(name: string): void { if (name === "src") this.sourceRemoveCount += 1; }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: "ended" | "error" | "loadedmetadata" | "seeked"): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(new Event(type));
  }

  get cleaned(): boolean {
    return this.pauseCount > 0 && this.loadCount > 0 && this.removeCount > 0 && this.sourceRemoveCount > 0 &&
      [...this.listeners.values()].every((listeners) => listeners.size === 0);
  }
}

interface Harness {
  readonly player: DeviceAudioPlayer;
  readonly elements: TestMediaElement[];
  readonly sourcedAssetIds: string[];
  readonly revokedSources: string[];
  readonly listOutputDevices: ReturnType<typeof vi.fn<DeviceAudioPlayerDependencies["listOutputDevices"]>>;
}

function createHarness(options: {
  readonly controls?: readonly ElementControl[];
  readonly createSource?: DeviceAudioPlayerDependencies["createSource"];
  readonly listOutputDevices?: DeviceAudioPlayerDependencies["listOutputDevices"];
  readonly now?: () => number;
} = {}): Harness {
  const elements: TestMediaElement[] = [];
  const sourcedAssetIds: string[] = [];
  const revokedSources: string[] = [];
  const listOutputDevices = vi.fn(options.listOutputDevices ?? (async () => [
    { deviceId: "headphones", label: "Headphones" },
    { deviceId: "stream-mix", label: "Stream mix" }
  ]));
  const player = new DeviceAudioPlayer({
    createElement() {
      const element = new TestMediaElement(options.controls?.[elements.length]);
      elements.push(element);
      return element;
    },
    createSource(asset) {
      sourcedAssetIds.push(asset.assetId);
      return options.createSource?.(asset) ?? `blob:${asset.assetId}:${sourcedAssetIds.length}`;
    },
    revokeSource(source) { revokedSources.push(source); },
    listOutputDevices,
    ...(options.now === undefined ? {} : { now: options.now })
  });
  return { player, elements, sourcedAssetIds, revokedSources, listOutputDevices };
}

const assets: readonly AudioPlayerAsset[] = [
  { assetId: "shared-sound", mimeType: "audio/wav", bytes: new Uint8Array([1, 2, 3]) }
];

function batch(overrides: Partial<DeviceAudioBatch> = {}): DeviceAudioBatch {
  return {
    playbackId: "occurrence-1",
    documentId: "document-1",
    durationMs: 10_000,
    muted: false,
    layers: [
      { sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.25 },
      { sourceKind: "audio", layerId: "sting", assetId: "shared-sound", volume: 0.75 }
    ],
    destinations: [
      { deviceId: "headphones", routeIds: ["personal"] },
      { deviceId: "stream-mix", routeIds: ["broadcast"] }
    ],
    ...overrides
  };
}

async function flushStarts(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

describe("DeviceAudioPlayer", () => {
  it("waits for the common epoch and cancels pending timed starts without replay", async () => {
    const audio = createHarness();
    audio.player.initialize(1, false);
    const timedBatch = batch({ timing: { startsAtEpochMs: 1100, endsAtEpochMs: 11100 } });
    const playing = audio.player.play({ generation: 1, batch: timedBatch, assets, deadlineMs: 11100 });
    await vi.advanceTimersByTimeAsync(99);
    expect(audio.elements.every(element => element.playCount === 0)).toBe(true);
    audio.player.stop(timedBatch.playbackId);
    await vi.advanceTimersByTimeAsync(1);
    await expect(playing).resolves.toEqual({ failedRouteIds: [] });
    expect(audio.elements.every(element => element.playCount === 0 && element.cleaned)).toBe(true);
  });

  it("seeks delayed metadata to the shared offset while retaining current mute", async () => {
    const sink = deferred();
    const audio = createHarness({ controls: [{ sink }] });
    audio.player.initialize(1, false);
    const timedBatch = batch({ timing: { startsAtEpochMs: 1100, endsAtEpochMs: 11100 },
      layers: [{ sourceKind: "audio", layerId: "one", assetId: "shared-sound", volume: 0.4 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }] });
    const playing = audio.player.play({ generation: 1, batch: timedBatch, assets, deadlineMs: 11100 });
    audio.elements[0]!.readyState = 0;
    sink.resolve();
    await vi.advanceTimersByTimeAsync(2600);
    expect(audio.elements[0]!.playCount).toBe(0);
    audio.player.setMuted(true);
    audio.elements[0]!.readyState = 1;
    audio.elements[0]!.emit("loadedmetadata");
    await flushStarts();
    expect(audio.elements[0]!.currentTime).toBe(2.5);
    expect(audio.elements[0]!.mutedAtPlay).toEqual([true]);
    audio.elements[0]!.emit("ended");
    await expect(playing).resolves.toEqual({ failedRouteIds: [] });
    expect(audio.elements[0]!.cleaned).toBe(true);
  });
  it("uses only the startup budget remaining after upstream asset and transport work", async () => {
    let now = 4500;
    const sink = deferred<void>();
    const audio = createHarness({ controls: [{ sink }], now: () => now });
    audio.player.initialize(1, false);
    const playing = audio.player.play({ generation: 1, batch: batch({
      layers: [{ sourceKind: "audio", layerId: "one", assetId: "shared-sound", volume: 1 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    }), assets, startDeadlineMs: 5000, deadlineMs: 30_000 });
    now = 5100; sink.resolve(); await flushStarts();
    expect(audio.elements[0]!.playCount).toBe(0);
    expect(await playing).toEqual({ failedRouteIds: ["personal"] });
    audio.player.close();
  });

  it.each([2000, 30_000])("rechecks absolute start deadlines when sink selection resolves before delayed timers (%i)", async deadlineMs => {
    let now = 1000;
    const sink = deferred<void>();
    const audio = createHarness({ controls: [{ sink }], now: () => now });
    audio.player.initialize(1, false);
    const playing = audio.player.play({ generation: 1, batch: batch({
      layers: [{ sourceKind: "audio", layerId: "one", assetId: "shared-sound", volume: 1 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    }), assets, deadlineMs });
    now = deadlineMs === 2000 ? 3000 : 7000;
    sink.resolve();
    await flushStarts();
    expect(audio.elements[0]!.playCount).toBe(0);
    expect(await playing).toEqual({ failedRouteIds: ["personal"] });
    audio.player.close();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates one source per asset and one independently bound element per layer and device", async () => {
    const audio = createHarness();
    audio.player.initialize(1, false);

    const result = audio.player.play({ generation: 1, batch: batch(), assets, deadlineMs: 11_000 });
    await flushStarts();

    expect(audio.sourcedAssetIds).toEqual(["shared-sound"]);
    expect(audio.elements).toHaveLength(4);
    expect(audio.elements.map((element) => element.sinkIds)).toEqual([
      ["headphones"], ["headphones"], ["stream-mix"], ["stream-mix"]
    ]);
    expect(audio.elements.map((element) => element.volume)).toEqual([0.25, 0.75, 0.25, 0.75]);
    expect(audio.elements.every((element) => element.playCount === 1)).toBe(true);

    for (const element of audio.elements) element.emit("ended");
    await expect(result).resolves.toEqual({ failedRouteIds: [] });
    expect(audio.elements.every((element) => element.cleaned)).toBe(true);
    expect(audio.revokedSources).toHaveLength(1);
  });

  it("fails only the affected routes when one media start fails", async () => {
    const audio = createHarness({ controls: [{ sinkError: new Error("device rejected") }] });
    audio.player.initialize(1, false);

    const result = audio.player.play({ generation: 1, batch: batch(), assets, deadlineMs: 11_000 });
    await flushStarts();
    for (const element of audio.elements) if (element.playCount > 0) element.emit("ended");

    await expect(result).resolves.toEqual({ failedRouteIds: ["personal"] });
    expect(audio.elements.slice(2).every((element) => element.playCount === 1)).toBe(true);
  });

  it("prevents late play when stopped during pending sink selection", async () => {
    const sink = deferred();
    const audio = createHarness({ controls: [{ sink }] });
    audio.player.initialize(1, false);
    const oneOutput = batch({
      layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.25 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });

    const result = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 11_000 });
    await flushStarts();
    audio.player.stop(oneOutput.playbackId);
    sink.resolve();

    await expect(result).resolves.toEqual({ failedRouteIds: [] });
    await flushStarts();
    expect(audio.elements[0]?.playCount).toBe(0);
    expect(audio.elements[0]?.cleaned).toBe(true);
  });

  it("reapplies the latest authoritative mute immediately before play", async () => {
    const sink = deferred();
    const audio = createHarness({ controls: [{ sink }] });
    audio.player.initialize(1, false);
    const oneOutput = batch({
      layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.25 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });

    const result = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 11_000 });
    await flushStarts();
    audio.player.setMuted(true);
    sink.resolve();
    await flushStarts();

    expect(audio.elements[0]?.mutedAtPlay).toEqual([true]);
    audio.elements[0]?.emit("ended");
    await result;
  });

  it("cancels the old generation and applies the incoming generation mute", async () => {
    const oldSink = deferred();
    const audio = createHarness({ controls: [{ sink: oldSink }, {}] });
    const oneOutput = batch({
      layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.25 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });
    audio.player.initialize(1, false);
    const oldResult = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 11_000 });
    await flushStarts();

    audio.player.initialize(2, true);
    oldSink.resolve();
    await expect(oldResult).resolves.toEqual({ failedRouteIds: [] });
    const newResult = audio.player.play({ generation: 2, batch: oneOutput, assets, deadlineMs: 11_000 });
    await flushStarts();

    expect(audio.elements[0]?.playCount).toBe(0);
    expect(audio.elements[1]?.mutedAtPlay).toEqual([true]);
    audio.elements[1]?.emit("ended");
    await newResult;
  });

  it("fails stale-generation work without allocating media", async () => {
    const audio = createHarness();
    audio.player.initialize(2, false);

    await expect(audio.player.play({ generation: 1, batch: batch(), assets, deadlineMs: 11_000 }))
      .resolves.toEqual({ failedRouteIds: ["personal", "broadcast"] });
    expect(audio.sourcedAssetIds).toEqual([]);
    expect(audio.elements).toEqual([]);
  });

  it("rejects duplicate active occurrence/document work", async () => {
    const sink = deferred();
    const audio = createHarness({ controls: [{ sink }] });
    audio.player.initialize(1, false);
    const oneOutput = batch({
      layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.25 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });
    const first = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 11_000 });
    await flushStarts();

    await expect(audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 11_000 }))
      .rejects.toThrow("already active");
    audio.player.stop(oneOutput.playbackId);
    await first;
    const afterStopDuplicate = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 11_000 });
    audio.player.stop(oneOutput.playbackId);
    await expect(afterStopDuplicate).rejects.toThrow("already active");

    sink.resolve();
    await flushStarts();
    const replay = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 11_000 });
    await flushStarts();
    audio.elements[1]?.emit("ended");
    await replay;
  });

  it("bounds a cancelled occurrence tombstone when a media start never settles", async () => {
    const sink = deferred();
    const audio = createHarness({ controls: [{ sink }, {}] });
    audio.player.initialize(1, false);
    const oneOutput = batch({
      layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.25 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });
    const first = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 20_000 });
    await flushStarts();
    audio.player.stop(oneOutput.playbackId);
    await first;

    const beforeExpiryDuplicate = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 20_000 });
    audio.player.stop(oneOutput.playbackId);
    await expect(beforeExpiryDuplicate).rejects.toThrow("already active");
    await vi.advanceTimersByTimeAsync(5_000);

    const replay = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 20_000 });
    await flushStarts();
    audio.elements[1]?.emit("ended");
    await replay;
  });

  it("rejects impossible batches and assets before allocating media", async () => {
    const audio = createHarness();
    audio.player.initialize(1, false);

    const invalidRequests = [
      { batch: batch({ destinations: [{ deviceId: "default", routeIds: ["personal"] }] }), assets },
      { batch: batch(), assets: [...assets, { ...assets[0]!, bytes: new Uint8Array([9]) }] },
      { batch: batch(), assets: [{ ...assets[0]!, bytes: new Uint8Array(25 * 1024 * 1024 + 1) }] },
      { batch: batch(), assets: [{ ...assets[0]!, mimeType: "audio/flac" }] },
      { batch: batch({ layers: [] }), assets },
      { batch: batch({ destinations: [] }), assets }
    ];

    for (const request of invalidRequests) {
      const rejected = audio.player.play({ generation: 1, ...request, deadlineMs: 11_000 });
      audio.player.stop(request.batch.playbackId);
      await expect(rejected).rejects.toThrow();
    }
    expect(audio.sourcedAssetIds).toEqual([]);
    expect(audio.elements).toEqual([]);
  });

  it("marks routes for omitted asset layers failed while healthy layers still play", async () => {
    const audio = createHarness();
    audio.player.initialize(1, false);
    const partial = batch({
      layers: [
        { sourceKind: "audio", layerId: "healthy", assetId: "shared-sound", volume: 0.25 },
        { sourceKind: "audio", layerId: "missing", assetId: "omitted-invalid-sound", volume: 0.75 }
      ]
    });

    const result = audio.player.play({ generation: 1, batch: partial, assets, deadlineMs: 11_000 });
    void result.catch(() => undefined);
    await flushStarts();

    expect(audio.sourcedAssetIds).toEqual(["shared-sound"]);
    expect(audio.elements).toHaveLength(2);
    expect(audio.elements.every((element) => element.playCount === 1)).toBe(true);
    for (const element of audio.elements) element.emit("ended");
    await expect(result).resolves.toEqual({ failedRouteIds: ["personal", "broadcast"] });
  });

  it("contains source creation failure to the affected media while healthy assets still play", async () => {
    const audio = createHarness({
      createSource(asset) {
        if (asset.assetId === "broken-sound") throw new Error("blob creation failed");
        return "healthy-source";
      }
    });
    audio.player.initialize(1, false);
    const partial = batch({ layers: [
      { sourceKind: "audio", layerId: "healthy", assetId: "shared-sound", volume: 0.25 },
      { sourceKind: "audio", layerId: "broken", assetId: "broken-sound", volume: 0.75 }
    ] });
    const partialAssets: readonly AudioPlayerAsset[] = [
      ...assets,
      { assetId: "broken-sound", mimeType: "audio/ogg", bytes: new Uint8Array([4, 5, 6]) }
    ];

    const result = audio.player.play({ generation: 1, batch: partial, assets: partialAssets, deadlineMs: 11_000 });
    void result.catch(() => undefined);
    await flushStarts();

    expect(audio.elements).toHaveLength(2);
    for (const element of audio.elements) element.emit("ended");
    await expect(result).resolves.toEqual({ failedRouteIds: ["personal", "broadcast"] });
  });

  it("uses the absolute dispatch deadline without extending playback for startup", async () => {
    const audio = createHarness();
    audio.player.initialize(1, false);
    const oneOutput = batch({
      layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.25 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });

    const result = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 1_300 });
    await flushStarts();
    await vi.advanceTimersByTimeAsync(299);
    expect(audio.elements[0]?.cleaned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ failedRouteIds: [] });
    expect(audio.elements[0]?.cleaned).toBe(true);
  });

  it("fails and cleans a start that exceeds five seconds without allowing late play", async () => {
    const sink = deferred();
    const audio = createHarness({ controls: [{ sink }] });
    audio.player.initialize(1, false);
    const oneOutput = batch({
      layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.25 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });

    const result = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 20_000 });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(audio.elements[0]?.cleaned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ failedRouteIds: ["personal"] });
    expect(audio.elements[0]?.cleaned).toBe(true);
    sink.resolve();
    await flushStarts();
    expect(audio.elements[0]?.playCount).toBe(0);
  });

  it("stops only destinations that disappear during device reconciliation", async () => {
    let devices = [
      { deviceId: "headphones", label: "Headphones" },
      { deviceId: "stream-mix", label: "Stream mix" }
    ];
    const audio = createHarness({ listOutputDevices: async () => devices });
    audio.player.initialize(1, false);
    const result = audio.player.play({ generation: 1, batch: batch(), assets, deadlineMs: 11_000 });
    await flushStarts();

    devices = [{ deviceId: "stream-mix", label: "Renamed label is irrelevant" }];
    await audio.player.reconcileDevices();

    expect(audio.elements.slice(0, 2).every((element) => element.cleaned)).toBe(true);
    expect(audio.elements.slice(2).every((element) => !element.cleaned && element.playCount === 1)).toBe(true);
    for (const element of audio.elements.slice(2)) element.emit("ended");
    await expect(result).resolves.toEqual({ failedRouteIds: ["personal"] });
  });

  it("polls active devices every second with bounded non-overlapping enumeration", async () => {
    const enumeration = deferred<readonly { deviceId: string; label: string }[]>();
    const audio = createHarness({ listOutputDevices: () => enumeration.promise });
    audio.player.initialize(1, false);
    const oneOutput = batch({
      layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.25 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });
    const result = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 20_000 });
    await flushStarts();

    await vi.advanceTimersByTimeAsync(999);
    expect(audio.listOutputDevices).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(audio.listOutputDevices).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(audio.listOutputDevices).toHaveBeenCalledOnce();

    enumeration.resolve([{ deviceId: "headphones", label: "Headphones" }]);
    await flushStarts();
    audio.player.stop(oneOutput.playbackId);
    await result;
  });

  it("close cancels pending starts and leaves later work stale", async () => {
    const sink = deferred();
    const audio = createHarness({ controls: [{ sink }] });
    audio.player.initialize(1, false);
    const oneOutput = batch({
      layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.25 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });
    const result = audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 11_000 });
    await flushStarts();

    audio.player.close();
    sink.resolve();
    await expect(result).resolves.toEqual({ failedRouteIds: [] });
    await expect(audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 11_000 }))
      .resolves.toEqual({ failedRouteIds: ["personal"] });
    expect(audio.elements[0]?.playCount).toBe(0);
  });
});
