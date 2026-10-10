import type { VideosLayout } from "./types.js";

/*
 * Videos placement on the landscape canvas. Plain data and arithmetic only, so the
 * management editor, its preview and every overlay share one geometry without zod.
 */

/** Every Videos output places the box on this canvas, the same one Timers and Music use for landscape. */
export const videosCanvas = { width: 1920, height: 1080 } as const;
export const videosLayoutLimits = { minWidth: 240, minHeight: 180 } as const;

/** Matches the look before placement existed: centered, 72% wide, 6% above the bottom edge. */
export function createDefaultVideosLayout(): VideosLayout {
  return { x: 269, y: 140, width: 1382, height: 876 };
}

/** Exactly x, y, width and height in whole pixels, at least the minimum size, and entirely on the canvas. */
export function isValidVideosLayout(value: unknown): value is VideosLayout {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 4) return false;
  const { x, y, width, height } = value as Partial<Record<keyof VideosLayout, unknown>>;
  return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(width) && Number.isInteger(height)
    && (x as number) >= 0 && (y as number) >= 0
    && (width as number) >= videosLayoutLimits.minWidth && (height as number) >= videosLayoutLimits.minHeight
    && (x as number) + (width as number) <= videosCanvas.width && (y as number) + (height as number) <= videosCanvas.height;
}
