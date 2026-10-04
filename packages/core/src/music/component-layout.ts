import type { MusicAppearance, MusicComponentRect } from "./types.js";

export const musicComponentRoles = ["artwork", "title", "details", "progress", "time"] as const;
export type MusicComponentRole = typeof musicComponentRoles[number];
export interface MusicComponentBounds { readonly width: number; readonly height: number }

const finiteInteger = (value: number, fallback: number): number => Number.isFinite(value) ? Math.round(value) : fallback;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function clampMusicComponentRect(rect: MusicComponentRect, bounds: MusicComponentBounds): MusicComponentRect {
  const width = clamp(finiteInteger(rect.width, 1), 1, bounds.width);
  const height = clamp(finiteInteger(rect.height, 1), 1, bounds.height);
  return {
    x: clamp(finiteInteger(rect.x, 0), 0, bounds.width - width),
    y: clamp(finiteInteger(rect.y, 0), 0, bounds.height - height), width, height
  };
}

export function moveMusicComponentRect(rect: MusicComponentRect, dx: number, dy: number, bounds: MusicComponentBounds): MusicComponentRect {
  const fitted = clampMusicComponentRect(rect, bounds);
  return clampMusicComponentRect({ ...fitted, x: fitted.x + finiteInteger(dx, 0), y: fitted.y + finiteInteger(dy, 0) }, bounds);
}

export function resizeMusicComponentRect(rect: MusicComponentRect, dw: number, dh: number, bounds: MusicComponentBounds): MusicComponentRect {
  const fitted = clampMusicComponentRect(rect, bounds);
  return { ...fitted, width: clamp(fitted.width + finiteInteger(dw, 0), 1, bounds.width - fitted.x), height: clamp(fitted.height + finiteInteger(dh, 0), 1, bounds.height - fitted.y) };
}

export function fitMusicComponentLayout(appearance: MusicAppearance): MusicAppearance {
  if (appearance.componentLayout === null) return appearance;
  const bounds = { width: appearance.widthPx, height: appearance.heightPx };
  const componentLayout = Object.fromEntries(musicComponentRoles.map(role => [role, clampMusicComponentRect(appearance.componentLayout![role], bounds)])) as MusicAppearance["componentLayout"];
  return { ...appearance, componentLayout };
}
