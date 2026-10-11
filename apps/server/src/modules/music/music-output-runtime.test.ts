import { createDefaultMusicModuleConfig, DefaultOverlayCompositionService, projectMusicWidget, resolveMusicOutputGeometry, type MusicWidgetProjection } from "@stream-jams/core";
import { expect, it, vi } from "vitest";
import { MusicOutputRuntime } from "./music-output-runtime.js";

const config = createDefaultMusicModuleConfig();
const live: MusicWidgetProjection = {
  targetProfileId: "vertical", snapshot: { providerId: "pear", generation: "owned", revision: 7,
    track: { id: "live", title: "Live track", artists: ["Artist"], album: null, artworkRef: "art_live" },
    playbackState: "playing", positionMs: null, durationMs: null, observedAtEpochMs: 1000, session: null },
  appearanceStartedAtEpochMs: 1000, clockReferenceEpochMs: 1000, profile: config.profiles.vertical, view: "full",
  layout: { x: 0, y: 0, width: 640, height: 178, zIndex: 0 }, css: config.css, assets: []
};

it("rejects retired test snapshots without reading the source and attaches saved assets to ordinary output", async () => {
  const getProjection = vi.fn(() => live);
  const resolveMusicAssets = vi.fn(async () => ({ assets: [{ assetId: "brand", version: "a".repeat(64),
    mimeType: "image/png" as const, sizeBytes: 3, durationMs: null }], missingAssetIds: [] }));
  const output = new MusicOutputRuntime({ runtime: { getProjection, revision: 1 }, assets: { resolveMusicAssets }, getConfig: async () => config });
  const test = await output.getModuleSnapshot({ recipientKind: "browser", moduleId: "music", overlayId: "default", purpose: "test", scope: "module", targetProfileId: "vertical" });
  expect(getProjection).not.toHaveBeenCalled();
  expect(test.presentation).toBeUndefined();
  expect(resolveMusicAssets).not.toHaveBeenCalled();
  const actual = await output.getModuleSnapshot({ recipientKind: "browser", moduleId: "music", overlayId: "default", purpose: "live", scope: "module", targetProfileId: "vertical" });
  expect(actual.presentation?.kind).toBe("music-widget");
  if (actual.presentation?.kind !== "music-widget") throw new Error("Missing live projection");
  expect(actual.presentation.widget.snapshot.track?.id).toBe("live");
  expect(actual.presentation.widget.assets[0]?.assetId).toBe("brand");
  expect(resolveMusicAssets).toHaveBeenCalledWith(config, "vertical");
});

it("does not publish an obsolete live projection after slow asset resolution", async () => {
  let finish!: (value: { assets: []; missingAssetIds: [] }) => void;
  let revision = 1;
  const output = new MusicOutputRuntime({ runtime: { getProjection: () => live, get revision() { return revision; } },
    assets: { resolveMusicAssets: () => new Promise(resolve => { finish = resolve; }) }, getConfig: async () => config });
  const pending = output.getModuleSnapshot({ recipientKind: "browser", moduleId: "music", overlayId: "default", purpose: "live", scope: "module" });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  revision = 2; finish({ assets: [], missingAssetIds: [] });
  expect((await pending).presentation).toBeUndefined();
});

it("composes ordinary Music profiles and rejects a retired public unified layer", async () => {
  const output = new MusicOutputRuntime({ runtime: { getProjection: profile => ({ ...live, targetProfileId: profile }), revision: 1 },
    assets: { resolveMusicAssets: async () => ({ assets: [], missingAssetIds: [] }) }, getConfig: async () => config });
  const compositions = new DefaultOverlayCompositionService({
    configService: { getModuleConfig: async moduleId => ({ moduleId, enabled: true, config, updatedAt: "2026-10-04T00:00:00Z" }) },
    runtime: { getModuleSnapshot: request => output.getModuleSnapshot(request) },
    surfaceRepository: { list: async () => [{ id: "unified-browser:default", kind: "unified-browser", overlayId: "default",
      layers: [{ moduleId: "music", visible: true }] }] }
  });
  const vertical = await compositions.resolveModuleOutput({ moduleId: "music", overlayId: "default", purpose: "live", targetProfileId: "vertical" });
  const landscape = await compositions.resolveModuleOutput({ moduleId: "music", overlayId: "default", purpose: "live", targetProfileId: "landscape" });
  const unified = await compositions.resolveUnifiedOutput({ overlayId: "default", purpose: "live", enabledModuleIds: ["music"] });
  expect(vertical.modules[0]?.presentation?.kind).toBe("music-widget");
  expect(landscape.modules[0]?.presentation?.kind).toBe("music-widget");
  if (vertical.modules[0]?.presentation?.kind !== "music-widget" || landscape.modules[0]?.presentation?.kind !== "music-widget") throw new Error("Missing Music composition");
  expect(vertical.modules[0].presentation.widget.targetProfileId).toBe("vertical");
  expect(landscape.modules[0].presentation.widget.snapshot.providerId).toBe("pear");
  expect(unified.modules[0]?.presentation).toBeUndefined();
  expect(unified.modules[0]?.surfaceLayer).toEqual({ visible: true, zIndex: 0 });
  expect(unified.modules[0]?.instructions).toEqual([]);
});


