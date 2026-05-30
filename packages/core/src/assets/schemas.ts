import { z } from "zod";
import { nonEmptyStringSchema, positiveIntegerSchema } from "../shared/schemas.js";

export const assetMediaTypeSchema = z.enum(["image", "gif", "video", "audio"]);

export const assetRecordSchema = z.object({
  id: nonEmptyStringSchema,
  originalFileName: nonEmptyStringSchema,
  mediaType: assetMediaTypeSchema,
  mimeType: nonEmptyStringSchema,
  sizeBytes: positiveIntegerSchema,
  checksum: nonEmptyStringSchema,
  storagePath: nonEmptyStringSchema
});

export const assetValidationResultSchema = z.object({
  accepted: z.boolean(),
  reason: z.string().nullable(),
  mediaType: assetMediaTypeSchema.nullable(),
  normalizedExtension: z.string().nullable()
});
