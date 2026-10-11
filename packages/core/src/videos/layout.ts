import { boxShadowInsets, boxShadowLimits, type BoxShadow, type BoxShadowInsets } from "../shared/box-shadow.js";
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

/** Matches the original `0 18px 48px rgba(0,0,0,.45)` picture shadow, offered when the operator edits it. */
export const defaultVideoShadow: BoxShadow = { offsetX: 0, offsetY: 18, blur: 48, spread: 0, color: "#00000073" };

/** Browser source margin; configs saved without a shadow keep today's edge-to-edge canvas. */
export const videosShadowInsets = (layout: VideosLayout): BoxShadowInsets =>
  layout.shadow === undefined ? { top: 0, right: 0, bottom: 0, left: 0 } : boxShadowInsets(layout.shadow);

const inLimit = (value: unknown, limit: { readonly min: number; readonly max: number }) =>
  Number.isSafeInteger(value) && (value as number) >= limit.min && (value as number) <= limit.max;
function isValidShadow(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 5) return false;
  const shadow = value as Partial<BoxShadow>;
  return inLimit(shadow.offsetX, boxShadowLimits.offsetPx) && inLimit(shadow.offsetY, boxShadowLimits.offsetPx)
    && inLimit(shadow.blur, boxShadowLimits.blurPx) && inLimit(shadow.spread, boxShadowLimits.spreadPx)
    && typeof shadow.color === "string" && /^#[0-9a-f]{8}$/iu.test(shadow.color);
}

/** Bounded integer content dimensions and finite positive scale whose footprint stays in the scene. */
export function isValidVideosLayout(value: unknown): value is VideosLayout {
  if (typeof value !== "object" || value === null) return false;
  const layout = value as Partial<VideosLayout>;
  if (Object.keys(layout).length !== ("shadow" in layout ? 4 : 3) || ("shadow" in layout && !isValidShadow(layout.shadow))) return false;
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
  return { schemaVersion: 2, content: { ...layout.content }, desktopPlacement: { x: 0, y: 0, scale: 1 },
    ...(layout.shadow === undefined ? {} : { shadow: { ...layout.shadow } }) };
}
