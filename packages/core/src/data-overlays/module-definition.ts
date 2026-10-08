import type { OverlayModuleDefinition } from "../overlay-modules/types.js";
import { z } from "zod";

/** Registry and presentation integration is intentionally deferred to the output unit. */
export const dataOverlaysModuleDefinition = {
  id: "data-overlays", displayName: "Data Overlays", version: "0.0.0", defaultEnabled: false,
  configSchemaVersion: 1, defaultConfig: {}, configSchema: z.object({}).strict(),
  wizard: { steps: [{ id: "data-overlays", title: "Data Overlays", fields: [] }] }, renderer: { entryPoint: "overlay/modules/data-overlays", supportedOutputs: ["module", "unified"] }
} as const satisfies OverlayModuleDefinition<Record<string, never>>;
