import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  logContextSchema,
  logSettingsSchema,
  type Logger,
  type LogContext,
  type LogLevel,
  type LogSettings,
  type Redactor
} from "@stream-jams/core";

const logLevelSeverity: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};

export interface StructuredLogSink {
  appendLine(filePath: string, line: string): Promise<void>;
}

export interface StructuredLoggerOptions {
  readonly logDirectory: string;
  readonly settings: LogSettings;
  readonly redactor: Redactor;
  readonly sink?: StructuredLogSink;
  readonly clock?: () => Date;
}

interface StructuredLogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly module: string;
  readonly source: string;
  readonly correlationId: string;
  readonly processingId: string | null;
  readonly metadata: Record<string, unknown>;
}

export function createStructuredLogger(options: StructuredLoggerOptions): Logger {
  const settings = logSettingsSchema.parse(options.settings);
  const sink = options.sink ?? new FileStructuredLogSink();
  const clock = options.clock ?? (() => new Date());

  async function write(level: LogLevel, message: string, context: LogContext): Promise<void> {
    if (!shouldLogLevel(level, settings.level)) {
      return;
    }

    const timestamp = clock();
    const parsedContext = logContextSchema.parse(context);
    const record: StructuredLogRecord = {
      timestamp: timestamp.toISOString(),
      level,
      message: options.redactor.redactText(message),
      module: parsedContext.module,
      source: parsedContext.source,
      correlationId: parsedContext.correlationId,
      processingId: parsedContext.processingId,
      metadata: options.redactor.redact(parsedContext.metadata ?? {})
    };

    await sink.appendLine(resolveHourlyLogFilePath(options.logDirectory, timestamp), JSON.stringify(record));
  }

  return {
    debug: (message, context) => write("DEBUG", message, context),
    info: (message, context) => write("INFO", message, context),
    warn: (message, context) => write("WARN", message, context),
    error: (message, context) => write("ERROR", message, context)
  };
}

export function shouldLogLevel(candidate: LogLevel, configured: LogLevel): boolean {
  return logLevelSeverity[candidate] >= logLevelSeverity[configured];
}

export function resolveHourlyLogFilePath(logDirectory: string, timestamp: Date): string {
  const year = timestamp.getUTCFullYear();
  const month = padDatePart(timestamp.getUTCMonth() + 1);
  const day = padDatePart(timestamp.getUTCDate());
  const hour = padDatePart(timestamp.getUTCHours());

  return join(logDirectory, `stream-jams-${year}-${month}-${day}-${hour}.log`);
}

/** Appends structured log lines to hourly files, creating log directories on demand. */
class FileStructuredLogSink implements StructuredLogSink {
  async appendLine(filePath: string, line: string): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${line}\n`, "utf8");
  }
}

function padDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}
