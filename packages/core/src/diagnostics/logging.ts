import { z } from "zod";
import { metadataSchema, nonEmptyStringSchema } from "../shared/schemas.js";

export const logLevelSchema = z.enum(["DEBUG", "INFO", "WARN", "ERROR"]);

export const logRetentionHoursSchema = z.number().int().min(1).max(8_760);

export const logSettingsSchema = z.object({
  level: logLevelSchema.default("INFO"),
  rollover: z.literal("hourly").default("hourly"),
  retentionHours: logRetentionHoursSchema.default(48)
});

export const defaultLogSettings = logSettingsSchema.parse({});

export const logSettingsUpdateSchema = z.object({
  level: logLevelSchema.optional(),
  rollover: z.literal("hourly").optional(),
  retentionHours: logRetentionHoursSchema.optional()
});

export const logContextSchema = z.object({
  module: nonEmptyStringSchema,
  source: nonEmptyStringSchema,
  correlationId: nonEmptyStringSchema,
  processingId: nonEmptyStringSchema.nullable(),
  metadata: metadataSchema.optional()
});

export type LogLevel = z.infer<typeof logLevelSchema>;
export type LogSettings = z.infer<typeof logSettingsSchema>;
export type LogSettingsUpdate = z.infer<typeof logSettingsUpdateSchema>;
export type LogContext = z.infer<typeof logContextSchema>;
export type CorrelationId = string;
export type ProcessingId = string;

export interface Logger {
  debug(message: string, context: LogContext): Promise<void>;
  info(message: string, context: LogContext): Promise<void>;
  warn(message: string, context: LogContext): Promise<void>;
  error(message: string, context: LogContext): Promise<void>;
}
