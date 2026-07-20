import { describe, expect, it } from "vitest";
import { moduleOutputRequestSchema, overlayInstructionSchema } from "./schemas.js";
import { moduleOverlayPath, moduleOverlayWebSocketPath } from "./types.js";

const layout = {
  x: 10,
  y: 20,
  width: 300,
  height: 120,
  zIndex: 1
};

describe("overlay schemas", () => {
  it("rejects invalid overlay purpose", () => {
    expect(
      moduleOutputRequestSchema.safeParse({
        moduleId: "alerts",
        overlayId: "main",
        purpose: "preview"
      }).success
    ).toBe(false);
  });

  it("accepts only fixed target profiles on module output requests", () => {
    expect(
      moduleOutputRequestSchema.safeParse({
        moduleId: "alerts",
        overlayId: "main",
        purpose: "live",
        targetProfileId: "vertical"
      }).success
    ).toBe(true);
    expect(
      moduleOutputRequestSchema.safeParse({
        moduleId: "alerts",
        overlayId: "main",
        purpose: "live",
        targetProfileId: "square"
      }).success
    ).toBe(false);
  });

  it("adds target profiles to module HTTP and WebSocket URLs without changing legacy URLs", () => {
    expect(
      moduleOverlayPath({
        moduleId: "alerts",
        purpose: "live",
        overlayKey: "ovl_key",
        targetProfileId: "landscape"
      })
    ).toBe("/overlay/modules/alerts/live/ovl_key?profile=landscape");
    expect(
      moduleOverlayWebSocketPath({
        moduleId: "alerts",
        purpose: "test",
        overlayKey: "ovl_key",
        targetProfileId: "vertical"
      })
    ).toBe("/overlay/ws/modules/alerts/test/ovl_key?profile=vertical");
    expect(moduleOverlayPath({ moduleId: "alerts", purpose: "live", overlayKey: "ovl_legacy" })).toBe(
      "/overlay/modules/alerts/live/ovl_legacy"
    );
  });

  it("accepts valid overlay instructions", () => {
    expect(
      overlayInstructionSchema.safeParse({
        id: "instruction-1",
        overlayId: "main",
        moduleId: "alerts",
        operatorTest: true,
        purpose: "live",
        scope: "module",
        visual: {
          assetId: "asset-1",
          mediaType: "image",
          layout
        },
        audio: null,
        text: {
          text: "Thanks for the follow",
          layout
        },
        tts: null,
        durationMs: 5000
      }).success
    ).toBe(true);
  });

  it("preserves optional shape and preset animation instructions", () => {
    const instruction = overlayInstructionSchema.parse({
      id: "instruction-shape",
      overlayId: "main",
      moduleId: "alerts",
      purpose: "live",
      scope: "module",
      visual: null,
      audio: null,
      text: null,
      shape: { fill: "#123456", layout },
      animation: {
        mode: "preset",
        entrance: "scale",
        exit: "fade",
        durationMs: 450,
        delayMs: 120,
        easing: "ease-in-out"
      },
      tts: null,
      durationMs: 5000
    });

    expect(instruction.shape).toEqual({ fill: "#123456", layout });
    expect(instruction.animation).toEqual({
      mode: "preset",
      entrance: "scale",
      exit: "fade",
      durationMs: 450,
      delayMs: 120,
      easing: "ease-in-out"
    });
  });
});
