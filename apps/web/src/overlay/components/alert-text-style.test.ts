import {
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  type AlertTextBoxStyle,
  type AlertTextStyle
} from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { alertTextLayerStyle } from "./alert-text-style.js";

const customTextStyle: AlertTextStyle = {
  fontPreset: "serif",
  fontSizePx: 64,
  fontWeight: 700,
  lineHeight: 1.3,
  horizontalAlign: "left",
  verticalAlign: "bottom",
  color: "#FFCC00FF",
  shadow: null
};

const customBoxStyle: AlertTextBoxStyle = {
  backgroundColor: "#102030BF",
  paddingPx: 24,
  cornerRadiusPx: 18,
  shadow: { offsetX: 4, offsetY: 6, blur: 12, color: "#00000080" }
};

describe("alertTextLayerStyle", () => {
  it("maps the fixed preset catalog and scales pixel properties", () => {
    expect(alertTextLayerStyle({ textStyle: customTextStyle, boxStyle: customBoxStyle, scale: 0.5 })).toMatchObject({
      backgroundColor: "#102030BF",
      borderRadius: "9px",
      boxShadow: "2px 3px 6px #00000080",
      color: "#FFCC00FF",
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: "32px",
      fontWeight: 700,
      justifyContent: "flex-end",
      lineHeight: 1.3,
      padding: "12px",
      textAlign: "left",
      textShadow: "none"
    });

    for (const [fontPreset, fontFamily] of [
      ["system-sans", 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'],
      ["rounded-sans", 'ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif'],
      ["serif", 'Georgia, "Times New Roman", serif'],
      ["monospace", 'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace']
    ] as const) {
      expect(
        alertTextLayerStyle({
          textStyle: { ...compatibilityAlertTextStyle, fontPreset },
          boxStyle: compatibilityAlertTextBoxStyle
        })?.fontFamily
      ).toBe(fontFamily);
    }
  });

  it("uses compatibility defaults and fails closed for forged values", () => {
    expect(alertTextLayerStyle({})).toMatchObject({
      fontSize: "32px",
      fontWeight: 800,
      textShadow: "0px 2px 8px #000000B8",
      backgroundColor: "#00000000",
      boxShadow: "none"
    });
    expect(
      alertTextLayerStyle({
        textStyle: { ...compatibilityAlertTextStyle, fontPreset: "remote-font" } as never
      })
    ).toBeNull();
    expect(
      alertTextLayerStyle({
        boxStyle: { ...compatibilityAlertTextBoxStyle, paddingPx: 257 } as never
      })
    ).toBeNull();
  });
});
