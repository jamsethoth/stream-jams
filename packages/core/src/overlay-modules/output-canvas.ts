import { z } from "zod";
import type { OverlayModuleConfig } from "./types.js";
import type { OverlayTargetProfileId } from "../overlays/types.js";
import { resolveMusicOutputGeometry } from "../music/output-geometry.js";
import type { MusicModuleConfig } from "../music/types.js";
import { resolveTimerOutputGeometry } from "../timers/output-geometry.js";
import { timersOverlayModuleConfigSchema } from "../timers/schemas.js";
import { currentVideosModuleConfigSchema } from "../videos/schemas.js";

import { outputCanvasSchema, type OutputCanvas } from "./output-canvas-contract.js";
export { outputCanvasSchema, type OutputCanvas } from "./output-canvas-contract.js";
const dimension = z.int().positive();

export function sceneOutputCanvas(configRevision = 0, width = 1920, height = 1080): OutputCanvas {
  return outputCanvasSchema.parse({ schemaVersion: 1, kind: "scene", width, height,
    origin: { x: 0, y: 0 }, insets: { top: 0, right: 0, bottom: 0, left: 0 }, configRevision });
}

/** S06-S08 opt individual browser modules into content geometry here. */
export function moduleOutputCanvas(config: OverlayModuleConfig, profile: OverlayTargetProfileId | null | undefined,
  recipientKind: "browser" | "desktop", configRevision: number): OutputCanvas {
  if (recipientKind === "desktop") return sceneOutputCanvas(configRevision);
  if (config.moduleId === "videos") {
    const { width, height } = currentVideosModuleConfigSchema.parse(config.config).layout.content;
    return outputCanvasSchema.parse({ schemaVersion: 1, kind: "content", width, height,
      origin: { x: 0, y: 0 }, insets: { top: 0, right: 0, bottom: 0, left: 0 }, configRevision });
  }
  if (config.moduleId === "music") return outputCanvasSchema.parse({
    ...resolveMusicOutputGeometry(config.config as MusicModuleConfig, profile ?? "landscape"), configRevision
  });
  if (config.moduleId === "timers") {
    const geometry = resolveTimerOutputGeometry(timersOverlayModuleConfigSchema.parse(config.config).profiles[profile ?? "landscape"]);
    return outputCanvasSchema.parse({ schemaVersion: 1, kind: "content", width: geometry.width, height: geometry.height,
      origin: geometry.origin, insets: geometry.insets, configRevision });
  }
  if (profile === "vertical") return sceneOutputCanvas(configRevision, 1080, 1920);
  if (profile === "landscape") return sceneOutputCanvas(configRevision);
  if (config.moduleId === "alerts" && typeof config.config === "object" && config.config !== null && "canvas" in config.config) {
    const canvas = z.strictObject({ width: dimension, height: dimension }).parse(config.config.canvas);
    return sceneOutputCanvas(configRevision, canvas.width, canvas.height);
  }
  return sceneOutputCanvas(configRevision);
}