it("uses desktop placement only for the private desktop recipient", async () => {
  const saved = createDefaultMusicModuleConfig(); saved.desktopPlacement.full = { x: 123, y: 234 };
  const projection = { ...live, targetProfileId: "landscape" as const };
  const output = new MusicOutputRuntime({ runtime: { getProjection: () => projection, revision: 1 }, assets: { resolveMusicAssets: async () => ({ assets: [], missingAssetIds: [] }) }, getConfig: async () => saved });
  const desktop = await output.getModuleSnapshot({ recipientKind: "desktop", moduleId: "music", overlayId: "desktop:primary", purpose: "live", scope: "unified", targetProfileId: "landscape" });
  const browser = await output.getModuleSnapshot({ recipientKind: "browser", moduleId: "music", overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape" });
  expect(desktop.presentation?.kind === "music-widget" && desktop.presentation.widget.layout).toMatchObject({ x: 123, y: 234 });
  expect(browser.presentation?.kind === "music-widget" && browser.presentation.widget.layout).toMatchObject({ x: 100, y: 82 });
});

it("keeps both browser profiles and empty reconnect metadata independent of playback and desktop placement", async () => {
  let visible = true;
  const saved = createDefaultMusicModuleConfig();
  saved.desktopPlacement.full = { x: 1472, y: 955 }; saved.desktopScale.full = 0.7;
  const getProjection = vi.fn((target, captured) => visible ? projectMusicWidget(live.snapshot,
    { state: "connected", stale: false, diagnosticReference: null }, captured, target, 1000, 1000) : null);
  const output = new MusicOutputRuntime({ runtime: { getProjection, revision: 7 },
    assets: { resolveMusicAssets: async () => ({ assets: [], missingAssetIds: [] }) }, getConfig: async () => saved });
  const moduleConfig = { moduleId: "music", enabled: true, config: saved, updatedAt: "2026-10-11T00:00:00Z" };
  const compositions = new DefaultOverlayCompositionService({ configService: { getModuleConfig: async () => moduleConfig }, runtime: output });
  for (const targetProfileId of ["landscape", "vertical"] as const) {
    const request = { moduleId: "music", overlayId: "default", purpose: "live" as const, targetProfileId };
    const first = await compositions.resolveModuleOutput(request);
    expect(first.canvas).toMatchObject(resolveMusicOutputGeometry(saved, targetProfileId));
    expect(first.modules[0]?.presentation?.kind === "music-widget" && first.modules[0].presentation.widget.layout).toMatchObject({ x: 100, y: 82 });
    visible = false;
    const empty = await compositions.resolveModuleOutput(request);
    expect(empty.canvas).toEqual(first.canvas); expect(empty.modules[0]?.presentation).toBeUndefined();
    compositions.committedModuleConfig({ ...moduleConfig, enabled: false });
    expect((await compositions.resolveModuleOutput(request)).modules).toEqual([]);
    compositions.committedModuleConfig(moduleConfig); visible = true;
  }
});

it("retries a delayed Music snapshot with one new saved geometry/profile while preserving its appearance epoch", async () => {
  const old = createDefaultMusicModuleConfig();
  const next = createDefaultMusicModuleConfig(); next.profiles.vertical.views.full.widthPx = 800;
  let finish!: () => void;
  let calls = 0;
  const output = new MusicOutputRuntime({ runtime: { revision: 7, getProjection: (target, captured) => projectMusicWidget(live.snapshot,
    { state: "connected", stale: false, diagnosticReference: null }, captured ?? old, target, 1000, 1000) },
    assets: { resolveMusicAssets: async () => { if (++calls === 1) await new Promise<void>(resolve => { finish = resolve; }); return { assets: [], missingAssetIds: [] }; } },
    getConfig: async () => old });
  const capture = { moduleId: "music", enabled: true, config: old, updatedAt: "2026-10-11T00:00:00Z" };
  const compositions = new DefaultOverlayCompositionService({ configService: { getModuleConfig: async () => capture }, runtime: output });
  const pending = compositions.resolveModuleOutput({ moduleId: "music", overlayId: "default", purpose: "live", targetProfileId: "vertical" });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  compositions.committedModuleConfig({ ...capture, config: next }); finish();
  const current = await pending;
  expect(current.canvas).toMatchObject({ width: 1000, height: 378, configRevision: 1 });
  const widget = current.modules[0]?.presentation;
  expect(widget?.kind === "music-widget" && widget.widget).toMatchObject({ appearanceStartedAtEpochMs: 1000,
    snapshot: { generation: "owned", revision: 7, track: { id: "live" } }, layout: { x: 100, y: 82, width: 800 }, contentCanvas: { width: 1000, height: 378 } });
  expect(calls).toBe(2);
});
