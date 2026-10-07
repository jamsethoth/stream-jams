import { expect, it } from "vitest";
import { desktopModuleSyncSchema, desktopVisualBatchSchema, desktopVisualCommandSchema, desktopVisualReplySchema } from "./desktop-visual-transport.js";
import { createDefaultMusicModuleConfig } from "../music/schemas.js";
import { projectMusicWidget } from "../music/projection.js";

const key = { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "one", generation: 1 };
const instruction = { id: "layer", overlayId: "default", moduleId: "alerts", purpose: "live", scope: "module",
  targetProfileId: "landscape", durationMs: 1000, audio: null, tts: null, text: null,
  visual: { assetId: "asset", mediaType: "image", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } };
const batch = { key, timing: { startsAtEpochMs: 1000, endsAtEpochMs: 2000 }, instructions: [instruction],
  assets: [asset("asset", "image/png")] };

it("accepts Landscape Music in desktop sync and rejects cross-module and Vertical payloads", () => {
  const snapshot = { providerId: "pear", generation: "g", revision: 1, track: { id: "track", title: "Title", artists: [], album: null, artworkRef: null }, playbackState: "playing" as const, positionMs: null, durationMs: null, observedAtEpochMs: 1000, session: null };
  const status = { state: "connected" as const, stale: false, diagnosticReference: null };
  const config = createDefaultMusicModuleConfig();
  const widget = projectMusicWidget(snapshot, status, config, "landscape", 1000, 1000)!;
  const sync = { moduleId: "music", revision: 1, presentation: { kind: "music-widget", widget }, assets: [] };
  expect(desktopModuleSyncSchema.safeParse(sync).success).toBe(true);
  expect(desktopVisualCommandSchema.safeParse({ type: "sync-module", ...sync }).success).toBe(true);
  expect(desktopModuleSyncSchema.safeParse({ ...sync, moduleId: "timers" }).success).toBe(false);
  expect(desktopModuleSyncSchema.safeParse({ ...sync, presentation: { kind: "music-widget", widget: { ...widget, targetProfileId: "vertical" } } }).success).toBe(false);
  const brand = asset("brand", "image/png");
  const withBrand = { ...sync, presentation: { kind: "music-widget", widget: { ...widget, assets: [brand.grant.snapshot] } }, assets: [brand] };
  expect(desktopModuleSyncSchema.safeParse(withBrand).success).toBe(true);
  expect(desktopModuleSyncSchema.safeParse({ ...withBrand, assets: [] }).success).toBe(false);
  expect(desktopModuleSyncSchema.safeParse({ ...withBrand, assets: [asset("brand", "font/woff2")] }).success).toBe(false);
  expect(desktopModuleSyncSchema.safeParse({ ...withBrand, presentation: { kind: "music-widget", widget: { ...widget, assets: [{ ...brand.grant.snapshot, sizeBytes: brand.grant.snapshot.sizeBytes + 1 }] } } }).success).toBe(false);
  expect(desktopModuleSyncSchema.safeParse({ ...sync, assets: [brand] }).success).toBe(false);
});

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
    { assets: [asset("asset", "audio/wav")] },
    { assets: [asset("asset", "video/webm")] },
    { assets: [{ ...batch.assets[0], bytes: new Uint8Array() }] },
    { assets: [{ ...batch.assets[0], path: "C:/private" }] },
    { key: { ...key, surfaceId: "other-surface" } }
  ]) expect(desktopVisualBatchSchema.safeParse({ ...batch, ...fields }).success).toBe(false);
});

it("enforces import ceilings while allowing multiple large references", () => {
  expect(desktopVisualBatchSchema.safeParse({ ...batch, assets: [asset("asset", "image/png", 10 * 1024 * 1024 + 1)] }).success).toBe(false);
  const video = { ...instruction, visual: { ...instruction.visual, mediaType: "video" } };
  const sizeBytes = 65 * 1024 * 1024;
  expect(desktopVisualBatchSchema.safeParse({ ...batch,
    instructions: [video, { ...video, id: "second", visual: { ...video.visual, assetId: "second" } }],
    assets: [asset("asset", "video/webm", sizeBytes), asset("second", "video/webm", sizeBytes)]
  }).success).toBe(true);
});

