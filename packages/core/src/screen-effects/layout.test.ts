import { describe, expect, it } from "vitest";
import { fitScreenEffectCanvas } from "./layout.js";

describe("fitScreenEffectCanvas", () => {
  it.each([
    [1920, 1080, { x: 0, y: 0, width: 1920, height: 1080, scale: 1 }],
    [2560, 1440, { x: 0, y: 0, width: 2560, height: 1440, scale: 4 / 3 }],
    [1920, 1200, { x: 0, y: 60, width: 1920, height: 1080, scale: 1 }],
    [1080, 1920, { x: 0, y: 656.25, width: 1080, height: 607.5, scale: 0.5625 }]
  ])("uniformly contains 1920x1080 in %ix%i", (width, height, expected) => {
    expect(fitScreenEffectCanvas({ width, height })).toEqual(expected);
  });

  it.each([
    { width: 0, height: 1080 },
    { width: 1920, height: Number.NaN },
    { width: Number.POSITIVE_INFINITY, height: 1080 }
  ])("rejects invalid output bounds", (bounds) => {
    expect(() => fitScreenEffectCanvas(bounds)).toThrow();
  });
});
