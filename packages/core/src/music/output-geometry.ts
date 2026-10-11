import { targetProfileDefinitions } from "../management/contracts.js";
import type { OutputCanvas } from "../overlay-modules/output-canvas.js";
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
    const shadow = appearance.shadow;
    if (Number.parseInt(shadow.color.slice(-2), 16) === 0) continue;
    const extent = 2 * shadow.blur + shadow.spread;
    insets.left = Math.max(insets.left, Math.max(0, Math.ceil(extent - shadow.offsetX)));
    insets.right = Math.max(insets.right, Math.max(0, Math.ceil(extent + shadow.offsetX)));
    insets.top = Math.max(insets.top, Math.max(0, Math.ceil(extent - shadow.offsetY)));
    insets.bottom = Math.max(insets.bottom, Math.max(0, Math.ceil(extent + shadow.offsetY)));
  }
  return { schemaVersion: 1, kind: "content", width: Math.ceil(width + insets.left + insets.right),
    height: Math.ceil(height + insets.top + insets.bottom), origin: { x: 0, y: 0 }, insets };
}
