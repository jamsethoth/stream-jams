import { describe, expect, it } from "vitest";
import { createDefaultMusicModuleConfig, musicSnapshotSchema } from "./schemas.js";
import { applyMusicDesktopPlacement, getMusicPositionMs, projectMusicWidget } from "./projection.js";
import type { MusicSnapshot, MusicStatus } from "./types.js";

const snapshot: MusicSnapshot = { providerId: "provider-1", generation: "generation-1", revision: 1, track: { id: "track-1", title: "Title", artists: ["Artist"], album: null, artworkRef: null }, playbackState: "playing", positionMs: 1000, durationMs: null, observedAtEpochMs: 10000, session: null };
const status: MusicStatus = { state: "connected", stale: false, diagnosticReference: null };

describe("Music progress", () => {
  it("interpolates playing, freezes paused, and clamps known duration", () => {
    expect(getMusicPositionMs(snapshot, 11000)).toBe(2000);
    expect(getMusicPositionMs({ ...snapshot, playbackState: "paused" }, 11000)).toBe(1000);
    expect(getMusicPositionMs({ ...snapshot, playbackState: "stopped" }, 11000)).toBe(1000);
    expect(getMusicPositionMs({ ...snapshot, playbackState: "unknown" }, 11000)).toBe(1000);
    expect(getMusicPositionMs({ ...snapshot, durationMs: 1500 }, 11000)).toBe(1500);
    expect(getMusicPositionMs({ ...snapshot, positionMs: null }, 11000)).toBeNull();
    expect(getMusicPositionMs(snapshot, 9000)).toBe(1000);
    expect(getMusicPositionMs(snapshot, 55001)).toBe(1000);
  });
  it("adopts an authoritative seek and resume anchor", () => {
    const seek = { ...snapshot, positionMs: 200, observedAtEpochMs: 11000, revision: 2 };
    expect(getMusicPositionMs(seek, 12000)).toBe(1200);
    expect(getMusicPositionMs({ ...seek, playbackState: "paused" }, 12000)).toBe(200);
    expect(getMusicPositionMs({ ...seek, observedAtEpochMs: 12000, revision: 3 }, 13000)).toBe(1200);
  });
});

