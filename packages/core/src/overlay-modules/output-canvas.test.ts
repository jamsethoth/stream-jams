import { describe, expect, it } from "vitest";
import { moduleOutputCanvas, outputCanvasSchema, sceneOutputCanvas } from "./output-canvas.js";

describe("output canvas", () => {
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
  it("keeps every actual module scene-sized until its owning slice", () => {
    for (const moduleId of ["music", "timers", "videos", "alerts", "screen-effects"]) {
      const config = { moduleId, enabled: false, updatedAt: "2026-10-11T00:00:00.000Z", config: {} };
      expect(moduleOutputCanvas(config, "landscape", "browser", 5)).toEqual(sceneOutputCanvas(5));
      expect(moduleOutputCanvas(config, "vertical", "browser", 5)).toEqual(sceneOutputCanvas(5, 1080, 1920));
      expect(moduleOutputCanvas(config, "vertical", "desktop", 5)).toEqual(sceneOutputCanvas(5));
    }
  });
});
