import { describe, expect, it } from "vitest";
import { snapEditorRect, type EditorSnapOptions } from "./snapping.js";

const options: EditorSnapOptions = { mode: "move", bounds: { width: 500, height: 400 }, peers: [], grid: true, alignment: true, scale: 1 };
const rect = { x: 113, y: 127, width: 80, height: 40 };
describe("shared editor snapping", () => {
  it("snaps grid independently and allows exact free movement", () => {
    expect(snapEditorRect(rect, { ...options, alignment: false }).rect).toEqual({ ...rect, x: 110, y: 130 });
    expect(snapEditorRect(rect, { ...options, grid: false, alignment: false })).toEqual({ rect, guides: [] });
  });
  it("matches peer edges, centers and opposite edges with alignment taking precedence", () => {
    const peers = [{ x: 117, y: 132, width: 100, height: 60 }];
    expect(snapEditorRect(rect, { ...options, peers }).rect).toEqual({ ...rect, x: 117, y: 132 });
    expect(snapEditorRect({ ...rect, x: 125 }, { ...options, peers }).rect.x).toBe(127);
    expect(snapEditorRect({ ...rect, x: 136 }, { ...options, peers }).rect.x).toBe(137);
    expect(snapEditorRect({ ...rect, x: 215 }, { ...options, peers }).rect.x).toBe(217);
  });
  it("retains canvas edge and center alignment", () => {
    expect(snapEditorRect({ ...rect, x: 2, y: 179 }, options).rect).toEqual({ ...rect, x: 0, y: 180 });
    expect(snapEditorRect({ ...rect, x: 419, y: 358 }, options).rect).toEqual({ ...rect, x: 420, y: 360 });
  });
  it("uses screen-space tolerance at different zoom levels", () => {
    const candidate = { ...rect, x: 108 };
    const peers = [{ x: 117, y: 0, width: 200, height: 20 }];
    expect(snapEditorRect(candidate, { ...options, grid: false, peers, scale: 0.5 }).rect.x).toBe(117);
    expect(snapEditorRect(candidate, { ...options, grid: false, peers, scale: 2 }).rect.x).toBe(108);
  });
  it("resizes on the absolute grid without moving its leading edge", () => {
    expect(snapEditorRect(rect, { ...options, mode: "resize", alignment: false }).rect).toEqual({ ...rect, width: 77, height: 43 });
  });
  it("resizes trailing edges and centers to peers and reports transient guides", () => {
    const result = snapEditorRect({ x: 20, y: 30, width: 98, height: 69 }, { ...options, mode: "resize", grid: false, peers: [{ x: 120, y: 100, width: 20, height: 20 }] });
    expect(result.rect).toEqual({ x: 20, y: 30, width: 100, height: 70 });
    expect(result.guides).toEqual([{ axis: "x", position: 120 }, { axis: "y", position: 100 }]);
    expect(snapEditorRect({ x: 20, y: 30, width: 192, height: 138 }, { ...options, mode: "resize", grid: false, peers: [{ x: 120, y: 100, width: 20, height: 20 }] }).rect.width).toBe(200);
  });
  it("keeps grid rounding and peer candidates inside bounds and minimum sizes", () => {
    const result = snapEditorRect({ x: 493, y: 390, width: 5, height: 7 }, { ...options, mode: "resize", minSize: 1 });
    expect(result.rect.x + result.rect.width).toBeLessThanOrEqual(500);
    expect(result.rect.y + result.rect.height).toBeLessThanOrEqual(400);
    expect(result.rect.width).toBeGreaterThanOrEqual(1);
    expect(snapEditorRect({ x: 493, y: 390, width: 80, height: 60 }, { ...options, mode: "resize", grid: false, alignment: false }).rect).toEqual({ x: 493, y: 390, width: 7, height: 10 });
    expect(snapEditorRect({ x: 100, y: 50, width: 1, height: 1 }, { ...options, mode: "resize", minSize: 24 }).rect.width).toBeGreaterThanOrEqual(24);
  });
});
