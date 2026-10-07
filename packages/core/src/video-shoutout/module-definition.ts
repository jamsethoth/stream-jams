import type { OverlayModuleDefinition } from "../overlay-modules/types.js";
import { createDefaultVideoShoutoutModuleConfig, videoShoutoutModuleConfigSchema } from "./schemas.js";
import type { VideoShoutoutModuleConfig } from "./types.js";

export const videoShoutoutModuleDefinition = {
  id: "video-shoutout",
  displayName: "Video shoutout",
  version: "0.0.0",
  // Nothing renders until Streamer.bot sends a shoutout and an operator creates a browser-source key.
  defaultEnabled: true,
  configSchemaVersion: 1,
  defaultConfig: createDefaultVideoShoutoutModuleConfig(),
  configSchema: videoShoutoutModuleConfigSchema,
  wizard: { steps: [{ id: "video-shoutout-output", title: "Video shoutout output", fields: [] }] },
  // A clip is an independent OBS browser source; unified layering is deferred.
  renderer: { entryPoint: "overlay/modules/video-shoutout", supportedOutputs: ["module"] }
} as const satisfies OverlayModuleDefinition<VideoShoutoutModuleConfig>;
