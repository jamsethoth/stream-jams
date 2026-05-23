import { z } from "zod";
import { nonEmptyStringSchema } from "../shared/schemas.js";

export const appServerConfigSchema = z.object({
  host: z.literal("127.0.0.1"),
  port: z.number().int().min(1).max(65_535)
});

export const appStorageConfigSchema = z.object({
  dataDirectory: nonEmptyStringSchema,
  assetDirectory: nonEmptyStringSchema
});

export const appConfigSchema = z.object({
  server: appServerConfigSchema,
  storage: appStorageConfigSchema
});

export const appConfigUpdateSchema = z.object({
  server: appServerConfigSchema.partial().optional(),
  storage: appStorageConfigSchema.partial().optional()
});