describe("Music visibility and layout", () => {
  it("hides empty, disconnected, stale, unanchored and malformed playback", () => {
    const config = createDefaultMusicModuleConfig();
    for (const candidate of [null, { ...snapshot, track: null }]) expect(projectMusicWidget(candidate, status, config, "landscape", 10000, 11000)).toBeNull();
    for (const state of ["disconnected", "connecting", "reconnecting", "auth-required", "error"] as const) expect(projectMusicWidget(snapshot, { ...status, state }, config, "landscape", 10000, 11000)).toBeNull();
    expect(projectMusicWidget(snapshot, { ...status, stale: true }, config, "landscape", 10000, 11000)).toBeNull();
    expect(projectMusicWidget(snapshot, status, config, "landscape", 10000, 55000)).not.toBeNull();
    expect(projectMusicWidget(snapshot, status, config, "landscape", 10000, 55001)).toBeNull();
    expect(projectMusicWidget(snapshot, status, config, "landscape", null, 11000)).toBeNull();
    expect(projectMusicWidget({ ...snapshot, positionMs: NaN }, status, config, "landscape", 10000, 11000)).toBeNull();
  });
  it("uses one appearance epoch across recipients, observations and pause/resume", () => {
    const config = createDefaultMusicModuleConfig();
    for (const profile of Object.values(config.profiles)) { profile.idleMode = "compact"; profile.idleAfterSeconds = 1; }
    for (const playbackState of ["playing", "paused", "playing"] as const) {
      const observation = musicSnapshotSchema.parse({ ...snapshot, playbackState, observedAtEpochMs: 11000, revision: 4 });
      for (const target of ["landscape", "vertical"] as const) {
        const projection = projectMusicWidget(observation, status, config, target, 10000, 11000);
        expect(projection?.view).toBe("compact");
        expect(projection?.appearanceStartedAtEpochMs).toBe(10000);
        expect(projection?.clockReferenceEpochMs).toBe(11000);
      }
    }
    expect(projectMusicWidget({ ...snapshot, track: { ...snapshot.track!, id: "new-track" } }, status, config, "landscape", 11000, 11000)?.view).toBe("full");
    expect(projectMusicWidget(snapshot, status, config, "landscape", 11000, 11000)?.view).toBe("full");
  });
  it("handles idle hide, none and configured compact without resetting time", () => {
    const config = createDefaultMusicModuleConfig();
    config.profiles.landscape.idleMode = "hide";
    expect(projectMusicWidget(snapshot, status, config, "landscape", 10000, 39999)).not.toBeNull();
    expect(projectMusicWidget(snapshot, status, config, "landscape", 10000, 40000)).toBeNull();
    config.profiles.landscape.idleMode = "none";
    expect(projectMusicWidget(snapshot, status, config, "landscape", 10000, 40000)?.view).toBe("full");
    config.profiles.landscape.initialView = "compact";
    expect(projectMusicWidget(snapshot, status, config, "landscape", 10000, 11000)?.layout.width).toBe(480);
  });
  it("caps width and keeps all eight alignments inside the target profile", () => {
    const config = createDefaultMusicModuleConfig();
    config.profiles.vertical.views.full.widthPx = 1920;
    for (const alignment of ["top-left", "top-center", "top-right", "center-left", "center-right", "bottom-left", "bottom-center", "bottom-right"] as const) {
      config.profiles.vertical.alignment = alignment;
      const projection = projectMusicWidget(snapshot, status, config, "vertical", 10000, 11000)!;
      expect(projection.layout.width).toBe(1080);
      expect(projection.layout.x).toBe(0);
      expect(projection.layout.y).toBe(alignment.startsWith("top") ? 0 : alignment.startsWith("center") ? 871 : 1742);
      expect(projection.profile.views.full.widthPx).toBe(1080);
      expect(config.profiles.vertical.views.full.widthPx).toBe(1920);
    }
  });
  it("fits saved component boxes when a target profile clips widget width", () => {
    const config = createDefaultMusicModuleConfig();
    const view = config.profiles.vertical.views.full;
    view.widthPx = 1920;
    const rect = { x: 1500, y: 20, width: 400, height: 20 };
    view.componentLayout = { artwork: rect, title: rect, details: rect, progress: rect, time: rect };
    const projected = projectMusicWidget(snapshot, status, config, "vertical", 10000, 11000)!;
    expect(projected.profile.views.full.componentLayout?.title).toEqual({ ...rect, x: 680 });
    expect(config.profiles.vertical.views.full.componentLayout?.title).toEqual(rect);
  });
  it("fails closed when profile capping consumes the configured content area", () => {
    const config = createDefaultMusicModuleConfig();
    config.profiles.vertical.views.full.widthPx = 1920;
    config.profiles.vertical.views.full.contentInsets = { left: 512, right: 512, top: 0, bottom: 0 };
    // 56px remains after the cap; it stays valid even when artwork cannot fit.
    expect(projectMusicWidget(snapshot, status, config, "vertical", 10000, 11000)).not.toBeNull();
    config.profiles.landscape.views.full.widthPx = 160;
    config.profiles.landscape.views.full.contentInsets = { left: 80, right: 80, top: 0, bottom: 0 };
    expect(projectMusicWidget(snapshot, status, config, "landscape", 10000, 11000)).toBeNull();
  });
});


it("defaults desktop placement to alignment and clamps authored positions without mutating browser layout", () => {
  const config = createDefaultMusicModuleConfig();
  const browser = projectMusicWidget(snapshot, status, config, "landscape", 10000, 10000)!;
  expect(config.desktopPlacement).toEqual({ full: null, compact: null });
  expect(applyMusicDesktopPlacement(browser, config)).toEqual(browser);
  config.desktopPlacement.full = { x: 1900, y: 1000 };
  const desktop = applyMusicDesktopPlacement(browser, config);
  expect(desktop.layout).toMatchObject({ x: 1280, y: 902 });
  expect(browser.layout).toMatchObject({ x: 0, y: 902 });
  config.desktopPlacement.compact = { x: 45, y: 67 };
  config.profiles.landscape.initialView = "compact";
  const compact = projectMusicWidget(snapshot, status, config, "landscape", 10000, 10000)!;
  expect(applyMusicDesktopPlacement(compact, config).layout).toMatchObject({ x: 45, y: 67 });
});

it("scales desktop footprint, preserves browser geometry and clamps to canvas", () => {
  const config = createDefaultMusicModuleConfig();
  config.desktopScale.full = 2;
  config.desktopPlacement.full = { x: 1900, y: 1000 };
  const browser = projectMusicWidget(snapshot, status, config, "landscape", 10000, 10000)!;
  const desktop = applyMusicDesktopPlacement(browser, config);
  expect(desktop.renderScale).toBe(2);
  expect(desktop.layout).toMatchObject({ x: 640, y: 724, width: 640, height: 178 });
  expect(browser.renderScale).toBeUndefined();
  expect(browser.layout).toMatchObject({ x: 0, y: 902 });
  expect(desktop.profile).toEqual(browser.profile);
});
