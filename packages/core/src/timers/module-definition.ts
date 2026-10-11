import type { OverlayModuleDefinition } from "../overlay-modules/types.js";
import { timersOverlayModuleConfigSchema } from "./schemas.js";
import type { TimersOverlayModuleConfig } from "./types.js";

// Current defaults are data: runtime renderers need not load historical upgrade validation.
const commonAppearance = {
  orientation: "vertical", maxVisible: 4, stackGapPx: 0, borderWidthPx: 2,
  borderColor: "#FFFFFFC7", backgroundColor: "#0D141F", backgroundOpacity: 1,
  runningAccent: null, pausedAccent: "#FBBF24E6", completedAccent: "#5EEAD4F2"
} as const;
const labelFont = { fontPreset: "system-sans", fontWeight: 700, color: "#FFFFFF", legacyFamily: "Inter, ui-sans-serif, system-ui, sans-serif" } as const;
const valueFont = { fontPreset: "monospace", fontWeight: 800, color: "#FFFFFF", legacyFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" } as const;

const defaultConfig: TimersOverlayModuleConfig = {
    schemaVersion: 2,
    profiles: {
      landscape: {
        appearance: { ...commonAppearance, cardWidthPx: 640, cardHeightPx: 70, gapPx: 8,
          blockPaddingPx: 7, inlinePaddingPx: 10, cornerRadiusPx: 8, iconSizePx: 34,
          labelFont: { ...labelFont, fontSizePx: 17 }, valueFont: { ...valueFont, fontSizePx: 20 } },
        desktopPlacement: { x: 64, y: 720, zIndex: 0, scale: 1 }
      },
      vertical: {
        appearance: { ...commonAppearance, cardWidthPx: 984, cardHeightPx: 120, gapPx: 14,
          blockPaddingPx: 12, inlinePaddingPx: 17, cornerRadiusPx: 14, iconSizePx: 58,
          labelFont: { ...labelFont, fontSizePx: 29 }, valueFont: { ...valueFont, fontSizePx: 35 } },
        desktopPlacement: { x: 48, y: 1320, zIndex: 0, scale: 1 }
      }
    }
  };

export const timersOverlayModuleDefinition = {
  id: "timers",
  displayName: "Timers",
  version: "0.0.0",
  defaultEnabled: false,
  configSchemaVersion: 2,
  defaultConfig,
  configSchema: timersOverlayModuleConfigSchema,
  wizard: {
    steps: [{
      id: "timer-stack",
      title: "Timer stack",
      fields: [
        { id: "profiles.landscape.appearance.maxVisible", label: "Landscape visible timers", type: "number", required: true },
        { id: "profiles.vertical.appearance.maxVisible", label: "Vertical visible timers", type: "number", required: true }
      ]
    }]
  },
  renderer: {
    entryPoint: "overlay/modules/timers",
    supportsDesktopComposition: true, supportedOutputs: ["module"]
  }
} as const satisfies OverlayModuleDefinition<TimersOverlayModuleConfig>;
