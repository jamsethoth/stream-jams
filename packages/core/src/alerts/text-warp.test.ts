import { describe, expect, it } from "vitest";
import { alertTextWarpSchema, createDefaultTextWarp, evaluateTextWarp, insertTextWarpSplit, removeTextWarpSplit } from "./text-warp.js";

describe("text warp", () => {
  it("creates a fresh identity surface", () => {
    const warp = createDefaultTextWarp();
    expect(alertTextWarpSchema.parse(warp)).toEqual(warp);
    expect(createDefaultTextWarp()).not.toBe(warp);
    expect(evaluateTextWarp(warp, 0.23, 0.78).x).toBeCloseTo(0.23, 12);
    expect(evaluateTextWarp(warp, 0.23, 0.78).y).toBeCloseTo(0.78, 12);
  });

  it.each(["horizontal", "vertical"] as const)("preserves a deformed surface at 441 samples after a %s split", (axis) => {
    const warp = createDefaultTextWarp();
    warp.points[4] = { x: 0.65, y: 0.25 };
    const split = insertTextWarpSplit(warp, axis, 0.25);
    expect(split).not.toBe(warp);
    for (let row = 0; row <= 20; row++) for (let column = 0; column <= 20; column++) {
      const before = evaluateTextWarp(warp, column / 20, row / 20);
      const after = evaluateTextWarp(split, column / 20, row / 20);
      expect(after.x).toBeCloseTo(before.x, 11);
      expect(after.y).toBeCloseTo(before.y, 11);
    }
    expect(removeTextWarpSplit(split, axis, 1).points).toEqual(warp.points);
  });

  it("rejects invalid stored topology, coordinates and unknown fields", () => {
    const warp = createDefaultTextWarp();
    for (const columns of [[0, 1], [0, 0.5, 0.5, 1], [0, 0.05, 1], [0.1, 0.5, 1], [0, 0.5, 0.9], [0, NaN, 1], [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 1]]) {
      expect(alertTextWarpSchema.safeParse({ ...warp, columns }).success).toBe(false);
    }
    for (const point of [{ x: -0.51, y: 0 }, { x: 1.51, y: 0 }, { x: 0, y: -1.01 }, { x: 0, y: 2.01 }, { x: Infinity, y: 0 }, { x: 0, y: NaN }, { x: 0, y: 0, extra: true }]) {
      expect(alertTextWarpSchema.safeParse({ ...warp, points: [point, ...warp.points.slice(1)] }).success).toBe(false);
    }
    expect(alertTextWarpSchema.safeParse({ ...warp, points: warp.points.slice(1) }).success).toBe(false);
    expect(alertTextWarpSchema.safeParse({ ...warp, extra: true }).success).toBe(false);
  });

  it("rejects insertion near neighbors, outside bounds and above the axis limit", () => {
    const warp = createDefaultTextWarp();
    for (const position of [-1, 0, 0.01, 0.45, 0.5, 0.55, 0.99, 1, NaN, Infinity]) {
      expect(insertTextWarpSplit(warp, "vertical", position)).toBe(warp);
    }
    let expanded = warp;
    for (const position of [0.125, 0.25, 0.75, 0.875]) expanded = insertTextWarpSplit(expanded, "vertical", position);
    expect(expanded.columns).toHaveLength(7);
    expect(insertTextWarpSplit(expanded, "vertical", 0.375)).toBe(expanded);
    for (const index of [-1, 0, 6, 7, NaN, 1.5]) expect(removeTextWarpSplit(expanded, "vertical", index)).toBe(expanded);
    expect(removeTextWarpSplit(warp, "horizontal", 1)).toBe(warp);
  });

  it("rejects a split whose interpolated handle exceeds stored coordinate bounds", () => {
    const warp = createDefaultTextWarp();
    warp.points = warp.points.map((point, index) => ({ ...point, x: index % 3 === 2 ? -0.5 : 1.5 }));
    expect(alertTextWarpSchema.safeParse(warp).success).toBe(true);
    expect(evaluateTextWarp(warp, 0.25, 0.5).x).toBeGreaterThan(1.5);
    expect(insertTextWarpSplit(warp, "vertical", 0.25)).toBe(warp);
  });
});
