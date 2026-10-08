import type { OverlayModuleDefinition } from "../overlay-modules/types.js";
import { createDefaultVideosModuleConfig, videosModuleConfigSchema } from "./schemas.js";
import type { VideosModuleConfig } from "./types.js";

export const videosModuleDefinition = {
  id: "videos",
  displayName: "Videos",
  version: "0.0.0",
  // Nothing plays until a request is queued and the operator (or an allowed autoplay request) starts it.
  defaultEnabled: true,
  configSchemaVersion: 1,
  defaultConfig: createDefaultVideosModuleConfig(),
  configSchema: videosModuleConfigSchema,
  wizard: { steps: [{ id: "videos-limits", title: "Video limits", fields: [
    { id: "maxLengthSeconds", label: "Maximum length (seconds)", type: "number", required: true },
    { id: "gapSeconds", label: "Gap between videos (seconds)", type: "number", required: true }
  ] }] },
  renderer: { entryPoint: "overlay/modules/videos", supportedOutputs: ["module", "unified"] }
} as const satisfies OverlayModuleDefinition<VideosModuleConfig>;
