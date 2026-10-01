import { type AssetRecord, type AudioPlaybackPayload, type DesktopAudioTransport, type DeviceAudioBatch, type DeviceAudioResult, type TrustedMediaGrant } from "@stream-jams/core";
import { expect, it, vi } from "vitest";
import { DesktopAudioSink } from "./desktop-audio-sink.js";

function asset(id = "tone", mediaType: AssetRecord["mediaType"] = "audio", mimeType = "audio/mpeg", sizeBytes = 3): AssetRecord {
  return { id, mediaType, mimeType, sizeBytes, originalFileName: id, checksum: `sha256:${"a".repeat(64)}`, storagePath: `owned/${id}`, durationMs: 3000 };
}
function mediaFixture(records: readonly AssetRecord[] = [asset()]) {
  const recordsById = new Map(records.map(record => [record.id, record]));
  return {
    records: vi.fn((_owner: string, ids: readonly string[]) => new Map(ids.flatMap(id => { const record = recordsById.get(id); return record === undefined ? [] : [[id, record] as const]; }))),
    verifyGroup: vi.fn(async (_owner: string, _ids: readonly string[], signal: AbortSignal) => { signal.throwIfAborted(); }),
    issueTrustedGrant: vi.fn((_owner: string, id: string, _recipient: string, expiresAt: number): TrustedMediaGrant => {
      const record = recordsById.get(id)!;
      return { handle: `med_${"a".repeat(43)}`, expiresAt, snapshot: { assetId: id, version: "a".repeat(64), mimeType: record.mimeType as TrustedMediaGrant["snapshot"]["mimeType"], sizeBytes: record.sizeBytes, durationMs: record.durationMs } };
    })
  };
}

