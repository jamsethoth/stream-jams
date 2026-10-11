import type { TimerAppearance, TimerTypography } from "./types.js";

export function timerSizeMeasurement(width: number, height: number, hr: number, wr: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Math.min(height * hr, width * wr))));
}

/** Frozen native card measurements, including historically valid cramped fractional slots. */
export function materializeLegacyTimerAppearance(input: Pick<TimerAppearance, "cardWidthPx" | "cardHeightPx" | "orientation" | "maxVisible">): TimerAppearance {
  const { cardWidthPx: width, cardHeightPx: height } = input;
  const size = (hr: number, wr: number, min: number, max: number) => timerSizeMeasurement(width, height, hr, wr, min, max);
  return { ...input,
    stackGapPx: 0, blockPaddingPx: size(.1, .025, 4, 16), gapPx: size(.12, .025, 4, 18), inlinePaddingPx: size(.14, .04, 6, 24),
    cornerRadiusPx: size(.12, .03, 4, 16), borderWidthPx: 2, borderColor: "#FFFFFFC7", backgroundColor: "#0D141F", backgroundOpacity: 1,
    labelFont: { fontPreset: "system-sans", fontSizePx: size(.24, .08, 10, 42), fontWeight: 700, color: "#FFFFFF", legacyFamily: "Inter, ui-sans-serif, system-ui, sans-serif" },
    valueFont: { fontPreset: "monospace", fontSizePx: size(.29, .12, 12, 56), fontWeight: 800, color: "#FFFFFF", legacyFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" },
    iconSizePx: size(.48, .16, 16, 64), runningAccent: null, pausedAccent: "#FBBF24E6", completedAccent: "#5EEAD4F2" };
}

/** Compare every derived field; a caller-supplied font-family marker alone grants no exception. */
export function isExactLegacyTimerAppearance(appearance: TimerAppearance): boolean {
  const expected = materializeLegacyTimerAppearance({ cardWidthPx: appearance.cardWidthPx, cardHeightPx: appearance.cardHeightPx,
    orientation: appearance.orientation, maxVisible: appearance.maxVisible });
  return (Object.keys(expected) as (keyof TimerAppearance)[]).every(key => {
    if (key === "labelFont" || key === "valueFont") {
      return (Object.keys(expected[key]) as (keyof TimerTypography)[]).every(field => appearance[key][field] === expected[key][field]);
    }
    return appearance[key] === expected[key];
  });
}
