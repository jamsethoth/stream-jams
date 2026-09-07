import { expect, it } from "vitest";
import * as core from "../index.js";

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
