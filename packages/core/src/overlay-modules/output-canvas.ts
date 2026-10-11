import { z } from "zod";
import type { OverlayModuleConfig } from "./types.js";
import type { OverlayTargetProfileId } from "../overlays/types.js";

/** Saved geometry, independent of playback and viewport dimensions. */
export interface OutputCanvas {
  readonly schemaVersion: 1;
  readonly kind: "content" | "scene";
  readonly width: number;
  readonly height: number;
  readonly origin: { readonly x: number; readonly y: number };
  readonly insets: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly configRevision: number;
}
// Zod numbers exclude nonfinite values; int() also requires a safe integer.
const dimension = z.int().positive();
const inset = z.number().nonnegative();
export const outputCanvasSchema = z.strictObject({
  schemaVersion: z.literal(1), kind: z.enum(["content", "scene"]), width: dimension, height: dimension,
  origin: z.strictObject({ x: z.number(), y: z.number() }),
  insets: z.strictObject({ top: inset, right: inset, bottom: inset, left: inset }),
  configRevision: z.int().nonnegative()
}) satisfies z.ZodType<OutputCanvas>;

export function sceneOutputCanvas(configRevision = 0, width = 1920, height = 1080): OutputCanvas {
  return outputCanvasSchema.parse({ schemaVersion: 1, kind: "scene", width, height,
    origin: { x: 0, y: 0 }, insets: { top: 0, right: 0, bottom: 0, left: 0 }, configRevision });
}

/** S06-S08 opt individual browser modules into content geometry here. */
export function moduleOutputCanvas(config: OverlayModuleConfig, profile: OverlayTargetProfileId | null | undefined,
  recipientKind: "browser" | "desktop", configRevision: number): OutputCanvas {
  if (recipientKind === "desktop") return sceneOutputCanvas(configRevision);
  if (profile === "vertical") return sceneOutputCanvas(configRevision, 1080, 1920);
  if (profile === "landscape") return sceneOutputCanvas(configRevision);
  if (config.moduleId === "alerts" && typeof config.config === "object" && config.config !== null && "canvas" in config.config) {
    const canvas = z.strictObject({ width: dimension, height: dimension }).parse(config.config.canvas);
    return sceneOutputCanvas(configRevision, canvas.width, canvas.height);
  }
  return sceneOutputCanvas(configRevision);
}
