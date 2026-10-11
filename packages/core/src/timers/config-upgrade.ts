import { legacyTimersOverlayModuleConfigSchema, timerProfileDimensions, timersOverlayModuleConfigSchema } from "./schemas.js";
import { timerOverflowGeometry, timerSizeMeasurement } from "./output-geometry.js";
import type { TimerAppearance, TimerProfile, TimerStackRegion, TimersOverlayModuleConfig } from "./types.js";

/** Preserve native pre-S07 measurements; edge fitting is placement, never content size. */
export function legacyTimerAppearance(region: TimerStackRegion): TimerAppearance {
  const width = region.orientation === "horizontal" ? region.layout.width / region.maxVisible : region.layout.width;
  const height = region.orientation === "vertical" ? region.layout.height / region.maxVisible : region.layout.height;
  const size = (hr: number, wr: number, min: number, max: number) => timerSizeMeasurement(width, height, hr, wr, min, max);
  return { cardWidthPx: width, cardHeightPx: height, orientation: region.orientation, maxVisible: region.maxVisible,
    stackGapPx: 0, blockPaddingPx: size(.1, .025, 4, 16), gapPx: size(.12, .025, 4, 18), inlinePaddingPx: size(.14, .04, 6, 24),
    cornerRadiusPx: size(.12, .03, 4, 16), borderWidthPx: 2, borderColor: "#FFFFFFC7", backgroundColor: "#0D141F", backgroundOpacity: 1,
    labelFont: { fontPreset: "system-sans", fontSizePx: size(.24, .08, 10, 42), fontWeight: 700, color: "#FFFFFF", legacyFamily: "Inter, ui-sans-serif, system-ui, sans-serif" },
    valueFont: { fontPreset: "monospace", fontSizePx: size(.29, .12, 12, 56), fontWeight: 800, color: "#FFFFFF", legacyFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" },
    iconSizePx: size(.48, .16, 16, 64), runningAccent: null, pausedAccent: "#FBBF24E6", completedAccent: "#5EEAD4F2" };
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
