import { z } from "zod";

export const alertFontPresets = [
  {
    id: "system-sans",
    label: "System sans",
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },
  {
    id: "rounded-sans",
    label: "Rounded sans",
    fontFamily: 'ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif'
  },
  {
    id: "serif",
    label: "Serif",
    fontFamily: 'Georgia, "Times New Roman", serif'
  },
  {
    id: "monospace",
    label: "Monospace",
    fontFamily: 'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace'
  }
] as const;

export const alertFontWeights = [400, 500, 600, 700, 800, 900] as const;

export const alertTextStyleLimits = {
  fontSizePx: { min: 8, max: 512 },
  lineHeight: { min: 0.75, max: 3 },
  paddingPx: { min: 0, max: 256 },
  cornerRadiusPx: { min: 0, max: 512 },
  shadowOffsetPx: { min: -256, max: 256 },
  shadowBlurPx: { min: 0, max: 256 }
} as const;

export const rgbaColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{8}$/iu, "Use an 8-digit RGBA hex color")
  .transform((value) => value.toUpperCase());

export const alertShadowStyleSchema = z
  .object({
    offsetX: z
      .number()
      .int()
      .min(alertTextStyleLimits.shadowOffsetPx.min)
      .max(alertTextStyleLimits.shadowOffsetPx.max),
    offsetY: z
      .number()
      .int()
      .min(alertTextStyleLimits.shadowOffsetPx.min)
      .max(alertTextStyleLimits.shadowOffsetPx.max),
    blur: z
      .number()
      .int()
      .min(alertTextStyleLimits.shadowBlurPx.min)
      .max(alertTextStyleLimits.shadowBlurPx.max),
    color: rgbaColorSchema
  })
  .strict();

export const alertTextStyleSchema = z
  .object({
    fontPreset: z.enum(["system-sans", "rounded-sans", "serif", "monospace"]),
    fontSizePx: z
      .number()
      .int()
      .min(alertTextStyleLimits.fontSizePx.min)
      .max(alertTextStyleLimits.fontSizePx.max),
    fontWeight: z.union([
      z.literal(400),
      z.literal(500),
      z.literal(600),
      z.literal(700),
      z.literal(800),
      z.literal(900)
    ]),
    lineHeight: z
      .number()
      .finite()
      .min(alertTextStyleLimits.lineHeight.min)
      .max(alertTextStyleLimits.lineHeight.max),
    horizontalAlign: z.enum(["left", "center", "right"]),
    verticalAlign: z.enum(["top", "center", "bottom"]),
    color: rgbaColorSchema,
    shadow: alertShadowStyleSchema.nullable()
  })
  .strict();

export const alertTextBoxStyleSchema = z
  .object({
    backgroundColor: rgbaColorSchema,
    paddingPx: z
      .number()
      .int()
      .min(alertTextStyleLimits.paddingPx.min)
      .max(alertTextStyleLimits.paddingPx.max),
    cornerRadiusPx: z
      .number()
      .int()
      .min(alertTextStyleLimits.cornerRadiusPx.min)
      .max(alertTextStyleLimits.cornerRadiusPx.max),
    shadow: alertShadowStyleSchema.nullable()
  })
  .strict();

export type AlertFontPresetId = z.infer<typeof alertTextStyleSchema>["fontPreset"];
export type AlertShadowStyle = z.infer<typeof alertShadowStyleSchema>;
export type AlertTextStyle = z.infer<typeof alertTextStyleSchema>;
export type AlertTextBoxStyle = z.infer<typeof alertTextBoxStyleSchema>;

export const compatibilityAlertTextStyle = {
  fontPreset: "system-sans",
  fontSizePx: 32,
  fontWeight: 800,
  lineHeight: 1.15,
  horizontalAlign: "center",
  verticalAlign: "center",
  color: "#FFFFFFFF",
  shadow: {
    offsetX: 0,
    offsetY: 2,
    blur: 8,
    color: "#000000B8"
  }
} as const satisfies AlertTextStyle;

export const compatibilityAlertTextBoxStyle = {
  backgroundColor: "#00000000",
  paddingPx: 0,
  cornerRadiusPx: 0,
  shadow: null
} as const satisfies AlertTextBoxStyle;

export const defaultOptionalAlertShadow = {
  offsetX: 0,
  offsetY: 4,
  blur: 12,
  color: "#00000080"
} as const satisfies AlertShadowStyle;
