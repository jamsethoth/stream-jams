import { z } from "zod";
import { surfaceConfigurationSchema } from "../overlay-modules/surface-configuration.js";
import type { AutomaticBindingState } from "../local-outputs/exact-label-match.js";
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
export const surfaceSettingsViewSchema = z.object({
  surfaces: z.array(surfaceConfigurationSchema),
  desktop: desktopOverlayStatusSchema,
  desktopBindingState: z.enum(["not-needed", "disabled", "no-match", "ambiguous", "rebound"]).default("not-needed")
}).strict();
export type SurfaceSettingsView = z.infer<typeof surfaceSettingsViewSchema>;
export type DesktopBindingState = AutomaticBindingState;
