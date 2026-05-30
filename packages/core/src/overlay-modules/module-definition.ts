import type { OverlayModuleDefinition } from "./types.js";

export interface AlertsOverlayModuleConfig {
  readonly canvas: {
    readonly width: number;
    readonly height: number;
  };
}

export const alertsOverlayModuleDefinition = {
  id: "alerts",
  displayName: "Alerts",
  version: "0.0.0",
  defaultEnabled: true,
  configSchemaVersion: 1,
  defaultConfig: {
    canvas: {
      width: 1920,
      height: 1080
    }
  },
  wizard: {
    steps: [
      {
        id: "alerts-canvas",
        title: "Canvas",
        fields: [
          {
            id: "canvas.width",
            label: "Canvas width",
            type: "number",
            required: true
          },
          {
            id: "canvas.height",
            label: "Canvas height",
            type: "number",
            required: true
          }
        ]
      }
    ]
  },
  renderer: {
    entryPoint: "overlay/modules/alerts",
    supportedOutputs: ["module", "unified"]
  }
} as const satisfies OverlayModuleDefinition<AlertsOverlayModuleConfig>;
