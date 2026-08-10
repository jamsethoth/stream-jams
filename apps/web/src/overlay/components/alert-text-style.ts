import {
  alertFontPresets,
  alertTextBoxStyleSchema,
  alertTextStyleSchema,
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type AlertShadowStyle,
  type AlertTextBoxStyle,
  type AlertTextStyle
} from "@stream-jams/core";
import type { CSSProperties } from "react";

export function alertTextLayerStyle(input: {
  readonly textStyle?: AlertTextStyle | undefined;
  readonly boxStyle?: AlertTextBoxStyle | undefined;
  readonly scale?: number;
}): CSSProperties | null {
  const scale = input.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const textStyle = alertTextStyleSchema.safeParse(
    input.textStyle === undefined ? compatibilityAlertTextStyle : input.textStyle
  );
  const boxStyle = alertTextBoxStyleSchema.safeParse(
    input.boxStyle === undefined ? compatibilityAlertTextBoxStyle : input.boxStyle
  );
  if (!textStyle.success || !boxStyle.success) return null;

  const font = alertFontPresets.find((candidate) => candidate.id === textStyle.data.fontPreset);
  if (font === undefined) return null;

  return {
    alignItems: "stretch",
    backgroundColor: boxStyle.data.backgroundColor,
    borderRadius: pixels(boxStyle.data.cornerRadiusPx, scale),
    boxShadow: shadow(boxStyle.data.shadow, scale),
    color: textStyle.data.color,
    display: "flex",
    flexDirection: "column",
    fontFamily: font.fontFamily,
    fontSize: pixels(textStyle.data.fontSizePx, scale),
    fontWeight: textStyle.data.fontWeight,
    justifyContent: verticalAlignment(textStyle.data.verticalAlign),
    lineHeight: textStyle.data.lineHeight,
    overflowWrap: "anywhere",
    padding: pixels(boxStyle.data.paddingPx, scale),
    textAlign: textStyle.data.horizontalAlign,
    textShadow: shadow(textStyle.data.shadow, scale)
  };
}

function pixels(value: number, scale: number): string {
  return `${value * scale}px`;
}

function shadow(value: AlertShadowStyle | null, scale: number): string {
  return value === null
    ? "none"
    : `${pixels(value.offsetX, scale)} ${pixels(value.offsetY, scale)} ${pixels(value.blur, scale)} ${value.color}`;
}

function verticalAlignment(value: AlertTextStyle["verticalAlign"]): CSSProperties["justifyContent"] {
  if (value === "top") return "flex-start";
  if (value === "bottom") return "flex-end";
  return "center";
}
