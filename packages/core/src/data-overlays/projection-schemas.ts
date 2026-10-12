import { z } from "zod";
import { rgbaColorSchema } from "../alerts/text-style.js";
import { overlayTargetProfileIdSchema } from "../shared/schemas.js";
import { dataOverlayLimits } from "./limits.js";
const dataIdSchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/u);
const dataIntegerSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const revision = dataIntegerSchema.nonnegative();
const dataTextStyleSchema = z.object({ fontSizePx: z.number().int().min(dataOverlayLimits.fontSizePx.min).max(dataOverlayLimits.fontSizePx.max), color: rgbaColorSchema, fontWeight: z.number().int().min(100).max(900).multipleOf(100), align: z.enum(["left", "center", "right"]) }).strict();
const projectedGeometry = { id: dataIdSchema, order: dataIntegerSchema, x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative(), width: z.number().finite().positive(), height: z.number().finite().positive() };
export const dataProjectedElementSchema = z.discriminatedUnion("kind", [
  z.object({ ...projectedGeometry, kind: z.literal("text"), text: z.string().refine(value => new TextEncoder().encode(value).byteLength <= dataOverlayLimits.textBytes * 3 + 128, "Formatted text exceeds bounded content"), overflow: z.enum(["wrap", "ellipsis"]), style: dataTextStyleSchema }).strict(),
  z.object({ ...projectedGeometry, kind: z.literal("image"), assetId: dataIdSchema, fit: z.enum(["contain", "cover", "fill"]) }).strict(),
  z.object({ ...projectedGeometry, kind: z.enum(["rectangle", "ellipse"]), color: rgbaColorSchema }).strict(),
  z.object({ ...projectedGeometry, kind: z.literal("progress"), fill: z.number().finite().min(0).max(1), orientation: z.enum(["horizontal", "vertical"]), direction: z.enum(["forward", "reverse"]), fillColor: rgbaColorSchema, backgroundColor: rgbaColorSchema, borderColor: rgbaColorSchema, borderWidthPx: z.number().finite().min(0).max(dataOverlayLimits.borderWidthPx) }).strict()
]);
export const dataCanvasProjectionSchema = z.object({ id: dataIdSchema, order: dataIntegerSchema, targetProfileId: overlayTargetProfileIdSchema, elements: z.array(dataProjectedElementSchema).max(dataOverlayLimits.elementsPerCanvas) }).strict();
export const dataOverlayProjectionSchema = z.object({ runtimeId: dataIdSchema, revision, canvases: z.array(dataCanvasProjectionSchema).max(dataOverlayLimits.canvases) }).strict();
