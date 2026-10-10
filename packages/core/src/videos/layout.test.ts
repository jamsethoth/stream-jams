import { describe, expect, it } from "vitest";
import { videosProjectionSchema } from "./contract.js";
import { createDefaultVideosLayout, isValidVideosLayout } from "./layout.js";
import { videosPlacementGeometry } from "./placement-geometry.js";
import { createDefaultVideosModuleConfig, videosModuleConfigSchema } from "./schemas.js";

const notice = { status: "notice", noticeId: "n1", notice: "no-clip", displayName: null } as const;

describe("Videos placement", () => {
  it("defaults to the look outputs had before placement existed", () => {
    expect(createDefaultVideosLayout()).toEqual({ x: 269, y: 140, width: 1382, height: 876 });
    const geometry = videosPlacementGeometry(createDefaultVideosLayout());
    // 72% of the canvas wide with a 16:9 picture, the two-line caption below and 65 px above the bottom edge.
    expect(geometry).toEqual({ scale: 1, frame: { width: 1382, height: 777.375 }, gap: 12 });
  });

  it("migrates saved config without placement to the default box", () => {
    const legacy: Record<string, unknown> = { ...createDefaultVideosModuleConfig() };
    delete legacy.layout;
    expect(videosModuleConfigSchema.parse(legacy).layout).toEqual(createDefaultVideosLayout());
  });

  it("accepts boxes on the canvas and rejects partial, fractional, undersized or off-canvas boxes", () => {
    const config = createDefaultVideosModuleConfig();
    const accepts = (layout: unknown) => videosModuleConfigSchema.safeParse({ ...config, layout }).success;
    expect(accepts({ x: 0, y: 0, width: 1920, height: 1080 })).toBe(true);
    expect(accepts({ x: 1680, y: 900, width: 240, height: 180 })).toBe(true);
    expect(accepts({ x: 0, y: 0, width: 239, height: 180 })).toBe(false);
    expect(accepts({ x: 0, y: 0, width: 240, height: 179 })).toBe(false);
    expect(accepts({ x: 1681, y: 0, width: 240, height: 180 })).toBe(false);
    expect(accepts({ x: 0, y: 901, width: 240, height: 180 })).toBe(false);
    expect(accepts({ x: -1, y: 0, width: 240, height: 180 })).toBe(false);
    expect(accepts({ x: 0.5, y: 0, width: 240, height: 180 })).toBe(false);
    expect(accepts({ x: 0, y: 0, width: 240 })).toBe(false);
    expect(accepts({ x: 0, y: 0, width: 240, height: 180, zIndex: 1 })).toBe(false);
    expect(accepts(null)).toBe(false);
    expect(isValidVideosLayout({ x: Number.NaN, y: 0, width: 240, height: 180 })).toBe(false);
  });

  it("makes the overlay projection fail closed on a missing or invalid box", () => {
    expect(videosProjectionSchema.safeParse({ ...notice, layout: createDefaultVideosLayout() }).success).toBe(true);
    expect(videosProjectionSchema.safeParse(notice).success).toBe(false);
    expect(videosProjectionSchema.safeParse({ ...notice, layout: { x: 1800, y: 0, width: 1382, height: 876 } }).success).toBe(false);
  });

  it("fits the largest 16:9 picture above the caption and shrinks captions for small boxes", () => {
    // Wide and short: height limits the picture.
    expect(videosPlacementGeometry({ x: 0, y: 0, width: 1920, height: 500 }).frame).toEqual({ width: (500 - 98) * 16 / 9, height: 402 });
    // Small picture-in-picture: captions and spacing at half size.
    const small = videosPlacementGeometry({ x: 1440, y: 40, width: 400, height: 300 });
    expect(small.scale).toBe(0.5);
    expect(small.gap).toBe(6);
    expect(small.frame.width).toBe(400);
    expect(small.frame.height).toBe(225);
  });
});
