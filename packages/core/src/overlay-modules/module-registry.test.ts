import { describe, expect, it } from "vitest";
import { alertsOverlayModuleDefinition } from "./module-definition.js";
import { StaticOverlayModuleRegistry, createDefaultOverlayModuleRegistry } from "./module-registry.js";
import type { OverlayModuleDefinition } from "./types.js";

const customModule: OverlayModuleDefinition = {
  id: "custom",
  displayName: "Custom",
  version: "0.0.0",
  defaultEnabled: false,
  configSchemaVersion: 1,
  defaultConfig: {},
  wizard: {
    steps: [
      {
        id: "custom-setup",
        title: "Custom setup",
        fields: [
          {
            id: "label",
            label: "Label",
            type: "text",
            required: true
          }
        ]
      }
    ]
  },
  renderer: {
    entryPoint: "overlay/modules/custom",
    supportedOutputs: ["module"]
  }
};

describe("overlay module registry", () => {
  it("registers Alerts as the first built-in overlay module", () => {
    const registry = createDefaultOverlayModuleRegistry();

    expect(registry.listModules()).toEqual([alertsOverlayModuleDefinition]);
    expect(registry.getModule("alerts")).toEqual(alertsOverlayModuleDefinition);
  });

  it("returns null for unknown module ids", () => {
    const registry = createDefaultOverlayModuleRegistry();

    expect(registry.getModule("music")).toBeNull();
  });

  it("keeps module list ordering stable and protects registry internals from caller mutation", () => {
    const registry = new StaticOverlayModuleRegistry([alertsOverlayModuleDefinition, customModule]);

    const modules = registry.listModules() as OverlayModuleDefinition[];
    modules.reverse();

    expect(registry.listModules().map((module) => module.id)).toEqual(["alerts", "custom"]);
  });

  it("rejects duplicate module ids during registry setup", () => {
    expect(
      () => new StaticOverlayModuleRegistry([alertsOverlayModuleDefinition, alertsOverlayModuleDefinition])
    ).toThrow('Duplicate overlay module id "alerts"');
  });
});
