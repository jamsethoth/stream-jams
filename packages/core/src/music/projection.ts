import { targetProfileDefinitions } from "../management/contracts.js";
import { overlayTargetProfileIdSchema, type OverlayTargetProfileId } from "../shared/schemas.js";
import { fitMusicComponentLayout } from "./component-layout.js";
import { musicLimits, musicModuleConfigSchema, musicSnapshotSchema, musicStatusSchema, musicWidgetProjectionSchema } from "./schemas.js";
import type { MusicModuleConfig, MusicSnapshot, MusicStatus, MusicWidgetProjection } from "./types.js";

export function getMusicPositionMs(snapshot: MusicSnapshot, nowEpochMs: number): number | null {
  const result = musicSnapshotSchema.safeParse(snapshot);
  if (!result.success || !isEpoch(nowEpochMs) || result.data.positionMs === null) return null;
  const observation = result.data;
  const ageMs = Math.max(0, nowEpochMs - observation.observedAtEpochMs);
  const elapsedMs = observation.playbackState === "playing" && ageMs <= musicLimits.staleAfterMs ? ageMs : 0;
  const positionMs = observation.positionMs! + elapsedMs;
  return observation.durationMs === null ? positionMs : Math.min(positionMs, observation.durationMs);
}

/** Appearance ownership lives in the runtime: never derive/reset the epoch from a recipient or poll. */
export function projectMusicWidget(
  snapshot: MusicSnapshot | null, status: MusicStatus, config: MusicModuleConfig,
  targetProfileId: OverlayTargetProfileId, appearanceStartedAtEpochMs: number | null, nowEpochMs: number
): MusicWidgetProjection | null {
  if (snapshot === null || appearanceStartedAtEpochMs === null || !isEpoch(nowEpochMs) || !isEpoch(appearanceStartedAtEpochMs)) return null;
  const observation = musicSnapshotSchema.safeParse(snapshot);
  const connection = musicStatusSchema.safeParse(status);
  const settings = musicModuleConfigSchema.safeParse(config);
  const target = overlayTargetProfileIdSchema.safeParse(targetProfileId);
  if (!observation.success || !connection.success || !settings.success || !target.success) return null;
  if (!observation.data.track || connection.data.state !== "connected" || connection.data.stale || nowEpochMs - observation.data.observedAtEpochMs > musicLimits.staleAfterMs) return null;

  const profile = settings.data.profiles[target.data];
  const idle = nowEpochMs - appearanceStartedAtEpochMs >= profile.idleAfterSeconds * 1000;
  if (idle && profile.idleMode === "hide") return null;
  const view = idle && profile.idleMode === "compact" ? "compact" : profile.initialView;
  const bounds = targetProfileDefinitions.find(candidate => candidate.id === target.data)!;
  for (const viewId of ["full", "compact"] as const) {
    const appearance = profile.views[viewId];
    profile.views[viewId] = fitMusicComponentLayout({ ...appearance, widthPx: Math.min(appearance.widthPx, bounds.width), heightPx: Math.min(appearance.heightPx, bounds.height) });
  }
  const { widthPx: width, heightPx: height } = profile.views[view];
  const x = profile.alignment.endsWith("left") ? 0 : profile.alignment.endsWith("right") ? bounds.width - width : (bounds.width - width) / 2;
  const y = profile.alignment.startsWith("top") ? 0 : profile.alignment.startsWith("bottom") ? bounds.height - height : (bounds.height - height) / 2;
  const projection = musicWidgetProjectionSchema.safeParse({
    targetProfileId: target.data, snapshot: observation.data, appearanceStartedAtEpochMs,
    clockReferenceEpochMs: nowEpochMs,
    profile, view, layout: { x, y, width, height, zIndex: 0 }, css: settings.data.css, assets: []
  });
  return projection.success ? projection.data : null;
}

function isEpoch(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}


/** Apply only at the private desktop recipient boundary; browser alignment stays independent. */
export function applyMusicDesktopPlacement(projection: MusicWidgetProjection, config: MusicModuleConfig): MusicWidgetProjection {
  const position = config.desktopPlacement[projection.view];
  if (position === null || projection.targetProfileId !== "landscape") return projection;
  const bounds = targetProfileDefinitions.find(profile => profile.id === "landscape")!;
  return { ...projection, layout: { ...projection.layout,
    x: Math.min(position.x, bounds.width - projection.layout.width),
    y: Math.min(position.y, bounds.height - projection.layout.height)
  } };
}