it("retains the occurrence deadline after late transport preparation", async () => {
  const transport = transportFixture();
  const sink = new DesktopAudioSink({ transport, media: mediaFixture(), now: () => 3000 });
  await sink.play(batchFixture({ timing: { startsAtEpochMs: 1100, endsAtEpochMs: 4100 } }));
  expect(transport.play).toHaveBeenCalledWith(expect.objectContaining({ deadlineMs: 4100, startDeadlineMs: 4100 }));
});
it.each(["video/webm", "video/mp4"])("prepares full import-size %s soundtrack references once for independent layers", async mimeType => {
  const transport = transportFixture();
  const media = mediaFixture([asset("clip", "video", mimeType, 100 * 1024 * 1024)]);
  const batch = batchFixture({ layers: [{ sourceKind: "video-soundtrack", layerId: "v1", assetId: "clip", volume: .2 }, { sourceKind: "video-soundtrack", layerId: "v2", assetId: "clip", volume: 1.8 }] });
  await new DesktopAudioSink({ transport, media }).play(batch);
  expect(media.verifyGroup).toHaveBeenCalledTimes(1);
  expect(transport.play.mock.calls[0]?.[0]).toMatchObject({ batch, assets: [{ assetId: "clip", grant: { snapshot: { mimeType, sizeBytes: 100 * 1024 * 1024 } } }] });
  expect(JSON.stringify(transport.play.mock.calls[0]?.[0])).not.toContain("owned/");
  expect(JSON.stringify(transport.play.mock.calls[0]?.[0])).not.toContain('"bytes"');
});
it("isolates checksum/read failures and conflicting kinds while retaining healthy destinations", async () => {
  const media = mediaFixture([asset(), asset("changed"), asset("clip", "video", "video/mp4"), asset("unsupported", "video", "video/quicktime")]);
  media.verifyGroup.mockImplementation(async (_owner, ids) => { if (ids.includes("changed")) throw new Error("integrity failure"); });
  const transport = transportFixture();
  await new DesktopAudioSink({ transport, media }).play(batchFixture({ layers: [
    { sourceKind: "audio", layerId: "tone", assetId: "tone", volume: 1 },
    { sourceKind: "audio", layerId: "bad", assetId: "changed", volume: 1 },
    { sourceKind: "audio", layerId: "conflict", assetId: "clip", volume: 1 },
    { sourceKind: "video-soundtrack", layerId: "clip", assetId: "clip", volume: 1 },
    { sourceKind: "video-soundtrack", layerId: "unsupported", assetId: "unsupported", volume: 1 }
  ] }));
  expect(transport.play.mock.calls[0]?.[0].assets.map(item => item.assetId)).toEqual(["tone"]);
  expect(media.verifyGroup.mock.calls.map(call => call[1])).toEqual([["tone"], ["changed"]]);
});
it("uses occurrence-owned records rather than current repository metadata", async () => {
  const media = mediaFixture([asset("tone", "audio", "audio/wav", 19)]);
  const transport = transportFixture();
  await new DesktopAudioSink({ transport, media }).play(batchFixture());
  expect(media.records).toHaveBeenCalledWith("playback", ["tone"]);
  expect(transport.play.mock.calls[0]?.[0].assets[0]?.grant.snapshot).toMatchObject({ sizeBytes: 19, mimeType: "audio/wav" });
});
it("does not forward playback if verification crosses the occurrence deadline", async () => {
  let now = 1000;
  const media = mediaFixture(); media.verifyGroup.mockImplementation(async () => { now = 5000; });
  const transport = transportFixture();
  expect(await new DesktopAudioSink({ transport, media, now: () => now }).play(batchFixture())).toEqual({ failedRouteIds: ["personal", "stream"] });
  expect(transport.play).not.toHaveBeenCalled();
});
it("cancels pending verification before forwarding stop and prevents late playback", async () => {
  const media = mediaFixture();
  let signal!: AbortSignal;
  const pending = deferred<void>();
  media.verifyGroup.mockImplementation(async (_owner, _ids, value) => { signal = value; await pending.promise; value.throwIfAborted(); });
  const transport = transportFixture();
  const sink = new DesktopAudioSink({ transport, media });
  const playing = sink.play(batchFixture());
  await Promise.resolve();
  await sink.stop("playback");
  expect(signal.aborted).toBe(true);
  pending.resolve(); await playing;
  expect(transport.play).not.toHaveBeenCalled();
  expect(transport.stop).toHaveBeenCalledExactlyOnceWith("playback");
});
it("propagates bounded verification deadlines and preserves selected route failure", async () => {
  vi.useFakeTimers();
  try {
    const media = mediaFixture();
    media.verifyGroup.mockImplementation(async (_owner, _ids, signal) => new Promise<void>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })));
    const transport = transportFixture();
    const playing = new DesktopAudioSink({ transport, media }).play(batchFixture({ durationMs: 120000 }));
    await vi.advanceTimersByTimeAsync(5001);
    expect(await playing).toEqual({ failedRouteIds: ["personal", "stream"] });
    expect(transport.play).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
it("forwards mute and terminal close acknowledgements", async () => {
  const transport = transportFixture(); const sink = new DesktopAudioSink({ transport, media: mediaFixture() });
  await sink.setMuted(true); await sink.close();
  expect(transport.setMuted).toHaveBeenCalledExactlyOnceWith(true); expect(transport.close).toHaveBeenCalledTimes(1);
});

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

function transportFixture(result: DeviceAudioResult = { failedRouteIds: [] }): DesktopAudioTransport & {
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

it("logs original per-layer failure evidence while preserving exactly the selected destinations", async () => {
  const failure = { routeIds: ["personal"], layerId: "layer", assetId: "tone", stage: "device-bind" as const, exception: { type: "Error", message: "Selected sink rejected", stack: null, code: null, cause: null, thrownValue: null } };
  const result: DeviceAudioResult = { failedRouteIds: ["personal"], failures: [failure] };
  const transport = transportFixture(); transport.play.mockResolvedValue(result);
  const logger = { debug: vi.fn(async () => {}), info: vi.fn(async () => {}), warn: vi.fn(async () => {}), error: vi.fn(async () => {}) };
  const batch = batchFixture();
  const sink = new DesktopAudioSink({ transport, media: mediaFixture(), logger, generateReferenceId: () => "error-fixture" });
  expect(await sink.play(batch)).toEqual(result);
  expect(transport.play.mock.calls[0]![0].batch.destinations).toEqual(batch.destinations);
  expect(logger.error).toHaveBeenCalledExactlyOnceWith("Selected device audio playback failed.", {
    module: "audio-output", source: "desktop-audio.playback-failed", correlationId: "error-fixture", processingId: null,
    metadata: { playbackId: "playback", documentId: "document", layerId: "layer", assetId: "tone", routeIds: ["personal"], stage: "device-bind" }
  }, failure.exception);
});

it("prepares short clips without consuming their playback duration and holds until start", async () => {
  const start = vi.fn(async () => ({ failedRouteIds: [] }));
  const prepare = vi.fn(async () => ({ start }));
  const transport = { ...transportFixture(), prepare };
  const sink = new DesktopAudioSink({ transport, media: mediaFixture(), now: () => 3000 });
  const handle = await sink.prepare(batchFixture({ durationMs: 100, timing: { startsAtEpochMs: 1000, endsAtEpochMs: 1100 } }));
  expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ deadlineMs: 18000, startDeadlineMs: 8000, batch: expect.objectContaining({ timing: undefined }) }));
  expect(transport.play).not.toHaveBeenCalled();
  expect(start).not.toHaveBeenCalled();
  await handle.start(9000);
  expect(start).toHaveBeenCalledExactlyOnceWith(9000);
});

