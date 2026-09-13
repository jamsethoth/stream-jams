import { expect, it } from "vitest";
import * as core from "../index.js";

it("rejects timing that extends the occurrence or transport deadline", () => {
  const payload = { batch: {
    playbackId: "occurrence", documentId: "alert", durationMs: 1000, muted: false,
    timing: { startsAtEpochMs: 1100, endsAtEpochMs: 2100 },
    layers: [{ layerId: "sound", assetId: "tone", volume: 1 }], destinations: [{ deviceId: "explicit", routeIds: ["route"] }]
  }, assets: [], startDeadlineMs: 2100, deadlineMs: 2100 };
  expect(core.audioPlaybackPayloadSchema.safeParse(payload).success).toBe(true);
  expect(core.audioPlaybackPayloadSchema.safeParse({ ...payload, deadlineMs: 3100 }).success).toBe(false);
  expect(core.audioPlaybackPayloadSchema.safeParse({ ...payload, startDeadlineMs: 3100 }).success).toBe(false);
  expect(core.audioPlaybackPayloadSchema.safeParse({ ...payload, batch: { ...payload.batch, durationMs: 2000 } }).success).toBe(false);
});

it.each(["video/webm", "video/mp4"])("accepts bounded local %s soundtrack bytes only for video sources", mimeType => {
  const payload = { batch: {
    playbackId: "occurrence", documentId: "alert", durationMs: 1000, muted: false,
    layers: [{ layerId: "video", assetId: "clip", volume: 0.5, sourceKind: "video-soundtrack" }],
    destinations: [{ deviceId: "explicit", routeIds: ["route"] }]
  }, assets: [{ assetId: "clip", mimeType, bytes: new Uint8Array([1, 2]) }], startDeadlineMs: 1000, deadlineMs: 2000 };
  expect(core.audioPlaybackPayloadSchema.safeParse(payload).success).toBe(true);
  expect(core.audioPlaybackPayloadSchema.safeParse({ ...payload, batch: { ...payload.batch, layers: [{ ...payload.batch.layers[0], sourceKind: "audio" }] } }).success).toBe(false);
  expect(core.audioPlaybackPayloadSchema.safeParse({ ...payload, assets: [{ ...payload.assets[0], mimeType: "audio/webm" }] }).success).toBe(false);
  expect(core.audioPlaybackPayloadSchema.safeParse({ ...payload, assets: [...payload.assets, ...payload.assets] }).success).toBe(false);
});

it("validates bounded device audio bytes without accepting paths, default sinks or extra assets", () => {
  expect(core).toHaveProperty("audioTransportCommandSchema");
  const input = {
    type: "play", payload: { batch: {
      playbackId: "occurrence", documentId: "alert", durationMs: 1000, muted: false,
      layers: [{ layerId: "layer", assetId: "sound", volume: 0.5 }],
      destinations: [{ deviceId: "explicit", routeIds: ["route"] }]
    }, assets: [{ assetId: "sound", mimeType: "audio/wav", bytes: new Uint8Array([1, 2]) }], startDeadlineMs: 123456, deadlineMs: 123456 }
  };
  expect(core.audioTransportCommandSchema.safeParse(input).success).toBe(true);
  expect(core.audioTransportCommandSchema.safeParse({ ...input, path: "C:/private/file" }).success).toBe(false);
  expect(core.audioTransportCommandSchema.safeParse({ ...input, payload: { ...input.payload, assets: [{ assetId: "sound", mimeType: "audio/wav", url: "file:///private" }] } }).success).toBe(false);
  expect(core.audioTransportCommandSchema.safeParse({ ...input, payload: { ...input.payload, assets: [{ assetId: "sound", mimeType: "audio/wav", bytes: new Uint8Array(25 * 1024 * 1024 + 1) }] } }).success).toBe(false);
  expect(core.audioTransportCommandSchema.safeParse({ ...input, payload: { ...input.payload, assets: [{ assetId: "other", mimeType: "audio/wav", bytes: new Uint8Array([1]) }] } }).success).toBe(false);
  expect(core.audioTransportCommandSchema.safeParse({ type: "test", deviceId: "default" }).success).toBe(false);
});
