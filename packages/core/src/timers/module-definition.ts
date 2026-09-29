import type { OverlayModuleDefinition } from "../overlay-modules/types.js";
import { timersOverlayModuleConfigSchema } from "./schemas.js";
import type { TimersOverlayModuleConfig } from "./types.js";

export const timersOverlayModuleDefinition = {
  id: "timers",
  displayName: "Timers",
  version: "0.0.0",
  defaultEnabled: false,
  configSchemaVersion: 1,
  defaultConfig: {
    profiles: {
      landscape: {
        layout: { x: 64, y: 720, width: 640, height: 280, zIndex: 0 },
        orientation: "vertical",
        maxVisible: 4
      },
      vertical: {
        layout: { x: 48, y: 1320, width: 984, height: 480, zIndex: 0 },
        orientation: "vertical",
        maxVisible: 4
      }
    }
  },
  configSchema: timersOverlayModuleConfigSchema,
  wizard: {
    steps: [{
      id: "timer-stack",
      title: "Timer stack",
      fields: [
        { id: "profiles.landscape.maxVisible", label: "Landscape visible timers", type: "number", required: true },
        { id: "profiles.vertical.maxVisible", label: "Vertical visible timers", type: "number", required: true }
      ]
    }]
  },
  renderer: {
    entryPoint: "overlay/modules/timers",
    supportedOutputs: ["module", "unified"]
  }
} as const satisfies OverlayModuleDefinition<TimersOverlayModuleConfig>;
