import type { OverlayModuleDefinition } from "../overlay-modules/types.js";
import { createDefaultMusicModuleConfig, musicModuleConfigSchema } from "./schemas.js";
import type { MusicModuleConfig } from "./types.js";

export const musicModuleDefinition = {
  id: "music", displayName: "Music", version: "0.0.0", defaultEnabled: false, configSchemaVersion: 1,
  defaultConfig: createDefaultMusicModuleConfig(), configSchema: musicModuleConfigSchema,
  wizard: { steps: [{ id: "music-appearance", title: "Music appearance", fields: [
    { id: "profiles.landscape.backgroundOpacity", label: "Landscape background opacity", type: "number", required: true },
    { id: "profiles.vertical.backgroundOpacity", label: "Vertical background opacity", type: "number", required: true }
  ] }] },
  renderer: { entryPoint: "overlay/modules/music", supportedOutputs: ["module", "unified"] }
} as const satisfies OverlayModuleDefinition<MusicModuleConfig>;
