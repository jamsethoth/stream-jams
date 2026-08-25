import { describe, expect, it } from "vitest";
import {
  alertFontPresets,
  alertShadowStyleSchema,
  alertTextBoxStyleSchema,
  alertTextStyleSchema,
  compatibilityAlertTextBoxStyle,
  compatibilityAlertTextStyle,
  compatibleRgbaColorSchema,
  rgbaColorSchema
} from "./text-style.js";

describe("alert text styles", () => {
  it("normalizes canonical RGBA colors and rejects CSS-like values", () => {
    expect(rgbaColorSchema.parse("#12ab34cd")).toBe("#12AB34CD");
    for (const value of ["#12AB34", "red", "rgb(1, 2, 3)", "url(font.woff2)", "var(--color)", 123]) {
      expect(rgbaColorSchema.safeParse(value).success).toBe(false);
    }
  });

  it("normalizes legacy CSS hex colors for shape compatibility only", () => {
    expect(compatibleRgbaColorSchema.parse("#abc")).toBe("#AABBCCFF");
    expect(compatibleRgbaColorSchema.parse("#abcd")).toBe("#AABBCCDD");
    expect(compatibleRgbaColorSchema.parse("#12ab34")).toBe("#12AB34FF");
    expect(compatibleRgbaColorSchema.parse("#12ab34cd")).toBe("#12AB34CD");

    for (const value of [
      "#12",
      "#12345",
      "#1234567",
      "red",
      "rgb(1, 2, 3)",
      "linear-gradient(red, blue)",
      "url(shape.svg)",
      "var(--color)",
      123
    ]) {
      expect(compatibleRgbaColorSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts only fixed font presets, approved weights, and bounded typography", () => {
    expect(alertFontPresets.map(({ id }) => id)).toEqual([
      "system-sans",
      "rounded-sans",
      "serif",
      "monospace"
    ]);

    for (const fontSizePx of [8, 512]) {
      expect(alertTextStyleSchema.safeParse({ ...compatibilityAlertTextStyle, fontSizePx }).success).toBe(true);
    }
    for (const fontSizePx of [7, 513]) {
      expect(alertTextStyleSchema.safeParse({ ...compatibilityAlertTextStyle, fontSizePx }).success).toBe(false);
    }
    for (const lineHeight of [0.75, 3]) {
      expect(alertTextStyleSchema.safeParse({ ...compatibilityAlertTextStyle, lineHeight }).success).toBe(true);
    }
    for (const lineHeight of [0.74, 3.01, Number.POSITIVE_INFINITY]) {
      expect(alertTextStyleSchema.safeParse({ ...compatibilityAlertTextStyle, lineHeight }).success).toBe(false);
    }
    for (const fontWeight of [400, 500, 600, 700, 800, 900]) {
      expect(alertTextStyleSchema.safeParse({ ...compatibilityAlertTextStyle, fontWeight }).success).toBe(true);
    }
    for (const fontWeight of [300, 450, 1000]) {
      expect(alertTextStyleSchema.safeParse({ ...compatibilityAlertTextStyle, fontWeight }).success).toBe(false);
    }
    expect(
      alertTextStyleSchema.safeParse({ ...compatibilityAlertTextStyle, fontPreset: "external-font" }).success
    ).toBe(false);
  });

  it("bounds text and box shadows, padding, and radius", () => {
    for (const offset of [-256, 256]) {
      expect(
        alertShadowStyleSchema.safeParse({ offsetX: offset, offsetY: offset, blur: 0, color: "#000000FF" }).success
      ).toBe(true);
    }
    for (const offset of [-257, 257]) {
      expect(
        alertShadowStyleSchema.safeParse({ offsetX: offset, offsetY: 0, blur: 0, color: "#000000FF" }).success
      ).toBe(false);
    }
    for (const blur of [0, 256]) {
      expect(
        alertShadowStyleSchema.safeParse({ offsetX: 0, offsetY: 0, blur, color: "#000000FF" }).success
      ).toBe(true);
    }
    expect(
      alertShadowStyleSchema.safeParse({ offsetX: 0, offsetY: 0, blur: 257, color: "#000000FF" }).success
    ).toBe(false);

    for (const paddingPx of [0, 256]) {
      expect(alertTextBoxStyleSchema.safeParse({ ...compatibilityAlertTextBoxStyle, paddingPx }).success).toBe(true);
    }
    for (const paddingPx of [-1, 257]) {
      expect(alertTextBoxStyleSchema.safeParse({ ...compatibilityAlertTextBoxStyle, paddingPx }).success).toBe(false);
    }
    for (const cornerRadiusPx of [0, 512]) {
      expect(
        alertTextBoxStyleSchema.safeParse({ ...compatibilityAlertTextBoxStyle, cornerRadiusPx }).success
      ).toBe(true);
    }
    for (const cornerRadiusPx of [-1, 513]) {
      expect(
        alertTextBoxStyleSchema.safeParse({ ...compatibilityAlertTextBoxStyle, cornerRadiusPx }).success
      ).toBe(false);
    }
  });

  it("rejects raw CSS and external font fields", () => {
    for (const extra of [
      { fontFamily: "Custom" },
      { fontUrl: "https://example.test/font.woff2" },
      { css: "font-size: 999px" },
      { filter: "blur(4px)" }
    ]) {
      expect(alertTextStyleSchema.safeParse({ ...compatibilityAlertTextStyle, ...extra }).success).toBe(false);
    }
    expect(
      alertTextBoxStyleSchema.safeParse({
        ...compatibilityAlertTextBoxStyle,
        backgroundImage: "url(https://example.test/image.png)"
      }).success
    ).toBe(false);
  });
});
