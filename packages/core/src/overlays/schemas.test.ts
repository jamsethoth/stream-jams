import { describe, expect, it } from "vitest";
import { moduleOutputRequestSchema, overlayInstructionSchema } from "./schemas.js";

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

  it("accepts valid overlay instructions", () => {
    expect(
      overlayInstructionSchema.safeParse({
        id: "instruction-1",
        overlayId: "main",
        moduleId: "alerts",
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
});
