import { describe, expect, it } from "vitest";
import { createDefaultMusicModuleConfig } from "../music/schemas.js";
import { projectMusicWidget } from "../music/projection.js";
import { overlayModulePresentationSchema } from "./presentation.js";
import { overlayModulePresentationSchema as legacyPresentationSchema } from "../timers/schemas.js";
import { overlayModuleSnapshotSchema } from "../overlays/schemas.js";
import { privateDesktopModuleSyncSchema } from "../overlays/desktop-visual-transport.js";

const snapshot = {
  providerId: "pear", generation: "generation", revision: 1,
  track: { id: "song", title: "Song", artists: ["Artist"], album: null, artworkRef: null },
  playbackState: "playing" as const, positionMs: 0, durationMs: null, observedAtEpochMs: 1000, session: null
};
const widget = projectMusicWidget(snapshot, { state: "connected", stale: false, diagnosticReference: null }, createDefaultMusicModuleConfig(), "landscape", 1000, 1000)!;
const timer = { kind: "timer-stack", stack: { targetProfileId: "landscape", region: { layout: { x: 0, y: 0, width: 200, height: 100, zIndex: 0 }, orientation: "vertical", maxVisible: 1 }, cards: [], overflowCount: 0 } };

describe("shared overlay presentation", () => {
  it("accepts both strict timer and music variants", () => {
    expect(overlayModulePresentationSchema.safeParse(timer).success).toBe(true);
    expect(overlayModulePresentationSchema.safeParse({ kind: "music-widget", widget }).success).toBe(true);
    expect(legacyPresentationSchema.safeParse({ kind: "music-widget", widget }).success).toBe(true);
    expect(overlayModuleSnapshotSchema.safeParse({ moduleId: "music", enabled: true, instructions: [], presentation: { kind: "music-widget", widget } }).success).toBe(true);
    expect(privateDesktopModuleSyncSchema.safeParse({ moduleId: "music", revision: 1, presentation: { kind: "music-widget", widget }, assets: [] }).success).toBe(true);
  });

  it("rejects cross-variant fields, wrong profile and malformed Music payloads", () => {
    expect(overlayModulePresentationSchema.safeParse({ ...timer, widget }).success).toBe(false);
    expect(overlayModulePresentationSchema.safeParse({ kind: "music-widget", widget, stack: timer.stack }).success).toBe(false);
    expect(overlayModulePresentationSchema.safeParse({ kind: "music-widget", widget: { ...widget, targetProfileId: "portrait" } }).success).toBe(false);
    expect(overlayModulePresentationSchema.safeParse({ kind: "music-widget", widget: { ...widget, snapshot: { ...snapshot, positionMs: -1 } } }).success).toBe(false);
  });
});