it("rejects all legacy whole-body bytes including exact buffers", () => {
  const backing = new Uint8Array([99, 1, 2, 3, 88]);
  expect(desktopVisualBatchSchema.safeParse({ ...batch, assets: [{ ...batch.assets[0], bytes: backing.subarray(1, 4) }] }).success).toBe(false);
  expect(desktopVisualBatchSchema.safeParse({ ...batch, assets: [{ ...batch.assets[0], bytes: new Uint8Array(backing.subarray(1, 4)) }] }).success).toBe(false);
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

it("accepts bounded timer module snapshots with exactly their referenced icon assets", () => {
  const presentation = { kind: "timer-stack", stack: {
    targetProfileId: "landscape", region: { layout: { x: 0, y: 0, width: 320, height: 270, zIndex: 1 }, orientation: "vertical", maxVisible: 3 },
    cards: [{ definitionId: "mitts", generation: "g1", label: "Wear oven mitts", iconAssetId: "icon", status: "paused", remainingMs: 5000,
      slot: { x: 0, y: 0, width: 320, height: 90, zIndex: 0 } }], overflowCount: 0
  } } as const;
  const sync = { moduleId: "timers", revision: 1, presentation,
    assets: [asset("icon", "image/png")] };
  expect(desktopModuleSyncSchema.parse(sync)).toEqual(sync);
  expect(desktopModuleSyncSchema.safeParse({ ...sync, assets: [asset("icon", "image/gif")] }).success).toBe(true);
  expect(desktopVisualCommandSchema.parse({ type: "sync-module", ...sync })).toEqual({ type: "sync-module", ...sync });
  expect(desktopModuleSyncSchema.safeParse({ ...sync, assets: [] }).success).toBe(false);
  expect(desktopModuleSyncSchema.safeParse({ ...sync, assets: [{ ...sync.assets[0], assetId: "other" }] }).success).toBe(false);
  expect(desktopModuleSyncSchema.safeParse({ ...sync, assets: [asset("icon", "video/webm")] }).success).toBe(false);
  expect(desktopModuleSyncSchema.safeParse({ ...sync, moduleId: "alerts" }).success).toBe(false);
  expect(desktopModuleSyncSchema.parse({ moduleId: "timers", revision: 2, presentation: null, assets: [] }).presentation).toBeNull();
});

function asset(assetId: string, mimeType: string, sizeBytes = 3) { return { assetId, grant: { handle: `med_${"A".repeat(43)}`, expiresAt: 1000000, snapshot: { assetId, mimeType, sizeBytes, version: "a".repeat(64), durationMs: 1000 } } }; }

it("retains two timer versions of one asset and rejects missing versions in the command boundary", () => {
  const first = asset("icon", "image/png"); const second = { ...first, grant: { ...first.grant, handle: `med_${"B".repeat(43)}`, snapshot: { ...first.grant.snapshot, version: "b".repeat(64) } } };
  const card = { definitionId: "a", generation: "g", label: "Timer", iconAssetId: "icon", iconVersion: first.grant.snapshot.version, status: "paused", remainingMs: 1000, slot: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } };
  const sync = { moduleId: "timers", revision: 1, assets: [first, second], presentation: { kind: "timer-stack", stack: { targetProfileId: "landscape", region: { layout: card.slot, orientation: "vertical", maxVisible: 2 }, cards: [card, { ...card, definitionId: "b", iconVersion: second.grant.snapshot.version }], overflowCount: 0 } } };
  expect(desktopModuleSyncSchema.safeParse(sync).success).toBe(true);
  expect(desktopVisualCommandSchema.safeParse({ type: "sync-module", ...sync, assets: [first] }).success).toBe(false);
  expect(desktopModuleSyncSchema.safeParse({ ...sync, assets: [first, first] }).success).toBe(false);
});

it("rejects browser-source-only video shoutout presentations in desktop sync", () => {
  expect(desktopModuleSyncSchema.safeParse({
    moduleId: "video-shoutout", revision: 1, presentation: { kind: "video-shoutout", shoutout: { status: "idle" } }, assets: []
  }).success).toBe(false);
});
