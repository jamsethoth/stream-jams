import { describe, expect, it } from "vitest";
import { createDefaultMusicModuleConfig } from "./schemas.js";
import { resolveMusicOutputGeometry } from "./output-geometry.js";

describe("Music output geometry", () => {
  it.each(["landscape", "vertical"] as const)("reserves both views and native shadows for %s", target => {
    const config = createDefaultMusicModuleConfig();
    expect(resolveMusicOutputGeometry(config, target)).toMatchObject({ kind: "content", width: 840, height: 378,
      origin: { x: 0, y: 0 }, insets: { left: 100, right: 100, top: 82, bottom: 118 } });
    const baseline = resolveMusicOutputGeometry(config, target);
    config.desktopPlacement.full = { x: 1777, y: 999 }; config.desktopScale.full = 2;
    config.profiles[target].alignment = "top-right"; config.profiles[target].initialView = "compact";
    config.profiles[target].idleMode = "hide";
    expect(resolveMusicOutputGeometry(config, target)).toEqual(baseline);
  });
  it("takes each side's maximum across views, with negative offsets/spread and transparent shadows", () => {
    const config = createDefaultMusicModuleConfig();
    config.profiles.landscape.views.full.shadow = { offsetX: -20, offsetY: 12, blur: 10, spread: -5, color: "#000000FF" };
    config.profiles.landscape.views.compact.shadow = { offsetX: 30, offsetY: -40, blur: 20, spread: 5, color: "#00000080" };
    expect(resolveMusicOutputGeometry(config, "landscape")).toMatchObject({ width: 750, height: 290,
      insets: { left: 35, right: 75, top: 85, bottom: 27 } });
    config.profiles.landscape.views.compact.shadow.color = "#00000000";
    expect(resolveMusicOutputGeometry(config, "landscape")).toMatchObject({ width: 675, height: 208,
      insets: { left: 35, right: 0, top: 3, bottom: 27 } });
  });
  it("fits the existing profile width before reserving the union without mutating saved settings", () => {
    const config = createDefaultMusicModuleConfig();
    config.profiles.vertical.views.full.widthPx = 1920;
    config.profiles.vertical.views.compact.heightPx = 300;
    expect(resolveMusicOutputGeometry(config, "vertical")).toMatchObject({ width: 1280, height: 500 });
    expect(resolveMusicOutputGeometry(config, "landscape").width).toBe(840);
    expect(config.profiles.vertical.views.full.widthPx).toBe(1920);
  });
  it("keeps maximum and minimum supported widget geometry finite and rejects invalid compound settings", () => {
    const config = createDefaultMusicModuleConfig();
    config.profiles.landscape.views.full.widthPx = 1920; config.profiles.landscape.views.full.heightPx = 1080;
    config.profiles.landscape.views.full.shadow = { offsetX: 128, offsetY: -128, blur: 128, spread: 64, color: "#000000FF" };
    expect(resolveMusicOutputGeometry(config, "landscape")).toMatchObject({ width: 2560, height: 1720 });
    for (const appearance of Object.values(config.profiles.landscape.views)) {
      appearance.widthPx = 160; appearance.heightPx = 48; appearance.shadow.color = "#00000000";
    }
    expect(resolveMusicOutputGeometry(config, "landscape")).toMatchObject({ width: 160, height: 48 });
    config.profiles.landscape.views.full.contentInsets.left = 160;
    expect(() => resolveMusicOutputGeometry(config, "landscape")).toThrow();
  });
});
