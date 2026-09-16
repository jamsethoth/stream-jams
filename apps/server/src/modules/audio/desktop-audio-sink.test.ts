import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

it("retains the occurrence deadline after late transport preparation", async () => {
  const transport = transportFixture();
  const sink = new DesktopAudioSink({ transport, assetRepository: { findManyByIds: async () => new Map() },
    assetStore: { readBounded: async () => new Uint8Array() }, now: () => 3000 });
  await sink.play(batchFixture({ timing: { startsAtEpochMs: 1100, endsAtEpochMs: 4100 } }));
  expect(transport.play).toHaveBeenCalledWith(expect.objectContaining({ deadlineMs: 4100, startDeadlineMs: 4100 }));
});
import { LocalAssetStore } from "../assets/local-asset-store.js";

it.each(["video/webm", "video/mp4"])("attaches verified %s soundtrack bytes once for independent layers", async mimeType => {
  const bytes = new Uint8Array([1, 2, 3]);
  const transport = transportFixture();
  const readBounded = vi.fn(async () => bytes);
  const batch = batchFixture({ layers: [
    { sourceKind: "video-soundtrack", layerId: "v1", assetId: "clip", volume: 0.2 },
    { sourceKind: "video-soundtrack", layerId: "v2", assetId: "clip", volume: 0.8 }
  ] });
  await new DesktopAudioSink({ transport, assetRepository: { findManyByIds: async () => new Map([["clip", asset("clip", "video", mimeType, 3)]]) }, assetStore: { readBounded } }).play(batch);
  expect(readBounded).toHaveBeenCalledExactlyOnceWith("audio/clip", maxAudioTransportAssetBytes);
  expect(transport.play.mock.calls[0]?.[0]).toMatchObject({ batch, assets: [{ assetId: "clip", mimeType, bytes }] });
});

it("omits changed checksums, mismatched media kinds and unsupported MIME while retaining healthy sound", async () => {
  const records = [
    asset("tone", "audio", "audio/mpeg", 3),
    { ...asset("changed", "audio", "audio/mpeg", 3), checksum: `sha256:${"0".repeat(64)}` },
    { ...asset("changed-video", "video", "video/mp4", 3), checksum: `sha256:${"0".repeat(64)}` },
    asset("audio-as-video", "audio", "audio/mpeg", 3),
    asset("video-as-audio", "video", "video/webm", 3),
    asset("wrong-mime", "video", "audio/webm", 3),
    asset("wrong-audio-mime", "audio", "video/webm", 3),
    asset("unsupported-video", "video", "video/quicktime", 3)
  ];
  const transport = transportFixture();
  const readBounded = vi.fn<(storagePath: string) => Promise<Uint8Array>>(async () => new Uint8Array([1, 2, 3]));
  const layers = records.map(record => ({ layerId: record.id, assetId: record.id, volume: 1,
    sourceKind: (record.id === "audio-as-video" || record.id === "wrong-mime" || record.id === "unsupported-video" || record.id === "changed-video" ? "video-soundtrack" : "audio") as "audio" | "video-soundtrack" }));
  await new DesktopAudioSink({ transport, assetRepository: { findManyByIds: async () => new Map(records.map(record => [record.id, record])) }, assetStore: { readBounded } }).play(batchFixture({ layers }));
  expect(transport.play.mock.calls[0]?.[0].assets.map(item => item.assetId)).toEqual(["tone"]);
  expect(readBounded.mock.calls.map(call => call[0])).toEqual(["audio/tone", "audio/changed", "audio/changed-video"]);
});

it("honors the owned-file boundary for escaped and missing files without dropping healthy assets", async () => {
  const store = new LocalAssetStore({ assetDirectory: join(tmpdir(), "stream-jams-sink-no-files") });
  const ownedRead = vi.spyOn(store, "readBounded");
  const records = [asset("tone", "audio", "audio/mpeg", 3),
    { ...asset("escape", "video", "video/webm", 3), storagePath: "../secret" },
    { ...asset("missing", "video", "video/mp4", 3), storagePath: "video/missing.mp4" }];
  const transport = transportFixture();
  await new DesktopAudioSink({ transport, assetRepository: { findManyByIds: async () => new Map(records.map(record => [record.id, record])) },
    assetStore: { readBounded: (path, limit) => path === "audio/tone" ? Promise.resolve(new Uint8Array([1, 2, 3])) : store.readBounded(path, limit) }
  }).play(batchFixture({ layers: records.map(record => ({ layerId: record.id, assetId: record.id, volume: 1, sourceKind: record.mediaType === "audio" ? "audio" : "video-soundtrack" })) }));
  expect(transport.play.mock.calls[0]?.[0].assets.map(item => item.assetId)).toEqual(["tone"]);
  expect(ownedRead.mock.calls.map(call => call[0])).toEqual(["../secret", "video/missing.mp4"]);
});

