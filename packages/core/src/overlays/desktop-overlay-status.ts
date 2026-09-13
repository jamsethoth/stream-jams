import { z } from "zod";
import { surfaceConfigurationSchema } from "../overlay-modules/surface-configuration.js";
const identity = z.string().min(1).refine(value => value === value.trim());
export const selectedDesktopDisplaySchema = z.object({
  id: identity,
  label: z.string().trim().min(1),
  bounds: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().positive(), height: z.number().finite().positive() }).strict(),
  scaleFactor: z.number().finite().positive()
}).strict();
export type SelectedDesktopDisplay = z.infer<typeof selectedDesktopDisplaySchema>;
export const desktopOverlayStatusSchema = z.object({
  available: z.boolean(),
  displays: z.array(selectedDesktopDisplaySchema),
  state: z.enum(["disabled", "ready", "unavailable", "failed"]),
  message: z.string().nullable()
}).strict();
export type DesktopOverlayStatus = z.infer<typeof desktopOverlayStatusSchema>;
export const surfaceSettingsViewSchema = z.object({ surfaces: z.array(surfaceConfigurationSchema), desktop: desktopOverlayStatusSchema }).strict();
export type SurfaceSettingsView = z.infer<typeof surfaceSettingsViewSchema>;
