import {
  maxAudioTransportAssetBytes,
  type AssetRecord,
  type AudioPlaybackPayload,
  type DesktopAudioTransport,
  type DeviceAudioBatch,
  type DeviceAudioResult
} from "@stream-jams/core";
import { expect, it, vi } from "vitest";
import { DesktopAudioSink } from "./desktop-audio-sink.js";

it("deduplicates and attaches only verified audio bytes while preserving the batch", async () => {
  const currentTime = 1_000;
  const now = vi.fn(() => currentTime);
  const records = new Map<string, AssetRecord>([
    ["tone", asset("tone", "audio", "audio/mpeg", 3)],
    ["shared", asset("shared", "audio", "audio/webm", 2)],
    ["visual", asset("visual", "image", "image/png", 3)],
    ["wrong-size", asset("wrong-size", "audio", "audio/wav", 2)],
    ["unsupported", asset("unsupported", "audio", "audio/aac", 2)],
    ["oversized", asset("oversized", "audio", "audio/ogg", maxAudioTransportAssetBytes + 1)]
  ]);
  const repository = {
    findManyByIds: vi.fn(async () => records as ReadonlyMap<string, AssetRecord>)
  };
  const readBounded = vi.fn(async (storagePath: string) => {
    expect(now).toHaveBeenCalled();
    if (storagePath.includes("wrong-size")) return Buffer.from([7, 8, 9]);
    if (storagePath.includes("shared")) return Buffer.from([4, 5]);
    return Buffer.from([1, 2, 3]);
  });
  const transport = transportFixture({ failedRouteIds: ["stream"] });
  const batch = batchFixture({
    layers: [
      { layerId: "one", assetId: "tone", volume: 1 },
      { layerId: "two", assetId: "tone", volume: 0.5 },
      { layerId: "three", assetId: "shared", volume: 1 },
      { layerId: "four", assetId: "visual", volume: 1 },
      { layerId: "five", assetId: "wrong-size", volume: 1 },
      { layerId: "six", assetId: "unsupported", volume: 1 },
      { layerId: "seven", assetId: "oversized", volume: 1 },
      { layerId: "eight", assetId: "missing", volume: 1 }
    ]
  });
  const sink = new DesktopAudioSink({ transport, assetRepository: repository, assetStore: { readBounded }, now });

  const result = await sink.play(batch);

  expect(result).toEqual({ failedRouteIds: ["stream"] });
  expect(repository.findManyByIds).toHaveBeenCalledExactlyOnceWith([
    "tone", "shared", "visual", "wrong-size", "unsupported", "oversized", "missing"
  ]);
  expect(readBounded.mock.calls.map(([path]) => path)).toEqual(["audio/tone", "audio/shared", "audio/wrong-size"]);
  expect(transport.play).toHaveBeenCalledExactlyOnceWith({
    batch,
    assets: [
      { assetId: "tone", mimeType: "audio/mpeg", bytes: new Uint8Array([1, 2, 3]) },
      { assetId: "shared", mimeType: "audio/webm", bytes: new Uint8Array([4, 5]) }
    ],
    deadlineMs: 4_000,
    startDeadlineMs: 4_000
  });
});

it("does not call transport play when asset reads finish after the occurrence deadline", async () => {
  let currentTime = 10_000;
  const transport = transportFixture();
  const sink = new DesktopAudioSink({
    transport,
    assetRepository: { findManyByIds: async () => new Map([["tone", asset("tone", "audio", "audio/ogg", 2)]]) },
    assetStore: { readBounded: async () => { currentTime = 13_001; return Buffer.from([1, 2]); } },
    now: () => currentTime
  });

  await expect(sink.play(batchFixture())).resolves.toEqual({ failedRouteIds: ["personal", "stream"] });
  expect(transport.play).not.toHaveBeenCalled();
});

