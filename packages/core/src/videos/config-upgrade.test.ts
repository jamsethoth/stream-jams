import { describe, expect, it } from "vitest";
import { upgradeVideosLayout, upgradeVideosRewardMappings } from "./config-upgrade.js";
import { createDefaultVideosModuleConfig, currentVideosModuleConfigSchema } from "./schemas.js";
import { videosPlacementGeometry } from "./placement-geometry.js";

describe("upgradeVideosLayout", () => {
  it.each([{ x: 269, y: 140, width: 1382, height: 876 }, { x: 1680, y: 900, width: 240, height: 180 }, { x: 1440, y: 40, width: 400, height: 300 }])("preserves legacy desktop footprint %j once", legacy => {
    const upgraded = upgradeVideosLayout(legacy);
    expect(upgraded).toEqual({ schemaVersion: 2, content: { width: legacy.width, height: legacy.height }, desktopPlacement: { x: legacy.x, y: legacy.y, scale: 1 } });
    expect(upgradeVideosLayout(upgraded)).toEqual(upgraded);
    const frame = videosPlacementGeometry(upgraded).frame;
    expect(frame.width / frame.height).toBeCloseTo(16 / 9, 12);
  });
  it("defaults only settings predating placement", () => {
    expect(upgradeVideosLayout(undefined)).toEqual({ schemaVersion: 2, content: { width: 1382, height: 876 }, desktopPlacement: { x: 269, y: 140, scale: 1 } });
  });
  it.each([null, {}, { x: 0, y: 0, width: 239, height: 180 }, { x: 1800, y: 0, width: 240, height: 180 }, { x: 0.5, y: 0, width: 240, height: 180 }, { schemaVersion: 3, content: { width: 240, height: 180 }, desktopPlacement: { x: 0, y: 0, scale: 1 } }])("blocks invalid input %j instead of resetting it", raw => {
    expect(() => upgradeVideosLayout(raw)).toThrow(/Videos layout/u);
  });
});

describe("Videos reward mapping review flag", () => {
  it("keeps former test mappings under review and ordinary mappings unreviewed", () => {
    expect(upgradeVideosRewardMappings([{ rewardId: "a", purpose: "test" }, { rewardId: "b", purpose: "live" }, { rewardId: "c" }]))
      .toEqual([{ rewardId: "a", reviewRequired: true }, { rewardId: "b", reviewRequired: false }, { rewardId: "c" }]);
  });
  it("defaults the flag to false, accepts true, and rejects non-boolean values", () => {
    const base = createDefaultVideosModuleConfig();
    expect(currentVideosModuleConfigSchema.parse({ ...base, rewardMappings: [{ rewardId: "a" }] }).rewardMappings).toEqual([{ rewardId: "a", reviewRequired: false }]);
    expect(currentVideosModuleConfigSchema.parse({ ...base, rewardMappings: [{ rewardId: "a", reviewRequired: true }] }).rewardMappings).toEqual([{ rewardId: "a", reviewRequired: true }]);
    expect(currentVideosModuleConfigSchema.safeParse({ ...base, rewardMappings: [{ rewardId: "a", reviewRequired: "yes" }] }).success).toBe(false);
    expect(currentVideosModuleConfigSchema.safeParse({ ...base, rewardMappings: [{ rewardId: "a", purpose: "test" }] }).success).toBe(false);
  });
});
