import { createDefaultMusicModuleConfig, DefaultOverlayCompositionService, type MusicWidgetProjection } from "@stream-jams/core";
import { expect, it, vi } from "vitest";
import { MusicOutputRuntime } from "./music-output-runtime.js";

const config = createDefaultMusicModuleConfig();
const live: MusicWidgetProjection = {
  targetProfileId: "vertical", snapshot: { providerId: "pear", generation: "owned", revision: 7,
    track: { id: "live", title: "Live track", artists: ["Artist"], album: null, artworkRef: "art_live" },
    playbackState: "playing", positionMs: null, durationMs: null, observedAtEpochMs: 1000, session: null },
  appearanceStartedAtEpochMs: 1000, profile: config.profiles.vertical, view: "full",
  layout: { x: 0, y: 0, width: 640, height: 178, zIndex: 0 }, css: config.css, assets: []
};

it("keeps test fixture separate from live source and attaches versioned saved assets", async () => {
  const getProjection = vi.fn(() => live);
  const resolveMusicAssets = vi.fn(async () => ({ assets: [{ assetId: "brand", version: "a".repeat(64),
    mimeType: "image/png" as const, sizeBytes: 3, durationMs: null }], missingAssetIds: [] }));
  const output = new MusicOutputRuntime({ runtime: { getProjection, revision: 1 }, assets: { resolveMusicAssets }, getConfig: async () => config, now: () => 1000 });
  const test = await output.getModuleSnapshot({ moduleId: "music", overlayId: "default", purpose: "test", scope: "module", targetProfileId: "vertical" });
  expect(getProjection).not.toHaveBeenCalled();
  expect(test.presentation?.kind).toBe("music-widget");
  if (test.presentation?.kind !== "music-widget") throw new Error("Missing fixture");
  expect(test.presentation.widget.snapshot.providerId).toBe("music-fixture");
  expect(test.presentation.widget.snapshot.track?.artworkRef).toBeNull();
  expect(test.presentation.widget.assets[0]?.assetId).toBe("brand");
  const actual = await output.getModuleSnapshot({ moduleId: "music", overlayId: "default", purpose: "live", scope: "module", targetProfileId: "vertical" });
  expect(actual.presentation?.kind).toBe("music-widget");
  if (actual.presentation?.kind !== "music-widget") throw new Error("Missing live projection");
  expect(actual.presentation.widget.snapshot.track?.id).toBe("live");
  expect(resolveMusicAssets).toHaveBeenCalledWith(config, "vertical");
});

it("does not publish an obsolete live projection after slow asset resolution", async () => {
  let finish!: (value: { assets: []; missingAssetIds: [] }) => void;
  let revision = 1;
  const output = new MusicOutputRuntime({ runtime: { getProjection: () => live, get revision() { return revision; } },
    assets: { resolveMusicAssets: () => new Promise(resolve => { finish = resolve; }) }, getConfig: async () => config });
  const pending = output.getModuleSnapshot({ moduleId: "music", overlayId: "default", purpose: "live", scope: "module" });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  revision = 2; finish({ assets: [], missingAssetIds: [] });
  expect((await pending).presentation).toBeUndefined();
});

it("composes Music on both module profiles and a visible unified layer", async () => {
  const output = new MusicOutputRuntime({ runtime: { getProjection: profile => ({ ...live, targetProfileId: profile }), revision: 1 },
    assets: { resolveMusicAssets: async () => ({ assets: [], missingAssetIds: [] }) }, getConfig: async () => config, now: () => 1000 });
  const compositions = new DefaultOverlayCompositionService({
    configService: { getModuleConfig: async moduleId => ({ moduleId, enabled: true, config, updatedAt: "2026-10-04T00:00:00Z" }) },
    runtime: { getModuleSnapshot: request => output.getModuleSnapshot(request) },
    surfaceRepository: { list: async () => [{ id: "unified-browser:default", kind: "unified-browser", overlayId: "default",
      layers: [{ moduleId: "music", visible: true }] }] }
  });
  const vertical = await compositions.resolveModuleOutput({ moduleId: "music", overlayId: "default", purpose: "live", targetProfileId: "vertical" });
  const landscape = await compositions.resolveModuleOutput({ moduleId: "music", overlayId: "default", purpose: "test", targetProfileId: "landscape" });
  const unified = await compositions.resolveUnifiedOutput({ overlayId: "default", purpose: "live", enabledModuleIds: ["music"] });
  expect(vertical.modules[0]?.presentation?.kind).toBe("music-widget");
  expect(landscape.modules[0]?.presentation?.kind).toBe("music-widget");
  if (vertical.modules[0]?.presentation?.kind !== "music-widget" || landscape.modules[0]?.presentation?.kind !== "music-widget" ||
    unified.modules[0]?.presentation?.kind !== "music-widget") throw new Error("Missing Music composition");
  expect(vertical.modules[0].presentation.widget.targetProfileId).toBe("vertical");
  expect(landscape.modules[0].presentation.widget.snapshot.providerId).toBe("music-fixture");
  expect(unified.modules[0].presentation.widget.targetProfileId).toBe("landscape");
  expect(unified.modules[0].surfaceLayer).toEqual({ visible: true, zIndex: 0 });
  expect(unified.modules[0].instructions).toEqual([]);
});