it("observes a read rejection when invoking the read crosses the start deadline", async () => {
  let currentTime = 1_000;
  const transport = transportFixture();
  const sink = new DesktopAudioSink({
    transport,
    assetRepository: { findManyByIds: async () => new Map([["tone", asset("tone", "audio", "audio/ogg", 2)]]) },
    assetStore: {
      readBounded: async () => {
        currentTime = 7_000;
        throw new Error("late read failed");
      }
    },
    now: () => currentTime
  });

  await expect(sink.play(batchFixture({ durationMs: 30_000 }))).resolves.toEqual({
    failedRouteIds: ["personal", "stream"]
  });
  expect(transport.play).not.toHaveBeenCalled();
});

it("fails a long occurrence when asset preparation does not finish within five seconds", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  const reading = deferred<Uint8Array>();
  const transport = transportFixture();
  const readBounded = vi.fn(() => reading.promise);
  const sink = new DesktopAudioSink({
    transport,
    assetRepository: { findManyByIds: async () => new Map([["tone", asset("tone", "audio", "audio/mpeg", 2)]]) },
    assetStore: { readBounded }
  });
  let outcome: DeviceAudioResult | undefined;

  try {
    const playing = sink.play(batchFixture({ durationMs: 30_000 })).then(result => { outcome = result; });
    await vi.advanceTimersByTimeAsync(0);
    expect(readBounded).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(outcome).toEqual({ failedRouteIds: ["personal", "stream"] });
    expect(transport.play).not.toHaveBeenCalled();
    reading.resolve(new Uint8Array([1, 2]));
    await playing;
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.play).not.toHaveBeenCalled();
  } finally {
    reading.resolve(new Uint8Array([1, 2]));
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  }
});

it("cancels a pending read before forwarding stop and prevents late play", async () => {
  const reading = deferred<Buffer>();
  const transport = transportFixture();
  const readBounded = vi.fn(() => reading.promise);
  const sink = new DesktopAudioSink({
    transport,
    assetRepository: { findManyByIds: async () => new Map([["tone", asset("tone", "audio", "audio/mpeg", 2)]]) },
    assetStore: { readBounded }
  });
  const playing = sink.play(batchFixture());
  await vi.waitFor(() => expect(readBounded).toHaveBeenCalledTimes(1));

  await sink.stop("playback");
  reading.resolve(Buffer.from([1, 2]));

  await expect(playing).resolves.toEqual({ failedRouteIds: [] });
  expect(transport.stop).toHaveBeenCalledExactlyOnceWith("playback");
  expect(transport.play).not.toHaveBeenCalled();
});

it("forwards mute and terminal close acknowledgements", async () => {
  const transport = transportFixture();
  const sink = new DesktopAudioSink({
    transport,
    assetRepository: { findManyByIds: async () => new Map() },
    assetStore: { readBounded: async () => Buffer.alloc(0) }
  });

  await sink.setMuted(true);
  await sink.close();

  expect(transport.setMuted).toHaveBeenCalledExactlyOnceWith(true);
  expect(transport.close).toHaveBeenCalledTimes(1);
});

function asset(
  id: string,
  mediaType: AssetRecord["mediaType"],
  mimeType: string,
  sizeBytes: number
): AssetRecord {
  return {
    id,
    originalFileName: id,
    mediaType,
    mimeType,
    sizeBytes,
    checksum: "sha256:test",
    storagePath: `audio/${id}`
  };
}

function batchFixture(overrides: Partial<DeviceAudioBatch> = {}): DeviceAudioBatch {
  return {
    playbackId: "playback",
    documentId: "document",
    durationMs: 3_000,
    muted: false,
    layers: [{ layerId: "layer", assetId: "tone", volume: 0.5 }],
    destinations: [
      { deviceId: "headphones", routeIds: ["personal"] },
      { deviceId: "monitor", routeIds: ["stream"] }
    ],
    ...overrides
  };
}

function transportFixture(result = { failedRouteIds: [] as string[] }): DesktopAudioTransport & {
  readonly play: ReturnType<typeof vi.fn<(payload: AudioPlaybackPayload) => Promise<typeof result>>>;
} {
  return {
    listOutputDevices: vi.fn(async () => []),
    testOutput: vi.fn(async () => {}),
    play: vi.fn(async () => result),
    stop: vi.fn(async () => {}),
    setMuted: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    close: vi.fn(async () => {})
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
