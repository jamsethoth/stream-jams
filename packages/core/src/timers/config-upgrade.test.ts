import { describe, expect, it } from "vitest";
import * as core from "../index.js";

// Frozen pre-S07 renderer fixtures: independent of the new upgrader and resolver.
const defaults = { profiles: {
  landscape: { layout: { x: 64, y: 720, width: 640, height: 280, zIndex: 0 }, orientation: "vertical", maxVisible: 4 },
  vertical: { layout: { x: 48, y: 1320, width: 984, height: 480, zIndex: 0 }, orientation: "vertical", maxVisible: 4 }
} };
const upgrade = (value: unknown) => core.upgradeTimersConfig(value);

describe("Timer configuration upgrade", () => {
  it("preserves historically valid cramped slots for every supported capacity", () => {
    for (let maxVisible = 1; maxVisible <= 12; maxVisible++) {
      for (const orientation of ["vertical", "horizontal"] as const) {
        const legacy = { profiles: {
          landscape: { ...defaults.profiles.landscape, orientation, maxVisible },
          vertical: { ...defaults.profiles.vertical, orientation, maxVisible }
        } };
        const current = upgrade(legacy);
        expect(current.profiles.landscape.appearance.cardWidthPx).toBe(orientation === "horizontal" ? 640 / maxVisible : 640);
        expect(current.profiles.landscape.appearance.cardHeightPx).toBe(orientation === "vertical" ? 280 / maxVisible : 280);
        expect(upgrade(current)).toEqual(current);
      }
    }
    const pinned = upgrade({ profiles: { landscape: { ...defaults.profiles.landscape, maxVisible: 12 }, vertical: { ...defaults.profiles.vertical, maxVisible: 12 } } });
    expect(pinned.profiles.landscape.appearance).toMatchObject({ cardHeightPx: 280 / 12, blockPaddingPx: 4, iconSizePx: 16, labelFont: { fontSizePx: 10 }, valueFont: { fontSizePx: 12 } });
    expect(pinned.profiles.vertical.appearance.cardHeightPx).toBe(40);
  });

  it.each([601, 300])("preserves narrow horizontal %ipx stacks and rejects any customized cramped appearance", width => {
    const current = upgrade({ profiles: { ...defaults.profiles, landscape: { layout: { x: 1920 - width, y: 779, width, height: 301, zIndex: 9 }, orientation: "horizontal", maxVisible: 12 } } });
    const a = current.profiles.landscape.appearance;
    expect(a.cardWidthPx).toBe(width / 12);
    expect(upgrade(current)).toEqual(current);
    for (const [key, value] of Object.entries(a)) {
      // These four fields are derivation inputs, not customized legacy style measurements.
      if (["cardWidthPx", "cardHeightPx", "orientation", "maxVisible"].includes(key)) continue;
      const changed = typeof value === "number" ? value + 0.25 : typeof value === "string" ? "#123456" : value === null ? "#123456" : { ...value, color: "#123456" };
      expect(core.timerAppearanceSchema.safeParse({ ...a, [key]: changed }).success, key).toBe(false);
    }
    for (const font of ["labelFont", "valueFont"] as const) {
      for (const [key, value] of Object.entries(a[font])) {
        const changed = typeof value === "number" ? value + 1 : key === "color" ? "#123456" : key === "fontPreset" ? "serif" : undefined;
        expect(core.timerAppearanceSchema.safeParse({ ...a, [font]: { ...a[font], [key]: changed } }).success, `${font}.${key}`).toBe(false);
      }
    }
  });
  it("materializes the current default card measurements and exact font fallbacks", () => {
    const current = upgrade(defaults);
    expect(current.schemaVersion).toBe(2);
    expect(current.profiles.landscape.appearance).toMatchObject({ cardWidthPx: 640, cardHeightPx: 70,
      labelFont: { fontSizePx: 17, fontWeight: 700, legacyFamily: "Inter, ui-sans-serif, system-ui, sans-serif" },
      valueFont: { fontSizePx: 20, fontWeight: 800, legacyFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" },
      iconSizePx: 34, blockPaddingPx: 7, inlinePaddingPx: 10, gapPx: 8, cornerRadiusPx: 8, stackGapPx: 0 });
    expect(current.profiles.vertical.appearance).toMatchObject({ cardWidthPx: 984, cardHeightPx: 120,
      labelFont: { fontSizePx: 29 }, valueFont: { fontSizePx: 35 }, iconSizePx: 58 });
    expect(upgrade(current)).toEqual(current);
    expect(core.timersOverlayModuleDefinition.defaultConfig).toEqual(current);
  });

  for (const profile of ["landscape", "vertical"] as const) {
    for (const orientation of ["vertical", "horizontal"] as const) {
      it(`fractional_slots_preserve_desktop_geometry ${profile} ${orientation}`, () => {
        const bounds = profile === "landscape" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
        const region = { layout: { x: bounds.width - 601, y: bounds.height - 301, width: 601, height: 301, zIndex: 9 }, orientation, maxVisible: 3 };
        const current = upgrade({ profiles: { ...defaults.profiles, [profile]: region } });
        const appearance = current.profiles[profile].appearance;
        const width = orientation === "horizontal" ? 601 / 3 : 601;
        const height = orientation === "vertical" ? 301 / 3 : 301;
        expect(appearance.cardWidthPx).toBe(width); expect(appearance.cardHeightPx).toBe(height);
        const measure = (hr: number, wr: number, low: number, high: number) => Math.max(low, Math.min(high, Math.round(Math.min(height * hr, width * wr))));
        const font = measure(.24, .08, 10, 42), block = measure(.06, .018, 3, 10), inline = measure(.1, .03, 5, 16), offset = measure(.08, .025, 4, 14);
        const badgeWidth = font * 8 + inline * 2 + 2, badgeHeight = font + block * 2 + 2;
        const envelopeWidth = orientation === "vertical" ? Math.max(601, badgeWidth) : 601 + offset + badgeWidth;
        const envelopeHeight = orientation === "vertical" ? 301 + offset + badgeHeight : Math.max(301, badgeHeight);
        expect(current.profiles[profile].desktopPlacement).toEqual({ x: region.layout.x, y: region.layout.y, zIndex: 9, scale: Math.min(1, 601 / envelopeWidth, 301 / envelopeHeight) });
      });
    }
  }

  it("rejects invalid legacy or current compound geometry without resetting", () => {
    expect(() => upgrade({ ...defaults, bad: true })).toThrow();
    expect(() => upgrade({ profiles: { ...defaults.profiles, landscape: { ...defaults.profiles.landscape, layout: { x: 1900, y: 720, width: 640, height: 280, zIndex: 0 } } } })).toThrow();
    const current = upgrade(defaults);
    expect(() => upgrade({ ...current, profiles: { ...current.profiles, landscape: { ...current.profiles.landscape, appearance: { ...current.profiles.landscape.appearance, inlinePaddingPx: 500 } } } })).toThrow();
  });
});
