import { describe, expect, it } from "vitest";
import { alertsOverlayModuleDefinition } from "./module-definition.js";
import { screenEffectsOverlayModuleDefinition } from "../screen-effects/module-definition.js";
import { StaticOverlayModuleRegistry, createDefaultOverlayModuleRegistry, listUnifiedOverlayModuleIds, listDesktopOverlayModuleIds } from "./module-registry.js";
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
    supportsDesktopComposition: false, supportedOutputs: ["module"]
  }
};

describe("overlay module registry", () => {
  it.each([undefined, null, "true", 1])("requires an explicit boolean desktop composition capability: %j", capability => {
    expect(() => new StaticOverlayModuleRegistry([{
      ...customModule, renderer: { ...customModule.renderer, supportsDesktopComposition: capability }
    } as unknown as OverlayModuleDefinition])).toThrow();
  });
  it("keeps public unified inventory independent of private desktop capability", () => {
    const registry = new StaticOverlayModuleRegistry([
      { ...customModule, renderer: { ...customModule.renderer, supportsDesktopComposition: true } },
      { ...alertsOverlayModuleDefinition, renderer: { ...alertsOverlayModuleDefinition.renderer, supportsDesktopComposition: false, supportedOutputs: ["module", "unified"] } }
    ]);
    expect(listDesktopOverlayModuleIds(registry)).toEqual(["custom"]);
    expect(listUnifiedOverlayModuleIds(registry)).toEqual(["alerts"]);
    expect(listDesktopOverlayModuleIds(createDefaultOverlayModuleRegistry()))
      .toEqual(["alerts", "screen-effects", "timers", "music", "videos"]);
  });
  it("registers Alerts, disabled Screen Effects, Timers, Music and Videos in stable built-in order", () => {
    const registry = createDefaultOverlayModuleRegistry();

    expect(registry.listModules()).toEqual([
      alertsOverlayModuleDefinition,
      screenEffectsOverlayModuleDefinition,
      registry.getModule("timers"),
      registry.getModule("music"),
      registry.getModule("videos")
    ]);
    expect(registry.getModule("alerts")).toEqual(alertsOverlayModuleDefinition);
    expect(registry.getModule("screen-effects")).toEqual(screenEffectsOverlayModuleDefinition);
    expect(registry.getModule("timers")).toMatchObject({
      id: "timers",
      defaultEnabled: false,
      renderer: { supportedOutputs: ["module"], supportsDesktopComposition: true }
    });
    expect(alertsOverlayModuleDefinition.wizard.steps.map((step) => step.id)).toEqual(["alerts-canvas"]);
    expect(screenEffectsOverlayModuleDefinition).toMatchObject({
      defaultEnabled: false,
      renderer: { supportedOutputs: ["module"], supportsDesktopComposition: true }
    });
  });

  it("registers Videos for ordinary browser and private desktop outputs and retires Video shoutout", () => {
    const registry = createDefaultOverlayModuleRegistry();

    expect(registry.getModule("videos")).toMatchObject({
      id: "videos",
      renderer: { supportedOutputs: ["module"], supportsDesktopComposition: true }
    });
    expect(registry.getModule("video-shoutout")).toBeNull();
    expect(listUnifiedOverlayModuleIds(registry)).toEqual([]);
    expect(listDesktopOverlayModuleIds(registry)).toEqual(["alerts", "screen-effects", "timers", "music", "videos"]);
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
