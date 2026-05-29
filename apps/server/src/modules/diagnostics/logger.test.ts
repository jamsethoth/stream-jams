import { join } from "node:path";
import type { LogContext, LogSettings } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createRedactor } from "../security/redactor.js";
import {
  createStructuredLogger,
  resolveHourlyLogFilePath,
  shouldLogLevel,
  type StructuredLogSink
} from "./logger.js";

const logDirectory = "/tmp/stream-jams/logs";
const infoSettings: LogSettings = {
  level: "INFO",
  rollover: "hourly",
  retentionHours: 48
};
const baseContext: LogContext = {
  module: "diagnostics",
  source: "logger.test",
  correlationId: "corr_123",
  processingId: "proc_456",
  metadata: {
    action: "write-log"
  }
};

describe("structured logger", () => {
  it("filters records below the configured level", async () => {
    const sink = new RecordingSink();
    const logger = createStructuredLogger({
      logDirectory,
      settings: infoSettings,
      redactor: createRedactor(),
      sink,
      clock: () => new Date("2026-05-26T14:15:30.000Z")
    });

    await logger.debug("debug detail", baseContext);
    await logger.info("operator-visible event", baseContext);

    expect(sink.records).toHaveLength(1);
    expect(JSON.parse(sink.records[0]?.line ?? "{}")).toMatchObject({
      timestamp: "2026-05-26T14:15:30.000Z",
      level: "INFO",
      message: "operator-visible event",
      module: "diagnostics",
      source: "logger.test",
      correlationId: "corr_123",
      processingId: "proc_456",
      metadata: {
        action: "write-log"
      }
    });
  });

  it("redacts message text and metadata without mutating caller context", async () => {
    const sink = new RecordingSink();
    const metadata = {
      headers: {
        authorization: "Bearer oauth-secret",
        accept: "application/json"
      },
      callbackUrl: "https://example.test/callback?access_token=oauth-secret&state=public"
    };
    const logger = createStructuredLogger({
      logDirectory,
      settings: infoSettings,
      redactor: createRedactor(),
      sink,
      clock: () => new Date("2026-05-26T14:15:30.000Z")
    });

    await logger.error("Failed with Authorization: Bearer oauth-secret for ovl_testSecret", {
      ...baseContext,
      metadata
    });

    const record = JSON.parse(sink.records[0]?.line ?? "{}");
    expect(record.message).toBe("Failed with Authorization: Bearer [REDACTED] for [REDACTED]");
    expect(record.metadata).toEqual({
      headers: {
        authorization: "[REDACTED]",
        accept: "application/json"
      },
      callbackUrl: "https://example.test/callback?access_token=%5BREDACTED%5D&state=public"
    });
    expect(metadata.headers.authorization).toBe("Bearer oauth-secret");
  });

  it("uses UTC hourly rollover file names", async () => {
    const sink = new RecordingSink();
    const timestamps = [new Date("2026-05-26T14:59:59.000Z"), new Date("2026-05-26T15:00:00.000Z")];
    const logger = createStructuredLogger({
      logDirectory,
      settings: infoSettings,
      redactor: createRedactor(),
      sink,
      clock: () => timestamps.shift() ?? new Date("2026-05-26T15:00:00.000Z")
    });

    await logger.warn("before rollover", baseContext);
    await logger.warn("after rollover", baseContext);

    expect(sink.records.map((record) => record.filePath)).toEqual([
      join(logDirectory, "stream-jams-2026-05-26-14.log"),
      join(logDirectory, "stream-jams-2026-05-26-15.log")
    ]);
    expect(resolveHourlyLogFilePath(logDirectory, new Date("2026-12-31T23:00:00.000Z"))).toBe(
      join(logDirectory, "stream-jams-2026-12-31-23.log")
    );
  });

  it("compares log level severity in ascending verbosity order", () => {
    expect(shouldLogLevel("DEBUG", "INFO")).toBe(false);
    expect(shouldLogLevel("INFO", "INFO")).toBe(true);
    expect(shouldLogLevel("ERROR", "WARN")).toBe(true);
    expect(shouldLogLevel("WARN", "ERROR")).toBe(false);
  });
});

/** Logger test sink that captures structured log lines without touching the filesystem. */
class RecordingSink implements StructuredLogSink {
  readonly records: Array<{ readonly filePath: string; readonly line: string }> = [];

  async appendLine(filePath: string, line: string): Promise<void> {
    this.records.push({ filePath, line });
  }
}
