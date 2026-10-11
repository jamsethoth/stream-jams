import type { VideosLayout } from "./types.js";

/*
 * Videos placement on the landscape canvas. Plain data and arithmetic only, so the
 * management editor, its preview and every overlay share one geometry without zod.
 */

/** Desktop placement uses this scene; ordinary browser sources use their saved local content dimensions. */
export const videosCanvas = { width: 1920, height: 1080 } as const;
export const videosLayoutLimits = { minWidth: 240, minHeight: 180 } as const;

/** Matches the look before placement existed: centered, 72% wide, 6% above the bottom edge. */
export function createDefaultVideosLayout(): VideosLayout {
  return { schemaVersion: 2, content: { width: 1382, height: 876 }, desktopPlacement: { x: 269, y: 140, scale: 1 } };
}

/** Bounded integer content dimensions and finite positive scale whose footprint stays in the scene. */
export function isValidVideosLayout(value: unknown): value is VideosLayout {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 3) return false;
  const layout = value as Partial<VideosLayout>;
  if (layout.schemaVersion !== 2 || typeof layout.content !== "object" || layout.content === null
    || typeof layout.desktopPlacement !== "object" || layout.desktopPlacement === null
    || Object.keys(layout.content).length !== 2 || Object.keys(layout.desktopPlacement).length !== 3) return false;
  const { width, height } = layout.content;
  const { x, y, scale } = layout.desktopPlacement;
  return Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width >= videosLayoutLimits.minWidth && height >= videosLayoutLimits.minHeight
    && width <= videosCanvas.width && height <= videosCanvas.height
    && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(scale)
    && x >= 0 && y >= 0 && scale > 0
    && x + width * scale <= videosCanvas.width && y + height * scale <= videosCanvas.height;
}

/** The trusted browser projection never inherits scene placement or scale. */
export function browserVideosLayout(layout: VideosLayout): VideosLayout {
  return { schemaVersion: 2, content: { ...layout.content }, desktopPlacement: { x: 0, y: 0, scale: 1 } };
}
