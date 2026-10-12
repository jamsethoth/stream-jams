import { describe, expect, it } from "vitest";
import { videosProjectionSchema } from "./contract.js";
import { browserVideosLayout, createDefaultVideosLayout, defaultVideoShadow, isValidVideosLayout } from "./layout.js";
import { videosPlacementGeometry } from "./placement-geometry.js";
import { createDefaultVideosModuleConfig, currentVideosModuleConfigSchema } from "./schemas.js";

describe("Videos content and placement", () => {
  it("rejects destination selectors in current configuration mappings", () => {
    const config = createDefaultVideosModuleConfig();
    expect(currentVideosModuleConfigSchema.safeParse({ ...config, rewardMappings: [{ rewardId: "ordinary" }] }).success).toBe(true);
    for (const purpose of ["live", "test"]) expect(currentVideosModuleConfigSchema.safeParse({ ...config, rewardMappings: [{ rewardId: "old", purpose }] }).success).toBe(false);
  });
  it("retains the default desktop box and exact picture with two-line reserve", () => {
    expect(createDefaultVideosLayout()).toEqual({ schemaVersion: 2, content: { width: 1382, height: 876 }, desktopPlacement: { x: 269, y: 140, scale: 1 } });
    expect(videosPlacementGeometry(createDefaultVideosLayout())).toEqual({ scale: 1, frame: { width: 1382, height: 777.375 }, gap: 12 });
  });
  it("bounds integer content independently from scaled desktop footprint", () => {
    const layout = createDefaultVideosLayout();
    const accepts = (value: unknown) => currentVideosModuleConfigSchema.safeParse({ ...createDefaultVideosModuleConfig(), layout: value }).success;
    expect(accepts({ ...layout, content: { width: 240, height: 180 }, desktopPlacement: { x: 1680, y: 900, scale: 1 } })).toBe(true);
    expect(accepts({ ...layout, content: { width: 1920, height: 1080 }, desktopPlacement: { x: 960, y: 540, scale: 0.5 } })).toBe(true);
    expect(accepts({ ...layout, desktopPlacement: { x: 0.5, y: 0.25, scale: 0.5 } })).toBe(true);
    for (const content of [{ width: 239, height: 180 }, { width: 240, height: 179 }, { width: 1921, height: 180 }, { width: 240, height: 1081 }, { width: 240.5, height: 180 }]) expect(accepts({ ...layout, content })).toBe(false);
    for (const desktopPlacement of [{ x: -1, y: 0, scale: 1 }, { x: 0, y: 0, scale: 0 }, { x: 0, y: 0, scale: -1 }, { x: 1000, y: 0, scale: 1 }, { x: 0, y: 0, scale: 2 }, { x: Infinity, y: 0, scale: 1 }, { x: 0, y: 0, scale: NaN }]) expect(accepts({ ...layout, desktopPlacement })).toBe(false);
    expect(isValidVideosLayout({ ...layout, content: { width: 240, height: 180, extra: 1 } })).toBe(false);
    expect(accepts({ x: 0, y: 0, width: 240, height: 180 })).toBe(false);
  });
  it("accepts an optional bounded shadow and carries it to the browser projection", () => {
    const layout = { ...createDefaultVideosLayout(), desktopPlacement: { x: 10, y: 20, scale: 0.5 }, shadow: defaultVideoShadow };
    const accepts = (value: unknown) => currentVideosModuleConfigSchema.safeParse({ ...createDefaultVideosModuleConfig(), layout: value }).success;
    expect(isValidVideosLayout(layout)).toBe(true); expect(accepts(layout)).toBe(true);
    for (const shadow of [{ ...defaultVideoShadow, blur: 129 }, { ...defaultVideoShadow, offsetX: 1.5 }, { ...defaultVideoShadow, color: "#000000" }, { ...defaultVideoShadow, extra: 1 }, undefined]) {
      expect(isValidVideosLayout({ ...layout, shadow })).toBe(false); expect(accepts({ ...layout, shadow })).toBe(false);
    }
    expect(browserVideosLayout(layout)).toEqual({ ...layout, desktopPlacement: { x: 0, y: 0, scale: 1 } });
    expect(browserVideosLayout(createDefaultVideosLayout())).not.toHaveProperty("shadow");
    const serif = { ...createDefaultVideosLayout(), captionFont: "serif" };
    expect(isValidVideosLayout(serif)).toBe(true); expect(accepts(serif)).toBe(true); expect(browserVideosLayout(serif as never)).toMatchObject({ captionFont: "serif" });
    expect(isValidVideosLayout({ ...serif, captionFont: "comic" })).toBe(false); expect(accepts({ ...serif, captionFont: "comic" })).toBe(false);
  });
  it("fails transparent on invalid notice geometry without inventing a default", () => {
    const notice = { status: "notice", noticeId: "n1", notice: "no-clip", displayName: null };
    expect(videosProjectionSchema.safeParse({ ...notice, layout: createDefaultVideosLayout() }).success).toBe(true);
    expect(videosProjectionSchema.safeParse(notice).success).toBe(false);
    expect(videosProjectionSchema.safeParse({ ...notice, layout: { ...createDefaultVideosLayout(), desktopPlacement: { x: 1800, y: 0, scale: 1 } } }).success).toBe(false);
  });
  it("uses the same aspect fit at minimum, short-wide and default size regardless of placement", () => {
    const layout = createDefaultVideosLayout();
    const minimum = videosPlacementGeometry({ ...layout, content: { width: 240, height: 180 } });
    expect(minimum.scale).toBe(0.5); expect(minimum.gap).toBe(6);
    expect(minimum.frame.width).toBeCloseTo(131 * 16 / 9, 12); expect(minimum.frame.height).toBeCloseTo(131, 12);
    expect(videosPlacementGeometry({ ...layout, content: { width: 1920, height: 500 } }).frame).toEqual({ width: 402 * 16 / 9, height: 402 });
    expect(videosPlacementGeometry({ ...layout, desktopPlacement: { x: 0, y: 0, scale: 0.5 } })).toEqual({ scale: 1, frame: { width: 1382, height: 777.375 }, gap: 12 });
  });
});
