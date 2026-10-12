import type { OutputCanvas } from "../overlay-modules/output-canvas-contract.js";
import type { OverlayElementLayout } from "../shared/schemas.js";
import type { TimerAppearance, TimerOverflowGeometry, TimerProfile, TimerStackRegion } from "./types.js";
import { boxShadowInsets, type BoxShadow } from "../shared/box-shadow.js";
import { isExactLegacyTimerAppearance, timerSizeMeasurement } from "./legacy-appearance.js";
export { timerSizeMeasurement } from "./legacy-appearance.js";

/** The original card shadow (0 8px 24px rgba(0,0,0,.42)); its margin is the historical 48/40/48/56px. */
export const defaultTimerShadow: BoxShadow = { offsetX: 0, offsetY: 8, blur: 24, spread: 0, color: "#0000006B" };

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
  const insets = boxShadowInsets(a.shadow ?? defaultTimerShadow);
  const local = Array.from({ length: a.maxVisible }, (_, index) => ({
    x: a.orientation === "horizontal" ? index * (a.cardWidthPx + a.stackGapPx) : 0,
    y: a.orientation === "vertical" ? index * (a.cardHeightPx + a.stackGapPx) : 0,
    width: a.cardWidthPx, height: a.cardHeightPx, zIndex: 0
  }));
  // Reversed stacks mirror slots and badge inside the same footprint, so its size and saved placement never change.
  const place = <T extends { x: number; y: number; width: number; height: number }>(rect: T, reverse: boolean | undefined, dx: number, dy: number): T =>
    reverse !== true ? { ...rect, x: rect.x + dx, y: rect.y + dy }
      : a.orientation === "vertical" ? { ...rect, x: rect.x + dx, y: footprint.height - rect.y - rect.height + dy }
        : { ...rect, x: footprint.width - rect.x - rect.width + dx, y: rect.y + dy };
  const desktopReverse = profile.desktopPlacement.reverse ?? a.reverse;
  const { x: px, y: py, zIndex } = profile.desktopPlacement;
  return { schemaVersion: 1, kind: "content", width: Math.ceil(footprint.width + insets.left + insets.right),
    height: Math.ceil(footprint.height + insets.top + insets.bottom), origin: { x: 0, y: 0 }, insets,
    slots: local.map(slot => place(slot, a.reverse, insets.left, insets.top)),
    overflow: place(overflow, a.reverse, insets.left, insets.top), footprint, countdownMaxWidth,
    browserRegion: { layout: { x: insets.left, y: insets.top, width: stackWidth, height: stackHeight, zIndex: 0 }, orientation: a.orientation, maxVisible: a.maxVisible },
    desktopRegion: { layout: { x: px, y: py, width: stackWidth, height: stackHeight, zIndex }, orientation: a.orientation, maxVisible: a.maxVisible },
    desktopSlots: local.map(slot => ({ ...place(slot, desktopReverse, px, py), zIndex })),
    desktopOverflow: place(overflow, desktopReverse, px, py) };
}
