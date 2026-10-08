import { describe, expect, it } from "vitest";
import { alertsOverlayModuleDefinition } from "./module-definition.js";
import { screenEffectsOverlayModuleDefinition } from "../screen-effects/module-definition.js";
import { StaticOverlayModuleRegistry, createDefaultOverlayModuleRegistry, listUnifiedOverlayModuleIds } from "./module-registry.js";
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
  it("registers Alerts, disabled Screen Effects, Timers, Music and Video shoutout in stable built-in order", () => {
    const registry = createDefaultOverlayModuleRegistry();

    expect(registry.listModules()).toEqual([
      alertsOverlayModuleDefinition,
      screenEffectsOverlayModuleDefinition,
      registry.getModule("timers"),
      registry.getModule("music"),
      registry.getModule("video-shoutout")
    ]);
    expect(registry.getModule("alerts")).toEqual(alertsOverlayModuleDefinition);
    expect(registry.getModule("screen-effects")).toEqual(screenEffectsOverlayModuleDefinition);
    expect(registry.getModule("timers")).toMatchObject({
      id: "timers",
      defaultEnabled: false,
      renderer: { supportedOutputs: ["module", "unified"] }
    });
    expect(alertsOverlayModuleDefinition.wizard.steps.map((step) => step.id)).toEqual(["alerts-canvas"]);
    expect(screenEffectsOverlayModuleDefinition).toMatchObject({
      defaultEnabled: false,
      renderer: { supportedOutputs: ["module", "unified"] }
    });
  });

  it("registers Video shoutout for module-specific outputs only", () => {
    const registry = createDefaultOverlayModuleRegistry();

    expect(registry.getModule("video-shoutout")).toMatchObject({
      id: "video-shoutout",
      renderer: { supportedOutputs: ["module"] }
    });
    expect(listUnifiedOverlayModuleIds(registry)).toEqual(["alerts", "screen-effects", "timers", "music"]);
  });

  it("returns null for unknown module ids", () => {
    const registry = createDefaultOverlayModuleRegistry();

    expect(registry.getModule("unknown-module")).toBeNull();
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
