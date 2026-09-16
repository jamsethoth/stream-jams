import { z } from "zod";
import type { OverlayModuleDefinition } from "../overlay-modules/types.js";

export interface ScreenEffectsOverlayModuleConfig {
  readonly canvas: {
    readonly width: 1920;
    readonly height: 1080;
  };
}

export const screenEffectsOverlayModuleConfigSchema = z.strictObject({
  canvas: z.strictObject({
    width: z.literal(1920),
    height: z.literal(1080)
  })
});

export const screenEffectsOverlayModuleDefinition = {
  id: "screen-effects",
  displayName: "Screen Effects",
  version: "0.0.0",
  defaultEnabled: false,
  configSchemaVersion: 1,
  defaultConfig: {
    canvas: {
      width: 1920,
      height: 1080
    }
  },
  configSchema: screenEffectsOverlayModuleConfigSchema,
  wizard: {
    steps: [{
      id: "screen-effects-canvas",
      title: "Landscape canvas",
      fields: []
    }]
  },
  renderer: {
    entryPoint: "overlay/modules/screen-effects",
    supportedOutputs: ["module", "unified"]
  }
} as const satisfies OverlayModuleDefinition<ScreenEffectsOverlayModuleConfig>;
