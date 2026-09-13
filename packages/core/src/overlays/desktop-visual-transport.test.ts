import { expect, it } from "vitest";
import { desktopVisualBatchSchema, desktopVisualCommandSchema, desktopVisualReplySchema } from "./desktop-visual-transport.js";

const key = { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "one", generation: 1 };
const instruction = { id: "layer", overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module",
  targetProfileId: "landscape", durationMs: 1000, audio: null, tts: null, text: null,
  visual: { assetId: "asset", mediaType: "image", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } };
const batch = { key, timing: { startsAtEpochMs: 1000, endsAtEpochMs: 2000 }, instructions: [instruction],
  assets: [{ assetId: "asset", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) }] };

it("accepts normalized visual batches without audio authority", () => {
  expect(desktopVisualBatchSchema.parse(batch)).toEqual(batch);
  expect(desktopVisualBatchSchema.parse({ ...batch, instructions: [{ ...instruction, visual: null }], assets: [] }).assets).toEqual([]);
});

it.each([
  { audio: { assetId: "asset", volume: 1 } }, { tts: { text: "hello" } }, { moduleId: "other" },
  { targetProfileId: "vertical" }, { durationMs: 2000 }, { managementToken: "unexpected" },
  { visual: { ...instruction.visual, url: "https://example.com/video" } },
  { visual: { ...instruction.visual, layout: { ...instruction.visual.layout, command: "unexpected" } } }
])("rejects unauthorized or inconsistent instructions %j", fields => {
  expect(desktopVisualBatchSchema.safeParse({ ...batch, instructions: [{ ...instruction, ...fields }] }).success).toBe(false);
});

it("requires unique instruction IDs and exactly the referenced assets with matching media kinds", () => {
  for (const fields of [
    { instructions: [instruction, instruction] }, { assets: [] }, { assets: [...batch.assets, ...batch.assets] },
    { assets: [{ ...batch.assets[0], assetId: "unreferenced" }] },
    { assets: [{ ...batch.assets[0], mimeType: "audio/wav" }] },
    { assets: [{ ...batch.assets[0], mimeType: "video/webm" }] },
    { assets: [{ ...batch.assets[0], bytes: new Uint8Array() }] },
    { assets: [{ ...batch.assets[0], path: "C:/private" }] },
    { key: { ...key, surfaceId: "other-surface" } }
  ]) expect(desktopVisualBatchSchema.safeParse({ ...batch, ...fields }).success).toBe(false);
});

it("enforces per-asset size limits and the aggregate transfer budget", () => {
  expect(desktopVisualBatchSchema.safeParse({ ...batch, assets: [{ ...batch.assets[0], bytes: new Uint8Array(10 * 1024 * 1024 + 1) }] }).success).toBe(false);
  const video = { ...instruction, visual: { ...instruction.visual, mediaType: "video" } };
  const bytes = new Uint8Array(65 * 1024 * 1024);
  expect(desktopVisualBatchSchema.safeParse({ ...batch,
    instructions: [video, { ...video, id: "second", visual: { ...video.visual, assetId: "second" } }],
    assets: [{ assetId: "asset", mimeType: "video/webm", bytes }, { assetId: "second", mimeType: "video/webm", bytes }]
  }).success).toBe(false);
});

it("rejects subviews that would clone unrelated bytes from a larger backing buffer", () => {
  const backing = new Uint8Array([99, 1, 2, 3, 88]);
  expect(desktopVisualBatchSchema.safeParse({ ...batch, assets: [{ ...batch.assets[0], bytes: backing.subarray(1, 4) }] }).success).toBe(false);
  expect(desktopVisualBatchSchema.safeParse({ ...batch, assets: [{ ...batch.assets[0], bytes: new Uint8Array(backing.subarray(1, 4)) }] }).success).toBe(true);
});

it("validates discriminated commands and keyed acknowledgements without extra authority", () => {
  expect(desktopVisualCommandSchema.parse({ type: "prepare", batch })).toEqual({ type: "prepare", batch });
  for (const type of ["start", "stop"]) expect(desktopVisualCommandSchema.safeParse({ type, key }).success).toBe(true);
  for (const type of ["ready", "complete", "error"]) {
    expect(desktopVisualReplySchema.safeParse({ type, key }).success).toBe(true);
    expect(desktopVisualReplySchema.safeParse({ type }).success).toBe(false);
  }
  expect(desktopVisualCommandSchema.safeParse({ type: "start", key, url: "https://example.com" }).success).toBe(false);
  expect(desktopVisualCommandSchema.safeParse({ type: "configure", config: { id: "unified-browser:one", kind: "unified-browser", overlayId: "one", layers: [] } }).success).toBe(false);
});
