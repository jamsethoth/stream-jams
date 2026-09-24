import { describe, expect, it } from "vitest";
import { readModuleOverlayParams, readUnifiedOverlayParams } from "./overlay-route-params.js";

describe("overlay route parameters", () => {
  it("normalizes module and unified route parameters without coercing values", () => {
    expect(readModuleOverlayParams({ moduleId: "alerts", purpose: "live", overlayKey: "ovl_x" }))
      .toEqual({ moduleId: "alerts", purpose: "live", overlayKey: "ovl_x" });
    expect(readModuleOverlayParams({ moduleId: 1, purpose: "replay", overlayKey: null }))
      .toEqual({ moduleId: "", purpose: null, overlayKey: "" });
    expect(readUnifiedOverlayParams({ purpose: "test", overlayKey: "ovl_y" }))
      .toEqual({ purpose: "test", overlayKey: "ovl_y" });
  });
});
