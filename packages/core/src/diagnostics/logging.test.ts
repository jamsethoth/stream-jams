import { describe, expect, it } from "vitest";
import {
  defaultLogSettings,
  logContextSchema,
  logLevelSchema,
  logSettingsSchema,
  logSettingsUpdateSchema
} from "./logging.js";
import {
  defaultLogSettings as exportedDefaultLogSettings,
  logContextSchema as exportedLogContextSchema,
  logSettingsSchema as exportedLogSettingsSchema
} from "../index.js";

describe("logging diagnostics schemas", () => {
  it("accepts only supported log levels", () => {
    expect(logLevelSchema.options).toEqual(["DEBUG", "INFO", "WARN", "ERROR"]);
    expect(logLevelSchema.safeParse("INFO").success).toBe(true);
    expect(logLevelSchema.safeParse("TRACE").success).toBe(false);
  });

  it("defaults logging settings to info level, hourly rollover, and 48 hour retention", () => {
    expect(logSettingsSchema.parse({})).toEqual({
      level: "INFO",
      rollover: "hourly",
      retentionHours: 48
    });
    expect(defaultLogSettings).toEqual({
      level: "INFO",
      rollover: "hourly",
      retentionHours: 48
    });
    expect(exportedDefaultLogSettings).toEqual(defaultLogSettings);
    expect(exportedLogSettingsSchema.parse({})).toEqual(defaultLogSettings);
  });

  it("rejects retention values that cannot define a practical cleanup window", () => {
    expect(logSettingsSchema.safeParse({ retentionHours: 0 }).success).toBe(false);
    expect(logSettingsSchema.safeParse({ retentionHours: -1 }).success).toBe(false);
    expect(logSettingsSchema.safeParse({ retentionHours: 1.5 }).success).toBe(false);
    expect(logSettingsSchema.safeParse({ retentionHours: 8_761 }).success).toBe(false);
  });

  it("validates log context identity and metadata for traceable records", () => {
    const context = {
      module: "diagnostics",
      source: "log-config-service",
      correlationId: "corr_123",
      processingId: "proc_456",
      metadata: {
        action: "update-log-level"
      }
    };

    expect(logContextSchema.parse(context)).toEqual(context);
    expect(exportedLogContextSchema.parse(context)).toEqual(context);
    expect(logContextSchema.safeParse({ ...context, correlationId: "" }).success).toBe(false);
  });

  it("allows partial logging settings updates while rejecting unsupported values", () => {
    expect(logSettingsUpdateSchema.parse({ level: "DEBUG" })).toEqual({ level: "DEBUG" });
    expect(logSettingsUpdateSchema.parse({ retentionHours: 72 })).toEqual({ retentionHours: 72 });
    expect(logSettingsUpdateSchema.safeParse({ level: "TRACE" }).success).toBe(false);
  });
});