it("accepts exactly 25 MiB per video and 100 MiB per batch, omitting cap plus one", async () => {
  const bytes = new Uint8Array(maxAudioTransportAssetBytes);
  const checksum = hash(bytes);
  const records = [0, 1, 2, 3].map(i => ({ ...asset(`clip${i}`, "video", "video/webm", bytes.length), checksum }));
  records.push({ ...asset("overflow", "video", "video/webm", 1), checksum: hash(new Uint8Array(1)) });
  records.unshift({ ...asset("oversized", "video", "video/webm", bytes.length + 1), checksum });
  const transport = transportFixture();
  const readBounded = vi.fn(async () => bytes);
  await new DesktopAudioSink({ transport, assetRepository: { findManyByIds: async () => new Map(records.map(record => [record.id, record])) }, assetStore: { readBounded } })
    .play(batchFixture({ layers: records.map(record => ({ layerId: record.id, assetId: record.id, sourceKind: "video-soundtrack", volume: 1 })) }));
  expect(readBounded).toHaveBeenCalledTimes(4);
  expect(transport.play.mock.calls[0]?.[0].assets.map(item => item.assetId)).toEqual(["clip0", "clip1", "clip2", "clip3"]);
  expect(transport.play.mock.calls[0]?.[0].assets.reduce((sum, item) => sum + item.bytes.length, 0)).toBe(100 * 1024 * 1024);
});

it("rejects actual cap-plus-one bytes despite matching bounded metadata", async () => {
  const transport = transportFixture();
  const record = asset("clip", "video", "video/webm", maxAudioTransportAssetBytes);
  const readBounded = vi.fn(async () => new Uint8Array(maxAudioTransportAssetBytes + 1));
  await new DesktopAudioSink({ transport, assetRepository: { findManyByIds: async () => new Map([["clip", record]]) },
    assetStore: { readBounded }
  }).play(batchFixture({ layers: [{ layerId: "video", assetId: "clip", sourceKind: "video-soundtrack", volume: 1 }] }));
  expect(transport.play.mock.calls[0]?.[0].assets).toEqual([]);
  expect(readBounded).toHaveBeenCalledExactlyOnceWith("audio/clip", maxAudioTransportAssetBytes);
});

it("omits a shared asset with conflicting requested kinds while preserving unrelated healthy sources", async () => {
  const records = [asset("clip", "video", "video/webm", 3), asset("tone", "audio", "audio/mpeg", 3)];
  const transport = transportFixture();
  const readBounded = vi.fn<(path: string) => Promise<Uint8Array>>(async () => new Uint8Array([1, 2, 3]));
  await new DesktopAudioSink({ transport, assetRepository: { findManyByIds: async () => new Map(records.map(record => [record.id, record])) }, assetStore: { readBounded } })
    .play(batchFixture({ layers: [
      { layerId: "video", assetId: "clip", sourceKind: "video-soundtrack", volume: 1 },
      { layerId: "wrong", assetId: "clip", sourceKind: "audio", volume: 1 },
      { layerId: "tone", assetId: "tone", sourceKind: "audio", volume: 1 }
    ] }));
  expect(readBounded.mock.calls.map(call => call[0])).toEqual(["audio/tone"]);
  expect(transport.play.mock.calls[0]?.[0].assets.map(item => item.assetId)).toEqual(["tone"]);
});

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
      { sourceKind: "audio", layerId: "one", assetId: "tone", volume: 1 },
      { sourceKind: "audio", layerId: "two", assetId: "tone", volume: 0.5 },
      { sourceKind: "audio", layerId: "three", assetId: "shared", volume: 1 },
      { sourceKind: "audio", layerId: "four", assetId: "visual", volume: 1 },
      { sourceKind: "audio", layerId: "five", assetId: "wrong-size", volume: 1 },
      { sourceKind: "audio", layerId: "six", assetId: "unsupported", volume: 1 },
      { sourceKind: "audio", layerId: "seven", assetId: "oversized", volume: 1 },
      { sourceKind: "audio", layerId: "eight", assetId: "missing", volume: 1 }
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

it.each(["audio", "video-soundtrack"] as const)("cancels a pending %s read before forwarding stop and prevents late play", async sourceKind => {
  const reading = deferred<Buffer>();
  const transport = transportFixture();
  const readBounded = vi.fn(() => reading.promise);
  const sink = new DesktopAudioSink({
    transport,
    assetRepository: { findManyByIds: async () => new Map([["tone", asset("tone", sourceKind === "audio" ? "audio" : "video", sourceKind === "audio" ? "audio/mpeg" : "video/webm", 2)]]) },
    assetStore: { readBounded }
  });
  const playing = sink.play(batchFixture({ layers: [{ layerId: "source", assetId: "tone", volume: 1, sourceKind }] }));
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
    checksum: hash(id === "shared" ? new Uint8Array([4, 5]) : new Uint8Array([1, 2, 3])),
    storagePath: `audio/${id}`
  };
}

function batchFixture(overrides: Partial<DeviceAudioBatch> = {}): DeviceAudioBatch {
  return {
    playbackId: "playback",
    documentId: "document",
    durationMs: 3_000,
    muted: false,
    layers: [{ sourceKind: "audio", layerId: "layer", assetId: "tone", volume: 0.5 }],
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

function hash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
