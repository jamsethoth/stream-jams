import { targetProfileDefinitions } from "../management/contracts.js";
import type { OutputCanvas } from "../overlay-modules/output-canvas.js";
import { boxShadowInsets } from "../shared/box-shadow.js";
import { musicModuleConfigSchema } from "./schemas.js";
import type { MusicModuleConfig } from "./types.js";
import type { OverlayTargetProfileId } from "../overlays/types.js";

export type MusicOutputGeometry = Omit<OutputCanvas, "configRevision">;

/** Saved native border-box geometry only; playback, CSS and desktop placement cannot resize this envelope. */
export function resolveMusicOutputGeometry(config: MusicModuleConfig, targetProfileId: OverlayTargetProfileId): MusicOutputGeometry {
  const profile = musicModuleConfigSchema.parse(config).profiles[targetProfileId];
  const bounds = targetProfileDefinitions.find(candidate => candidate.id === targetProfileId)!;
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  let width = 0; let height = 0;
  for (const appearance of Object.values(profile.views)) {
    width = Math.max(width, Math.min(appearance.widthPx, bounds.width));
    height = Math.max(height, Math.min(appearance.heightPx, bounds.height));
    const shadow = boxShadowInsets(appearance.shadow);
    for (const side of ["top", "right", "bottom", "left"] as const) insets[side] = Math.max(insets[side], shadow[side]);
  }
  return { schemaVersion: 1, kind: "content", width: Math.ceil(width + insets.left + insets.right),
    height: Math.ceil(height + insets.top + insets.bottom), origin: { x: 0, y: 0 }, insets };
}
