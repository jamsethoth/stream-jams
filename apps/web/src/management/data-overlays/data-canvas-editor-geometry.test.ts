import { describe, expect, it } from "vitest";
import { constrainDataCanvasGeometry, moveDataCanvasGeometry, resizeDataCanvasGeometry } from "./data-canvas-editor-geometry.js";

const bounds = { width: 1920, height: 1080 };
const rect = { x: 41, y: 43, width: 100, height: 80 };
describe("data canvas geometry", () => {
  it("shares grid snapping for pointer, keyboard and numeric geometry", () => {
    const options = { grid: true };
    expect(moveDataCanvasGeometry(rect, 11, 12, bounds, options)).toEqual(constrainDataCanvasGeometry({ ...rect, x: 52, y: 55 }, bounds, options));
    expect(moveDataCanvasGeometry(rect, 11, 12, bounds, options).rect).toEqual({ ...rect, x: 50, y: 60 });
    expect(resizeDataCanvasGeometry(rect, 11, 12, bounds, options)).toEqual(constrainDataCanvasGeometry({ ...rect, width: 111, height: 92 }, bounds, { ...options, mode: "resize" }));
  });
  it("supports exact edits when snapping is off and constrains each edge", () => {
    expect(moveDataCanvasGeometry(rect, 1, -1, bounds).rect).toEqual({ ...rect, x: 42, y: 42 });
    expect(moveDataCanvasGeometry(rect, 9999, -9999, bounds).rect).toEqual({ ...rect, x: 1820, y: 0 });
    expect(resizeDataCanvasGeometry(rect, 9999, -9999, bounds).rect).toEqual({ ...rect, width: 1879, height: 1 });
  });
  it("uses existing peer alignment with canvas-scaled guides", () => {
    const result = moveDataCanvasGeometry(rect, 156, 0, bounds, { alignment: true, scale: 1, peers: [{ x: 200, y: 400, width: 100, height: 80 }] });
    expect(result.rect.x).toBe(200);
    expect(result.guides).toContainEqual({ axis: "x", position: 200 });
  });
  it.each([NaN, Infinity, -Infinity])("rejects nonfinite geometry %s", invalid => {
    expect(() => constrainDataCanvasGeometry({ ...rect, x: invalid }, bounds)).toThrow("finite");
  });
  it("rejects invalid bounds and scales", () => {
    expect(() => constrainDataCanvasGeometry(rect, { width: 0, height: 10 })).toThrow();
    expect(() => constrainDataCanvasGeometry(rect, bounds, { scale: 0 })).toThrow();
  });
});
