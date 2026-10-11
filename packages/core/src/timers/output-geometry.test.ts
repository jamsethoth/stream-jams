import { describe, expect, it } from "vitest";
import { projectTimerStack, resolveTimerOutputGeometry, timersOverlayModuleDefinition, timersOverlayModuleConfigSchema, upgradeTimersConfig } from "../index.js";
import type { TimerRunState } from "./types.js";

const run: TimerRunState = { status: "paused", definitionId: "one", generation: "same-run", remainingMs: 12345,
  snapshot: { id: "one", label: "One", durationMs: 12345, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] } } };
describe("Timer output geometry", () => {
  it("edge_fit_becomes_desktop_only_scale with hidden and visible overflow", () => {
    for (const orientation of ["vertical", "horizontal"] as const) {
      const config = upgradeTimersConfig({ profiles: { landscape: { layout: { x: 1320, y: 780, width: 600, height: 300, zIndex: 20 }, orientation, maxVisible: 3 },
        vertical: { layout: { x: 48, y: 1320, width: 984, height: 480, zIndex: 0 }, orientation: "vertical", maxVisible: 4 } } });
      const profile = config.profiles.landscape; const geometry = resolveTimerOutputGeometry(profile);
      for (const count of [0, 1, 5]) {
        const runs = Array.from({ length: count }, (_, index) => ({ ...run, definitionId: `timer-${index}`, generation: `run-${index}` }));
        const desktop = projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", profile, geometry, runs, recipientKind: "desktop" });
        const browser = projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", profile, geometry, runs, recipientKind: "browser" });
        expect(desktop.renderScale).toBe(orientation === "vertical" ? 300 / 346 : 600 / 747);
        expect(browser.renderScale).toBe(1); expect(browser.region.layout).toMatchObject({ x: 48, y: 40, zIndex: 0 });
        if (count) expect(desktop.cards[0]?.slot).toMatchObject({ x: 1320, y: 780, zIndex: 20 });
      }
    }
  });
  it("browser content is independent of placement, has shadow reserve and rounds only the envelope", () => {
    const profile = timersOverlayModuleDefinition.defaultConfig.profiles.landscape;
    const geometry = resolveTimerOutputGeometry(profile);
    expect(geometry).toMatchObject({ width: 736, height: 409, origin: { x: 0, y: 0 }, insets: { left: 48, top: 40, right: 48, bottom: 56 } });
    const moved = { ...profile, desktopPlacement: { x: 10, y: 20, zIndex: 2, scale: .5 } };
    expect(projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", profile, runs: [run], recipientKind: "browser" }))
      .toEqual(projectTimerStack({ nowEpochMs: 0, targetProfileId: "landscape", profile: moved, runs: [run], recipientKind: "browser" }));
    const fractional = resolveTimerOutputGeometry({ ...moved, appearance: { ...moved.appearance, cardHeightPx: 70.33333333333333 } });
    expect(fractional.slots[1]?.height).toBe(70.33333333333333);
    expect(fractional.height).toBe(Math.ceil(fractional.footprint.height + 96));
  });
  it("validates compound profile footprint and all appearance fields independently", () => {
    const original = timersOverlayModuleDefinition.defaultConfig;
    const values = { cardWidthPx: 650, cardHeightPx: 80, maxVisible: 3, stackGapPx: 3, gapPx: 9, blockPaddingPx: 8, inlinePaddingPx: 11,
      cornerRadiusPx: 9, borderWidthPx: 3, borderColor: "#123456", backgroundColor: "#234567", backgroundOpacity: .4, iconSizePx: 35,
      runningAccent: "#345678", pausedAccent: "#456789", completedAccent: "#567890" };
    for (const [field, value] of Object.entries(values)) {
      const candidate = { ...original, profiles: { ...original.profiles, landscape: { ...original.profiles.landscape, appearance: { ...original.profiles.landscape.appearance, [field]: value } } } };
      expect(timersOverlayModuleConfigSchema.parse(candidate).profiles.landscape.appearance).toMatchObject({ [field]: value });
    }
    const bad = { ...original, profiles: { ...original.profiles, landscape: { ...original.profiles.landscape, desktopPlacement: { x: 1900, y: 1000, zIndex: 0, scale: 1 } } } };
    expect(timersOverlayModuleConfigSchema.safeParse(bad).success).toBe(false);
  });
});
