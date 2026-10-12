import type { OverlayModuleDefinition } from "../overlay-modules/types.js";
import { z } from "zod";

/** Data shares values across ordinary browser sources and the private desktop composition. */
export const dataOverlaysModuleDefinition = {
  id: "data-overlays", displayName: "Data Overlays", version: "0.0.0", defaultEnabled: false,
  configSchemaVersion: 1, defaultConfig: {}, configSchema: z.object({}).strict(),
  wizard: { steps: [{ id: "data-overlays", title: "Data Overlays", fields: [] }] }, renderer: { entryPoint: "overlay/modules/data-overlays", supportedOutputs: ["module"], supportsDesktopComposition: true }
} as const satisfies OverlayModuleDefinition<Record<string, never>>;
