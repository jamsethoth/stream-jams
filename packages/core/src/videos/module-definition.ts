import type { OverlayModuleDefinition } from "../overlay-modules/types.js";
import { createDefaultVideosModuleConfig, currentVideosModuleConfigSchema } from "./schemas.js";
import type { VideosModuleConfig } from "./types.js";

export const videosModuleDefinition = {
  id: "videos",
  displayName: "Videos",
  version: "0.0.0",
  // Nothing plays until a request is queued and the operator (or an allowed autoplay request) starts it.
  defaultEnabled: true,
  configSchemaVersion: 3,
  // Pure so bundles that never read the definition (the management startup graph) drop it.
  defaultConfig: /* @__PURE__ */ createDefaultVideosModuleConfig(),
  configSchema: currentVideosModuleConfigSchema,
  wizard: { steps: [{ id: "videos-limits", title: "Video limits", fields: [
    { id: "maxLengthSeconds", label: "Maximum length (seconds)", type: "number", required: true },
    { id: "gapSeconds", label: "Gap between videos (seconds)", type: "number", required: true }
  ] }] },
  renderer: { entryPoint: "overlay/modules/videos", supportsDesktopComposition: true, supportedOutputs: ["module"] }
} as const satisfies OverlayModuleDefinition<VideosModuleConfig>;