it("logs renderer-observed audio timing without device identifiers", async () => {
  const diagnostics = { preparationDurationMs: 12, scheduledStartEpochMs: 100, actualStartEpochMs: 103, terminalOutcome: "completed" as const, completionReason: "natural-end" as const };
  const transport = transportFixture(); transport.play.mockResolvedValue({ failedRouteIds: [], diagnostics });
  const logger = { debug: vi.fn(async () => {}), info: vi.fn(async () => {}), warn: vi.fn(async () => {}), error: vi.fn(async () => {}) };
  const sink = new DesktopAudioSink({ transport, media: mediaFixture(), logger });
  expect(await sink.play(batchFixture())).toMatchObject({ diagnostics });
  expect(logger.info).toHaveBeenCalledExactlyOnceWith("Selected device audio playback timing.", expect.objectContaining({
    source: "desktop-audio.playback-timing", metadata: { playbackId: "playback", documentId: "document", routeCount: 2, ...diagnostics }
  }));
});

it("logs each selected output's timing with scalar route identity that survives JSONL allowlisting", async () => {
  const transport = transportFixture();
  const timing = { preparationDurationMs: 12, scheduledStartEpochMs: 100, actualStartEpochMs: 103, terminalOutcome: "completed" as const };
  transport.play.mockResolvedValue({ failedRouteIds: [], outputDiagnostics: [
    { routeIds: ["personal"], layerId: "intro", assetId: "tone", diagnostics: timing },
    { routeIds: ["broadcast"], layerId: "intro", assetId: "tone", diagnostics: { ...timing, actualStartEpochMs: 273 } }
  ] });
  const logger = { debug: vi.fn(async () => {}), info: vi.fn(async () => {}), warn: vi.fn(async () => {}), error: vi.fn(async () => {}) };
  const sink = new DesktopAudioSink({ transport, media: mediaFixture(), logger });
  await sink.play(batchFixture());
  expect(logger.info).toHaveBeenCalledTimes(2);
  expect(logger.info).toHaveBeenCalledWith("Selected device audio playback timing.", expect.objectContaining({ metadata: expect.objectContaining({ routeIds: '["personal"]', actualStartEpochMs: 103 }) }));
  expect(logger.info).toHaveBeenCalledWith("Selected device audio playback timing.", expect.objectContaining({ metadata: expect.objectContaining({ routeIds: '["broadcast"]', actualStartEpochMs: 273 }) }));
});

it("scopes overlapping document grants independently so a short document cannot shorten the long document", async () => {
  const media = mediaFixture(); const transport = transportFixture();
  const sink = new DesktopAudioSink({ transport, media, now: () => 1000 });
  await sink.play(batchFixture({ documentId: "long", durationMs: 120000 }));
  await sink.play(batchFixture({ documentId: "short", durationMs: 100 }));
  const [long, short] = media.issueTrustedGrant.mock.calls;
  expect(long?.[2]).not.toBe(short?.[2]); expect(long?.[3]).toBeGreaterThan(short?.[3] ?? Infinity);
});
