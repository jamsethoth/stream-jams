import { z } from "zod";
import { rgbaColorSchema } from "../alerts/text-style.js";

export const boxShadowLimits = { offsetPx: { min: -128, max: 128 }, blurPx: { min: 0, max: 128 }, spreadPx: { min: -64, max: 64 } } as const;
const bounded = (limit: { readonly min: number; readonly max: number }) => z.number().int().min(limit.min).max(limit.max);

/** One CSS box-shadow shared by module cards; a fully transparent color means no shadow. */
export const boxShadowSchema = z.object({
  offsetX: bounded(boxShadowLimits.offsetPx), offsetY: bounded(boxShadowLimits.offsetPx),
  blur: bounded(boxShadowLimits.blurPx), spread: bounded(boxShadowLimits.spreadPx), color: rgbaColorSchema
}).strict();
export type BoxShadow = z.infer<typeof boxShadowSchema>;
export interface BoxShadowInsets { top: number; right: number; bottom: number; left: number }

export const boxShadowVisible = (shadow: BoxShadow) => Number.parseInt(shadow.color.slice(-2), 16) !== 0;

/** Transparent margin a content-sized browser source needs on each side so the shadow is not clipped (2x blur covers its falloff). */
export function boxShadowInsets(shadow: BoxShadow): BoxShadowInsets {
  if (!boxShadowVisible(shadow)) return { top: 0, right: 0, bottom: 0, left: 0 };
  const extent = 2 * shadow.blur + shadow.spread;
  const side = (offset: number) => Math.max(0, Math.ceil(extent + offset));
  return { top: side(-shadow.offsetY), right: side(shadow.offsetX), bottom: side(shadow.offsetY), left: side(-shadow.offsetX) };
}

export const boxShadowCss = (shadow: BoxShadow) => `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`;
