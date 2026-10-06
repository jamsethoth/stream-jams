import { z } from "zod";

const nullableString = z.string().nullable();
export const diagnosticsEventLogViewSchema = z.object({
  id: z.string(), eventId: z.string(), providerId: z.string(), eventType: z.string(), actorDisplayName: z.string(),
  status: z.enum(["received", "processed", "failed"]), receivedAt: z.string(), correlationId: z.string(),
  processingId: nullableString, errorMessage: nullableString
});
export const diagnosticsAlertMatchLogViewSchema = z.object({
  id: z.string(), sourceEventId: z.string(), ruleId: z.string(), variantId: z.string(), matchedAt: z.string(),
  correlationId: z.string(), processingId: nullableString
});
export const diagnosticsPlaybackLogViewSchema = z.object({
  id: z.string(), queueItemId: z.string(), sourceEventId: z.string(), alertIds: z.array(z.string()).readonly(),
  status: z.enum(["queued", "playing", "completed", "skipped", "failed"]), occurredAt: z.string(),
  correlationId: z.string(), processingId: nullableString, message: nullableString
});
export const diagnosticsProviderErrorViewSchema = z.object({
  id: z.string(), providerId: z.string(), label: z.string(), occurredAt: z.string(), message: z.string(),
  correlationId: nullableString, processingId: nullableString
});
export const runtimeLogMetadataViewSchema = z.object({
  logDirectory: z.string(), level: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]), rollover: z.literal("hourly"),
  retentionHours: z.number().int().nonnegative(), fileCount: z.number().int().nonnegative(), currentLogFile: z.string(),
  oldestLogFile: nullableString, newestLogFile: nullableString
});
export const diagnosticsViewSchema = z.object({
  eventLogs: z.array(diagnosticsEventLogViewSchema).readonly(), alertMatchLogs: z.array(diagnosticsAlertMatchLogViewSchema).readonly(),
  playbackLogs: z.array(diagnosticsPlaybackLogViewSchema).readonly(), providerErrors: z.array(diagnosticsProviderErrorViewSchema).readonly(),
  runtimeLogging: runtimeLogMetadataViewSchema.nullable()
});
// Raw redacted payloads are intentionally opaque; preserve their provider-specific data.
export const diagnosticsExportViewSchema = diagnosticsViewSchema.extend({
  generatedAt: z.string(), debugExport: z.literal(false), rawEventLogs: z.array(z.unknown()).readonly()
}).passthrough();
export const diagnosticsDebugExportViewSchema = diagnosticsViewSchema.extend({
  generatedAt: z.string(), debugExport: z.literal(true), rawEventLogs: z.array(z.unknown()).readonly(),
  runtimeLogEntries: z.array(z.unknown()).readonly(), runtimeLogTruncated: z.boolean(),
  runtimeLogSkippedCorruptRecords: z.number().int().nonnegative()
}).passthrough();
export type DiagnosticsEventLogView = z.infer<typeof diagnosticsEventLogViewSchema>;
export type DiagnosticsAlertMatchLogView = z.infer<typeof diagnosticsAlertMatchLogViewSchema>;
export type DiagnosticsPlaybackLogView = z.infer<typeof diagnosticsPlaybackLogViewSchema>;
export type DiagnosticsProviderErrorView = z.infer<typeof diagnosticsProviderErrorViewSchema>;
export type RuntimeLogMetadataView = z.infer<typeof runtimeLogMetadataViewSchema>;
export type DiagnosticsView = z.infer<typeof diagnosticsViewSchema>;
export type DiagnosticsExportView = z.infer<typeof diagnosticsExportViewSchema>;
export type DiagnosticsDebugExportView = z.infer<typeof diagnosticsDebugExportViewSchema>;
