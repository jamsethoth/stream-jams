import { describe, expect, it } from "vitest";
import { moduleOutputCanvas, outputCanvasSchema, sceneOutputCanvas } from "./output-canvas.js";
import { createDefaultMusicModuleConfig } from "../music/schemas.js";
import { createDefaultVideosModuleConfig } from "../videos/schemas.js";

describe("output canvas", () => {
  it("advertises saved Video content dimensions while disabled, independent of desktop placement", () => {
    const config = { moduleId: "videos", enabled: false, updatedAt: "2026-10-11T00:00:00Z", config: createDefaultVideosModuleConfig() };
    expect(moduleOutputCanvas(config, null, "browser", 9)).toMatchObject({ kind: "content", width: 1382, height: 876, origin: { x: 0, y: 0 }, configRevision: 9 });
    expect(moduleOutputCanvas(config, null, "desktop", 9)).toEqual(sceneOutputCanvas(9));
  });
  it("adds the Video shadow margin around browser content and shifts the box past it", () => {
    const base = createDefaultVideosModuleConfig();
    const config = (shadow: object) => ({ moduleId: "videos", enabled: true, updatedAt: "2026-10-11T00:00:00Z", config: { ...base, layout: { ...base.layout, shadow } } });
    expect(moduleOutputCanvas(config({ offsetX: 0, offsetY: 18, blur: 48, spread: 0, color: "#00000073" }), null, "browser", 1)).toMatchObject({
      width: 1382 + 192, height: 876 + 78 + 114, origin: { x: 96, y: 78 }, insets: { top: 78, right: 96, bottom: 114, left: 96 } });
    expect(moduleOutputCanvas(config({ offsetX: 0, offsetY: 18, blur: 48, spread: 0, color: "#00000000" }), null, "browser", 1)).toMatchObject({
      width: 1382, height: 876, origin: { x: 0, y: 0 } });
    expect(moduleOutputCanvas(config({ offsetX: 0, offsetY: 18, blur: 48, spread: 0, color: "#00000073" }), null, "desktop", 1)).toEqual(sceneOutputCanvas(1));
  });
  it("rejects unsafe geometry before publication", () => {
    const canvas = sceneOutputCanvas();
    for (const value of [0, -1, 1.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(outputCanvasSchema.safeParse({ ...canvas, width: value }).success).toBe(false);
      expect(outputCanvasSchema.safeParse({ ...canvas, height: value }).success).toBe(false);
    }
    for (const configRevision of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(outputCanvasSchema.safeParse({ ...canvas, configRevision }).success).toBe(false);
    expect(outputCanvasSchema.safeParse({ ...canvas, origin: { x: Infinity, y: 0 } }).success).toBe(false);
    expect(outputCanvasSchema.safeParse({ ...canvas, insets: { ...canvas.insets, left: -1 } }).success).toBe(false);
    expect(outputCanvasSchema.safeParse({ ...canvas, width: 640, kind: "content", origin: { x: 0.5, y: -0.5 } }).success).toBe(true);
  });
  it("keeps other modules scene-sized until their owning slices", () => {
    for (const moduleId of ["alerts", "screen-effects"]) {
      const config = { moduleId, enabled: false, updatedAt: "2026-10-11T00:00:00.000Z", config: {} };
      expect(moduleOutputCanvas(config, "landscape", "browser", 5)).toEqual(sceneOutputCanvas(5));
      expect(moduleOutputCanvas(config, "vertical", "browser", 5)).toEqual(sceneOutputCanvas(5, 1080, 1920));
      expect(moduleOutputCanvas(config, "vertical", "desktop", 5)).toEqual(sceneOutputCanvas(5));
    }
  });
  it("advertises Music's saved envelope while disabled, with legacy landscape and private scene semantics", () => {
    const config = { moduleId: "music", enabled: false, updatedAt: "2026-10-11T00:00:00Z", config: createDefaultMusicModuleConfig() };
    for (const profile of [null, "landscape", "vertical"] as const) {
      expect(moduleOutputCanvas(config, profile, "browser", 5)).toMatchObject({ kind: "content", width: 840, height: 378, configRevision: 5 });
      expect(moduleOutputCanvas(config, profile, "desktop", 5)).toEqual(sceneOutputCanvas(5));
    }
  });
});
