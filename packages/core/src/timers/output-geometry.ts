import type { OutputCanvas } from "../overlay-modules/output-canvas-contract.js";
import type { OverlayElementLayout } from "../shared/schemas.js";
import type { TimerAppearance, TimerOverflowGeometry, TimerProfile, TimerStackRegion } from "./types.js";
import { isExactLegacyTimerAppearance, timerSizeMeasurement } from "./legacy-appearance.js";
export { timerSizeMeasurement } from "./legacy-appearance.js";

export interface TimerOutputGeometry extends Omit<OutputCanvas, "configRevision"> {
  readonly slots: readonly OverlayElementLayout[];
  readonly overflow: TimerOverflowGeometry;
  /** Legacy edge fitting excludes shadow padding; do not use rounded canvas bounds for desktop scale. */
  readonly footprint: { readonly width: number; readonly height: number };
  readonly browserRegion: TimerStackRegion;
  readonly desktopRegion: TimerStackRegion;
  readonly desktopSlots: readonly OverlayElementLayout[];
  readonly desktopOverflow: TimerOverflowGeometry;
  readonly countdownMaxWidth: number | "8ch";
}

export function timerOverflowGeometry(appearance: Pick<TimerAppearance, "cardWidthPx" | "cardHeightPx" | "orientation" | "maxVisible" | "stackGapPx">) {
  const { cardWidthPx: width, cardHeightPx: height, orientation, maxVisible, stackGapPx } = appearance;
  const fontSizePx = timerSizeMeasurement(width, height, .24, .08, 10, 42);
  const blockPaddingPx = timerSizeMeasurement(width, height, .06, .018, 3, 10);
  const inlinePaddingPx = timerSizeMeasurement(width, height, .1, .03, 5, 16);
  const offsetPx = timerSizeMeasurement(width, height, .08, .025, 4, 14);
  const stackWidth = orientation === "horizontal" ? width * maxVisible + stackGapPx * (maxVisible - 1) : width;
  const stackHeight = orientation === "vertical" ? height * maxVisible + stackGapPx * (maxVisible - 1) : height;
  const overflow = { x: orientation === "horizontal" ? stackWidth + offsetPx : 0,
    y: orientation === "vertical" ? stackHeight + offsetPx : 0,
    width: fontSizePx * 8 + inlinePaddingPx * 2 + 2, height: fontSizePx + blockPaddingPx * 2 + 2,
    fontSizePx, blockPaddingPx, inlinePaddingPx, offsetPx };
  return { overflow, stackWidth, stackHeight, footprint: { width: Math.max(stackWidth, overflow.x + overflow.width), height: Math.max(stackHeight, overflow.y + overflow.height) } };
}

/** Configured slots plus a permanent badge reserve. Shadow extent follows the existing 0 8px 24px CSS. */
export function resolveTimerOutputGeometry(profile: TimerProfile): TimerOutputGeometry {
  const a = profile.appearance;
  // Saved-config cache owns this recognition; projections reuse it on every countdown tick.
  const countdownMaxWidth = isExactLegacyTimerAppearance(a) ? "8ch" : Math.max(0,
    a.cardWidthPx - 2 * (a.inlinePaddingPx + a.borderWidthPx) - a.iconSizePx - 2 * a.gapPx - 1);
  const { overflow, footprint, stackWidth, stackHeight } = timerOverflowGeometry(a);
  const insets = { left: 48, top: 40, right: 48, bottom: 56 };
  const slots = Array.from({ length: a.maxVisible }, (_, index) => ({
    x: insets.left + (a.orientation === "horizontal" ? index * (a.cardWidthPx + a.stackGapPx) : 0),
    y: insets.top + (a.orientation === "vertical" ? index * (a.cardHeightPx + a.stackGapPx) : 0),
    width: a.cardWidthPx, height: a.cardHeightPx, zIndex: 0
  }));
  return { schemaVersion: 1, kind: "content", width: Math.ceil(footprint.width + insets.left + insets.right),
    height: Math.ceil(footprint.height + insets.top + insets.bottom), origin: { x: 0, y: 0 }, insets, slots,
    overflow: { ...overflow, x: overflow.x + insets.left, y: overflow.y + insets.top }, footprint, countdownMaxWidth,
    browserRegion: { layout: { x: insets.left, y: insets.top, width: stackWidth, height: stackHeight, zIndex: 0 }, orientation: a.orientation, maxVisible: a.maxVisible },
    desktopRegion: { layout: { x: profile.desktopPlacement.x, y: profile.desktopPlacement.y, width: stackWidth, height: stackHeight, zIndex: profile.desktopPlacement.zIndex }, orientation: a.orientation, maxVisible: a.maxVisible },
    desktopSlots: slots.map(slot => ({ ...slot, x: slot.x - insets.left + profile.desktopPlacement.x, y: slot.y - insets.top + profile.desktopPlacement.y, zIndex: profile.desktopPlacement.zIndex })),
    desktopOverflow: { ...overflow, x: overflow.x + profile.desktopPlacement.x, y: overflow.y + profile.desktopPlacement.y } };
}
