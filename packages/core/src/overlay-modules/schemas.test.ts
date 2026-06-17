import { describe, expect, it } from "vitest";
import { alertsOverlayModuleDefinition } from "./module-definition.js";
import { overlayModuleDefinitionSchema } from "./schemas.js";

describe("overlay module schemas", () => {
  it("accepts the built-in Alerts module definition and wizard metadata", () => {
    const result = overlayModuleDefinitionSchema.safeParse(alertsOverlayModuleDefinition);

    expect(result.success).toBe(true);
    expect(alertsOverlayModuleDefinition.wizard.steps).toHaveLength(1);
    expect(alertsOverlayModuleDefinition.wizard.steps[0]?.fields.some((field) => field.required)).toBe(true);
    expect(alertsOverlayModuleDefinition.wizard.steps[0]?.fields.map((field) => field.id)).toEqual([
      "canvas.width",
      "canvas.height"
    ]);
    expect(JSON.stringify(alertsOverlayModuleDefinition.wizard)).not.toContain("configSchema");
  });

  it("rejects module definitions without wizard steps", () => {
    expect(
      overlayModuleDefinitionSchema.safeParse({
        ...alertsOverlayModuleDefinition,
        wizard: {
          steps: []
        }
      }).success
    ).toBe(false);
  });

  it("requires the Alerts renderer to support module-specific and unified outputs", () => {
    expect(alertsOverlayModuleDefinition.renderer.supportedOutputs).toEqual(["module", "unified"]);
  });
});
