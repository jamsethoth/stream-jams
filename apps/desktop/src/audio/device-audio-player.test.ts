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
  readonly stalled?: boolean;
  readonly sink?: Deferred<void>;
  readonly play?: Deferred<void>;
  readonly sinkError?: Error;
  readonly playError?: Error;
}

class TestMediaElement implements PlayerMediaElement {
  private position = 0;
  private startedAt: number | null = null;
  get currentTime(): number { return this.position + (this.startedAt === null || this.control.stalled ? 0 : (Date.now() - this.startedAt) / 1000); }
  set currentTime(value: number) { this.position = value; if (this.startedAt !== null) this.startedAt = Date.now(); }
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
    this.startedAt = Date.now();
  }

  pause(): void { this.position = this.currentTime; this.startedAt = null; this.pauseCount += 1; }
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
  readonly createAmplifier?: DeviceAudioPlayerDependencies["createAmplifier"];
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
    ...(options.createAmplifier === undefined ? {} : { createAmplifier: options.createAmplifier }),
    ...(options.now === undefined ? {} : { now: options.now })
  });
  return { player, elements, sourcedAssetIds, revokedSources, listOutputDevices };
}

const assets: readonly AudioPlayerAsset[] = [
  privateAsset("shared-sound", "audio/wav")
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
  it("reports stalled playback instead of configured completion and cleans up", async () => {
    const audio = createHarness({ controls: Array.from({ length: 4 }, () => ({ stalled: true })) }); audio.player.initialize(1, false);
    const playing = audio.player.play({ generation: 1, batch: batch(), assets, deadlineMs: Date.now() + 1000 });
    await flushStarts(); await vi.advanceTimersByTimeAsync(1000);
    const result = await playing;
    expect(result.failedRouteIds).toEqual(["personal", "broadcast"]);
    expect(result.failures?.every(failure => failure.stage === "stall")).toBe(true);
    expect(result.outputDiagnostics).toHaveLength(4);
    expect(result.outputDiagnostics?.every(output => output.diagnostics.terminalOutcome === "failed" && output.diagnostics.completionReason === "stalled")).toBe(true);
    expect(audio.elements.every(element => element.cleaned)).toBe(true);
  });

  it("fails sustained stalled routes and plays the following occurrence", async () => {
    const audio = createHarness({ controls: [{ stalled: true }] }); audio.player.initialize(1, true);
    const selected = batch({ layers: [batch().layers[0]!], destinations: [batch().destinations[0]!] });
    const playing = audio.player.play({ generation: 1, batch: selected, assets, deadlineMs: Date.now() + 10000 });
    await flushStarts(); audio.elements[0]!.currentTime = 0.5;
    await vi.advanceTimersByTimeAsync(2250);
    expect(await playing).toMatchObject({ failedRouteIds: ["personal"], diagnostics: { terminalOutcome: "failed", completionReason: "stalled" }, failures: [{ stage: "stall" }] });
    await flushStarts();
    const next = audio.player.play({ generation: 1, batch: { ...selected, playbackId: "next" }, assets, deadlineMs: Date.now() + 1000 });
    await flushStarts(); await vi.advanceTimersByTimeAsync(1000);
    expect(await next).toMatchObject({ failedRouteIds: [], diagnostics: { terminalOutcome: "completed", completionReason: "configured-duration" } });
    expect(audio.elements[1]!.mutedAtPlay).toEqual([true]);
    expect(audio.elements.every(element => element.cleaned)).toBe(true);
    audio.player.close(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["device-bind", "play", "metadata", "seek", "decode"] as const)("retains %s failures only for selected failing routes while healthy audio completes", async stage => {
    const cause = new Error(`${stage} fixture failure`);
    const audio = createHarness({ controls: [stage === "device-bind" ? { sinkError: cause } : stage === "play" ? { playError: cause } : {}, {}] });
    audio.player.initialize(1, false);
    const selected = batch({ layers: [batch().layers[0]!], timing: { startsAtEpochMs: Date.now() - 500, endsAtEpochMs: Date.now() + 10000 } });
    const playing = audio.player.play({ generation: 1, batch: selected, assets, deadlineMs: Date.now() + 10000 });
    if (stage === "metadata") audio.elements[0]!.readyState = 0;
    if (stage === "seek") Object.defineProperty(audio.elements[0], "currentTime", { get: () => 0, set: () => { throw cause; } });
    await flushStarts();
    if (stage === "decode") audio.elements[0]!.emit("error");
    audio.elements[1]!.emit("ended");
    if (stage === "metadata") await vi.advanceTimersByTimeAsync(5000);
    const result = await playing;
    expect(result).toMatchObject({ failedRouteIds: ["personal"], failures: [{ routeIds: ["personal"], layerId: "intro", assetId: "shared-sound", stage, exception: expect.any(Object) }] });
    if (stage === "device-bind" || stage === "play") expect(result.failures?.[0]?.exception.message).toBe(cause.message);
    if (stage === "seek") expect(result.failures?.[0]?.exception.cause?.message).toBe(cause.message);
    expect(audio.elements.map(element => element.sinkIds)).toEqual([["headphones"], ["stream-mix"]]);
    expect(audio.elements.every(element => element.cleaned)).toBe(true);
  });

  it("preserves source creation failure without inventing audio destinations", async () => {
    const cause = new Error("blob creation failed");
    const audio = createHarness({ createSource: () => { throw cause; } });
    audio.player.initialize(1, false);
    const selected = batch({ layers: [batch().layers[0]!], destinations: [batch().destinations[0]!] });
    const result = await audio.player.play({ generation: 1, batch: selected, assets, deadlineMs: Date.now() + 10000 });
    expect(result).toMatchObject({ failedRouteIds: ["personal"], failures: [{ routeIds: ["personal"], stage: "source-load", exception: { message: cause.message } }] });
    expect(audio.elements).toHaveLength(0);
  });
  it("waits for the common epoch and cancels pending timed starts without replay", async () => {
    const audio = createHarness();
    audio.player.initialize(1, false);
    const timedBatch = batch({ timing: { startsAtEpochMs: 1100, endsAtEpochMs: 11100 } });
    const playing = audio.player.play({ generation: 1, batch: timedBatch, assets, deadlineMs: 11100 });
    await vi.advanceTimersByTimeAsync(99);
    expect(audio.elements.every(element => element.playCount === 0)).toBe(true);
    audio.player.stop(timedBatch.playbackId);
    await vi.advanceTimersByTimeAsync(1);
    await expect(playing).resolves.toMatchObject({ failedRouteIds: [] });
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
    await expect(playing).resolves.toMatchObject({ failedRouteIds: [] });
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
    expect(await playing).toMatchObject({ failedRouteIds: ["personal"], failures: [expectedFailure("personal", "one", "shared-sound", "device-bind", "Audio preparation deadline exceeded.")] });
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
    expect(await playing).toMatchObject({ failedRouteIds: ["personal"], failures: [expectedFailure("personal", "one", "shared-sound", "device-bind", "Audio preparation deadline exceeded.")] });
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
    await expect(result).resolves.toMatchObject({ failedRouteIds: [] });
    expect(audio.elements.every((element) => element.cleaned)).toBe(true);
    expect(audio.revokedSources).toHaveLength(1);
  });

  it("applies per-source fades from the shared absolute playback epoch", async () => {
    const audio = createHarness();
    audio.player.initialize(1, false);
    const faded = batch({
      durationMs: 4_000,
      timing: { startsAtEpochMs: 1_000, endsAtEpochMs: 5_000 },
      layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 0.8,
        fadeInMs: 1_000, fadeOutMs: 1_000, playbackDurationMs: 4_000 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });

    const result = audio.player.play({ generation: 1, batch: faded, assets, deadlineMs: 5_000 });
    await flushStarts();
    expect(audio.elements[0]?.volume).toBe(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(audio.elements[0]?.volume).toBeCloseTo(0.4);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(audio.elements[0]?.volume).toBeCloseTo(0.4);
    audio.elements[0]?.emit("ended");
    await result;
    const settledVolume = audio.elements[0]?.volume;
    await vi.advanceTimersByTimeAsync(100);
    expect(audio.elements[0]?.volume).toBe(settledVolume);
  });

  it("routes gain above 100 percent through an explicit-output amplifier", async () => {
    const gains: number[] = [];
    const dispose = vi.fn();
    const createAmplifier = vi.fn(async () => ({
      setGain(value: number) { gains.push(value); }, dispose
    }));
    const audio = createHarness({ createAmplifier });
    audio.player.initialize(1, false);
    const boosted = batch({
      layers: [{ sourceKind: "audio", layerId: "boost", assetId: "shared-sound", volume: 2 }],
      destinations: [{ deviceId: "headphones", routeIds: ["personal"] }]
    });
    const result = audio.player.play({ generation: 1, batch: boosted, assets, deadlineMs: 11_000 });
    await flushStarts();
    expect(createAmplifier).toHaveBeenCalledWith(audio.elements[0], "headphones");
    expect(gains).toContain(2);
    expect(audio.elements[0]!.sinkIds).toEqual([]);
    audio.elements[0]!.emit("ended");
    await result;
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("fails only the affected routes when one media start fails", async () => {
    const audio = createHarness({ controls: [{ sinkError: new Error("device rejected") }] });
    audio.player.initialize(1, false);

    const result = audio.player.play({ generation: 1, batch: batch(), assets, deadlineMs: 11_000 });
    await flushStarts();
    for (const element of audio.elements) if (element.playCount > 0) element.emit("ended");

    await expect(result).resolves.toMatchObject({ failedRouteIds: ["personal"], failures: [expectedFailure("personal", "intro", "shared-sound", "device-bind", "device rejected")] });
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

    await expect(result).resolves.toMatchObject({ failedRouteIds: [] });
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
    await expect(oldResult).resolves.toMatchObject({ failedRouteIds: [] });
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
      .resolves.toMatchObject({ failedRouteIds: ["personal", "broadcast"] });
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
    await expect(result).resolves.toMatchObject({ failedRouteIds: ["personal", "broadcast"], failures: ["personal", "broadcast"].map(route => expectedFailure(route, "missing", "omitted-invalid-sound", "source-load", "Audio asset was not prepared.")) });
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
      privateAsset("broken-sound", "audio/ogg")
    ];

    const result = audio.player.play({ generation: 1, batch: partial, assets: partialAssets, deadlineMs: 11_000 });
    void result.catch(() => undefined);
    await flushStarts();

    expect(audio.elements).toHaveLength(2);
    for (const element of audio.elements) element.emit("ended");
    await expect(result).resolves.toMatchObject({ failedRouteIds: ["personal", "broadcast"], failures: ["personal", "broadcast"].map(route => expectedFailure(route, "broken", "broken-sound", "source-load", "blob creation failed")) });
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

    await expect(result).resolves.toMatchObject({ failedRouteIds: [] });
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

    await expect(result).resolves.toMatchObject({ failedRouteIds: ["personal"], failures: [expectedFailure("personal", "intro", "shared-sound", "device-bind", "Audio preparation deadline exceeded.")] });
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
    await expect(result).resolves.toMatchObject({ failedRouteIds: ["personal"], failures: ["intro", "sting"].map(layer => expectedFailure("personal", layer, "shared-sound", "device-lost", "The selected audio device is no longer available.")) });
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
    await expect(result).resolves.toMatchObject({ failedRouteIds: [] });
    await expect(audio.player.play({ generation: 1, batch: oneOutput, assets, deadlineMs: 11_000 }))
      .resolves.toMatchObject({ failedRouteIds: ["personal"] });
    expect(audio.elements[0]?.playCount).toBe(0);
  });
});

function expectedFailure(route: string, layerId: string, assetId: string, stage: string, message: string) {
  return { routeIds: [route], layerId, assetId, stage, exception: { type: "Error", message, stack: expect.any(String), code: null, cause: null, thrownValue: null } };
}

it("classifies a stalled seek at the startup deadline as seek failure and cleans the element", async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const audio = createHarness(); audio.player.initialize(1, false);
  try {
    const playing = audio.player.play({ generation: 1, batch: batch({ timing: { startsAtEpochMs: 500, endsAtEpochMs: 11000 }, layers: [{ sourceKind: "audio", layerId: "intro", assetId: "shared-sound", volume: 1 }], destinations: [{ deviceId: "headphones", routeIds: ["personal"] }] }), assets, deadlineMs: 11000 });
    audio.elements[0]!.seeking = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(await playing).toMatchObject({ failedRouteIds: ["personal"], failures: [expectedFailure("personal", "intro", "shared-sound", "seek", "Audio preparation deadline exceeded.")] });
    expect(audio.elements[0]!.playCount).toBe(0);
    expect(audio.elements[0]!.cleaned).toBe(true);
  } finally { audio.player.close(); vi.useRealTimers(); }
});

it("prepares slow selected-device media silently and starts the held elements at zero", async () => {
  vi.useFakeTimers();
  const audio = createHarness();
  audio.player.initialize(1, false);
  const preparing = audio.player.prepare("prepared-1", { generation: 1, batch: batch(), assets, deadlineMs: Date.now() + 15000 });
  await vi.advanceTimersByTimeAsync(400);
  expect(audio.elements.every(element => element.playCount === 0)).toBe(true);
  for (const element of audio.elements) { element.readyState = 2; element.emit("loadedmetadata"); }
  await preparing;
  const playing = audio.player.start("prepared-1", Date.now() + 100);
  await vi.advanceTimersByTimeAsync(99);
  expect(audio.elements.every(element => element.playCount === 0)).toBe(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(audio.elements.every(element => element.playCount === 1 && element.currentTime === 0)).toBe(true);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await playing).toMatchObject({ failedRouteIds: [] });
  expect(audio.elements.every(element => element.cleaned)).toBe(true);
  audio.player.close();
  vi.useRealTimers();
});

it("keeps failed-route details for prepared batches and permits subsequent playback", async () => {
  vi.useFakeTimers();
  const audio = createHarness({ controls: [{ sinkError: new Error("disconnected") }] });
  audio.player.initialize(1, false);
  const selected = batch({ layers: [batch().layers[0]!], destinations: [batch().destinations[0]!] });
  await audio.player.prepare("failed", { generation: 1, batch: selected, assets, deadlineMs: Date.now() + 15000 });
  const failure = await audio.player.start("failed", Date.now() + 100);
  expect(failure).toMatchObject({ failedRouteIds: ["personal"], failures: [{ stage: "device-bind" }] });
  const next = audio.player.prepare("next", { generation: 1, batch: selected, assets, deadlineMs: Date.now() + 15000 });
  audio.elements.at(-1)!.readyState = 2;
  await next;
  const playing = audio.player.start("next", Date.now() + 100);
  await vi.advanceTimersByTimeAsync(100);
  expect(audio.elements.at(-1)!.playCount).toBe(1);
  audio.player.stop(selected.playbackId);
  await playing;
  audio.player.close();
  vi.useRealTimers();
});

it("releases held sources on stop and never replays cancelled preparations", async () => {
  vi.useFakeTimers();
  const audio = createHarness();
  audio.player.initialize(1, false);
  const preparing = audio.player.prepare("cancelled", { generation: 1, batch: batch(), assets, deadlineMs: Date.now() + 15000 });
  audio.player.stop("occurrence-1");
  await preparing;
  await expect(audio.player.start("cancelled", Date.now() + 100)).rejects.toThrow("no longer available");
  await vi.advanceTimersByTimeAsync(100);
  expect(audio.elements.every(element => element.cleaned && element.playCount === 0)).toBe(true);
  expect(audio.revokedSources).toHaveLength(1);
  audio.player.close();
  vi.useRealTimers();
});

it.each(["stop", "close"] as const)("%s immediately releases prepared and in-flight device bindings", async operation => {
  vi.useFakeTimers();
  const sink = deferred();
  const audio = createHarness({ controls: [{ sink }] });
  audio.player.initialize(1, false);
  try {
    const preparing = audio.player.prepare("held", { generation: 1, batch: batch(), assets, deadlineMs: Date.now() + 15000 });
    for (const element of audio.elements) element.readyState = 2;
    await flushStarts();
    if (operation === "stop") audio.player.stop("occurrence-1"); else audio.player.close();
    await preparing;
    await flushStarts();
    expect(audio.elements.every(element => element.cleaned && element.playCount === 0)).toBe(true);
    expect(audio.revokedSources).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    await expect(audio.player.start("held", Date.now() + 100)).rejects.toThrow("no longer available");
    sink.resolve();
    await flushStarts();
    expect(audio.elements.every(element => element.playCount === 0)).toBe(true);
  } finally { audio.player.close(); vi.useRealTimers(); }
});

it.each(["hanging", "rejected"] as const)("bounds %s prepared play attempts and allows the next clip", async kind => {
  vi.useFakeTimers();
  const play = deferred();
  const audio = createHarness({ controls: [kind === "hanging" ? { play } : { playError: new Error("play rejected") }] });
  const selected = batch({ durationMs: 60000, layers: [batch().layers[0]!], destinations: [batch().destinations[0]!] });
  audio.player.initialize(1, false);
  try {
    const preparing = audio.player.prepare("first", { generation: 1, batch: selected, assets, deadlineMs: Date.now() + 15000 });
    audio.elements[0]!.readyState = 2;
    await preparing;
    let result: Awaited<ReturnType<DeviceAudioPlayer["start"]>> | undefined;
    const playing = audio.player.start("first", Date.now() + 100).then(value => { result = value; });
    await vi.advanceTimersByTimeAsync(5100);
    expect(result).toMatchObject({ failedRouteIds: ["personal"], failures: [{ stage: "play" }] });
    await playing;
    expect(audio.elements[0]!.cleaned).toBe(true);
    const next = audio.player.prepare("second", { generation: 1, batch: selected, assets, deadlineMs: Date.now() + 15000 });
    audio.elements[1]!.readyState = 2;
    await next;
    const nextPlaying = audio.player.start("second", Date.now() + 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(audio.elements[1]!.playCount).toBe(1);
    audio.elements[1]!.emit("ended");
    expect(await nextPlaying).toMatchObject({ failedRouteIds: [] });
    play.resolve();
    await flushStarts();
    expect(audio.elements[0]!.playCount).toBe(1);
  } finally { audio.player.close(); vi.useRealTimers(); }
});

it("gives each selected route its full five seconds after different actual play onsets", async () => {
  vi.useFakeTimers();
  const slowPlay = deferred();
  const audio = createHarness({ controls: [{}, { play: slowPlay }] });
  audio.player.initialize(1, false);
  try {
    const preparing = audio.player.prepare("full-tail", { generation: 1,
      batch: batch({ durationMs: 5000, layers: [{ ...batch().layers[0]!, fadeOutMs: 100 }] }), assets, deadlineMs: Date.now() + 15000 });
    for (const element of audio.elements) element.readyState = 2;
    await preparing;
    let settled = false;
    const scheduled = Date.now() + 100;
    const playing = audio.player.start("full-tail", scheduled).then(result => { settled = true; return result; });
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(170);
    slowPlay.resolve();
    await flushStarts();
    await vi.advanceTimersByTimeAsync(4830);
    expect(audio.elements[0]!.cleaned).toBe(true);
    expect(audio.elements[1]!.pauseCount).toBe(0);
    expect(audio.elements[1]!.volume).toBe(0.25);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(169);
    expect(audio.elements[1]!.pauseCount).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(await playing).toMatchObject({ failedRouteIds: [], outputDiagnostics: [
      { routeIds: ["personal"], layerId: "intro", assetId: "shared-sound", diagnostics: { scheduledStartEpochMs: scheduled, actualStartEpochMs: scheduled, terminalOutcome: "completed", completionReason: "configured-duration" } },
      { routeIds: ["broadcast"], layerId: "intro", assetId: "shared-sound", diagnostics: { scheduledStartEpochMs: scheduled, actualStartEpochMs: scheduled + 170, terminalOutcome: "completed", completionReason: "configured-duration" } }
    ] });
    expect(audio.elements[1]!.cleaned).toBe(true);
    expect(audio.elements.every(element => element.currentTime > 0)).toBe(true);
  } finally { audio.player.close(); vi.useRealTimers(); }
});

function privateAsset(assetId: string, mimeType: "audio/wav" | "audio/ogg"): AudioPlayerAsset { return { assetId, reference: { protocolVersion: 1, handle: `private_${"A".repeat(43)}`, snapshot: { assetId, mimeType, version: "a".repeat(64), sizeBytes: 3, durationMs: 1000 } } }; }


it("mutes simultaneous and future audio by owner while timer cues progress independently", async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const audio = createHarness(); audio.player.initialize(1, false);
  const playing = ["alerts", "screen-effects", "timers"].map((moduleId, index) => audio.player.play({
    generation: 1, batch: batch({ moduleId: moduleId as "alerts" | "screen-effects" | "timers", playbackId: `owner-${index}`,
      layers: [batch().layers[0]!], destinations: [batch().destinations[0]!] }), assets, deadlineMs: Date.now() + 10000
  }));
  try {
    await flushStarts();
    audio.player.setModuleMutes({ alerts: true, "screen-effects": false });
    expect(audio.elements.map(element => element.muted)).toEqual([true, false, false]);
    audio.player.setModuleMutes({ alerts: true, "screen-effects": true });
    expect(audio.elements.map(element => element.muted)).toEqual([true, true, false]);
    playing.push(audio.player.play({ generation: 1, batch: batch({ moduleId: "screen-effects", playbackId: "future",
      layers: [batch().layers[0]!], destinations: [batch().destinations[0]!] }), assets, deadlineMs: Date.now() + 10000 }));
    await flushStarts(); expect(audio.elements[3]!.mutedAtPlay).toEqual([true]);
    audio.player.setModuleMutes({ alerts: false, "screen-effects": true });
    expect(audio.elements.map(element => element.muted)).toEqual([false, true, false, true]);
    expect(audio.elements.every(element => element.pauseCount === 0)).toBe(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect((await Promise.all(playing)).every(result => result.failedRouteIds.length === 0)).toBe(true);
  } finally { audio.player.close(); vi.useRealTimers(); }
});
