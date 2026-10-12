import { legacyTimersOverlayModuleConfigSchema, timerProfileDimensions, timersOverlayModuleConfigSchema } from "./schemas.js";
import { timerOverflowGeometry } from "./output-geometry.js";
import { materializeLegacyTimerAppearance } from "./legacy-appearance.js";
import type { TimerAppearance, TimerProfile, TimerStackRegion, TimersOverlayModuleConfig } from "./types.js";

/** Preserve native pre-S07 measurements; edge fitting is placement, never content size. */
export function legacyTimerAppearance(region: TimerStackRegion): TimerAppearance {
  const width = region.orientation === "horizontal" ? region.layout.width / region.maxVisible : region.layout.width;
  const height = region.orientation === "vertical" ? region.layout.height / region.maxVisible : region.layout.height;
  return materializeLegacyTimerAppearance({ cardWidthPx: width, cardHeightPx: height, orientation: region.orientation, maxVisible: region.maxVisible });
}

export class InvalidTimersConfigError extends Error {
  constructor() { super("Timer configuration has invalid geometry or appearance; correct the saved Timer profiles before upgrading."); this.name = "InvalidTimersConfigError"; }
}

export function upgradeTimersConfig(raw: unknown): TimersOverlayModuleConfig {
  const current = timersOverlayModuleConfigSchema.safeParse(raw);
  if (current.success) return current.data;
  const legacy = legacyTimersOverlayModuleConfigSchema.safeParse(raw);
  if (!legacy.success) throw new InvalidTimersConfigError();
  const profiles = {} as Record<"landscape" | "vertical", TimerProfile>;
  for (const profile of ["landscape", "vertical"] as const) {
    const region = legacy.data.profiles[profile];
    const appearance = legacyTimerAppearance(region);
    const { footprint } = timerOverflowGeometry(appearance);
    const { x, y, zIndex } = region.layout;
    const bounds = timerProfileDimensions[profile];
    profiles[profile] = { appearance, desktopPlacement: { x, y, zIndex, scale: Math.min(1, (bounds.width - x) / footprint.width, (bounds.height - y) / footprint.height) } };
  }
  const result = timersOverlayModuleConfigSchema.safeParse({ schemaVersion: 2, profiles });
  if (!result.success) throw new InvalidTimersConfigError();
  return result.data;
}
