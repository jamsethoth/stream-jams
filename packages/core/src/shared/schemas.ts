import { z } from "zod";

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const nonEmptyStringSchema = z.string().trim().min(1);

export const nullableNonEmptyStringSchema = nonEmptyStringSchema.nullable();

export const positiveIntegerSchema = z.number().int().positive();

export const nonNegativeIntegerSchema = z.number().int().min(0);

export const metadataSchema = z.record(z.string(), z.unknown());

export const uuidLikeIdSchema = nonEmptyStringSchema;

export const overlayPurposeSchema = z.enum(["live", "test"]);

export const overlayScopeSchema = z.enum(["module", "unified"]);

export const overlayTargetProfileIdSchema = z.enum(["landscape", "vertical"]);

export const overlayElementLayoutSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  zIndex: z.number().int()
});

export type OverlayPurpose = z.infer<typeof overlayPurposeSchema>;
export type OverlayScope = z.infer<typeof overlayScopeSchema>;
export type OverlayTargetProfileId = z.infer<typeof overlayTargetProfileIdSchema>;
export type OverlayElementLayout = z.infer<typeof overlayElementLayoutSchema>;
