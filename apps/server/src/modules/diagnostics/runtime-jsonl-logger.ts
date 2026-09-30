import { mkdir, readdir, readFile, appendFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  serializeException,
  serializedExceptionSchema,
  type LogContext,
  type Logger,
  type LogLevel,
  type LogSettings,
  type Redactor,
  type SerializedException
} from "@stream-jams/core";
import { EmergencyLogWriter, type EmergencyLogInput } from "./emergency-log-writer.js";
import { LogRetentionService } from "./log-retention-service.js";

export interface RuntimeLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly component: string;
  readonly message: string;
  readonly correlationId: string;
  readonly processingId: string | null;
  readonly exception: SerializedException | null;
  readonly details?: Record<string, string | number | boolean | null> | undefined;
}

export interface RuntimeLogMetadata {
  readonly logDirectory: string;
  readonly level: LogLevel;
  readonly rollover: "hourly";
  readonly retentionHours: number;
  readonly fileCount: number;
  readonly currentLogFile: string;
  readonly oldestLogFile: string | null;
  readonly newestLogFile: string | null;
}

export interface RuntimeLogReadResult {
  readonly entries: readonly RuntimeLogEntry[];
  readonly truncated: boolean;
  readonly skippedCorruptRecords?: number;
}

export interface RuntimeJsonlLoggerOptions {
  readonly logDirectory: string;
  readonly settings: LogSettings;
  readonly redactor: Redactor;
  readonly retentionService?: Pick<LogRetentionService, "cleanupExpiredLogs"> | undefined;
  readonly now?: (() => Date) | undefined;
  readonly emergencyWriter?: Pick<EmergencyLogWriter, "write"> | undefined;
  readonly fileSystem?: RuntimeLogFileSystem | undefined;
  readonly serialize?: ((value: unknown) => SerializedException) | undefined;
}

export interface RuntimeLogFileSystem {
  mkdir(path: string, options: { readonly recursive: true }): Promise<unknown>;
  appendFile(path: string, data: string, encoding: "utf8"): Promise<unknown>;
  readdir(path: string): Promise<readonly string[]>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
}

const levelPriority: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};

const droppedMetadataNames = new Set(["body", "payload", "rawbody", "rawpayload", "providerpayload", "httperrorbody"]);

export class RuntimeJsonlLogger implements Logger {
  readonly #logDirectory: string;
  readonly #settings: LogSettings;
  readonly #redactor: Redactor;
  readonly #retentionService: Pick<LogRetentionService, "cleanupExpiredLogs">;
  readonly #now: () => Date;
  readonly #emergencyWriter: Pick<EmergencyLogWriter, "write">;
  readonly #fileSystem: RuntimeLogFileSystem;
  readonly #serialize: (value: unknown) => SerializedException;

  constructor(options: RuntimeJsonlLoggerOptions) {
    this.#logDirectory = options.logDirectory;
    this.#settings = options.settings;
    this.#redactor = options.redactor;
    this.#retentionService = options.retentionService ?? new LogRetentionService();
    this.#now = options.now ?? (() => new Date());
    this.#emergencyWriter = options.emergencyWriter ?? new EmergencyLogWriter({
      filePath: join(this.#logDirectory, "emergency-errors.jsonl")
    });
    this.#fileSystem = options.fileSystem ?? { mkdir, appendFile, readdir, readFile };
    this.#serialize = options.serialize ?? serializeException;
  }

  async debug(message: string, context: LogContext): Promise<void> {
    await this.#write("DEBUG", message, context);
  }

  async info(message: string, context: LogContext): Promise<void> {
    await this.#write("INFO", message, context);
  }

  async warn(message: string, context: LogContext): Promise<void> {
    await this.#write("WARN", message, context);
  }

  async error(message: string, context: LogContext, exception?: unknown): Promise<void> {
    await this.#write("ERROR", message, context, exception);
  }

  async getMetadata(): Promise<RuntimeLogMetadata> {
    await this.#fileSystem.mkdir(this.#logDirectory, { recursive: true });
    const files = await this.#listLogFiles();
    const currentLogFile = basename(this.#filePathFor(this.#now()));
    return {
      logDirectory: this.#logDirectory,
      level: this.#settings.level,
      rollover: this.#settings.rollover,
      retentionHours: this.#settings.retentionHours,
      fileCount: files.length,
      currentLogFile,
      oldestLogFile: files[0] ?? null,
      newestLogFile: files.at(-1) ?? null
    };
  }

  async listRecent(options: { readonly limit: number; readonly sinceHours?: number | undefined }): Promise<RuntimeLogReadResult> {
    const cutoff = options.sinceHours === undefined ? null : this.#now().getTime() - options.sinceHours * 60 * 60 * 1000;
    const files = (await this.#listLogFiles()).reverse();
    const entries: RuntimeLogEntry[] = [];
    let scanned = 0;
    let skippedCorruptRecords = 0;

    for (const file of files) {
      const raw = await this.#fileSystem.readFile(join(this.#logDirectory, file), "utf8");
      for (const line of raw.split("\n").reverse()) {
        if (line.trim() === "") continue;
        let entry: RuntimeLogEntry | null = null;
        try { entry = normalizeRuntimeLogEntry(JSON.parse(line) as unknown); }
        // error-provenance: allow expected -- corrupt-record count is exposed without leaking damaged raw text
        catch { /* A partial JSONL write must not hide other valid evidence. */ }
        if (entry === null) { skippedCorruptRecords += 1; continue; }
        if (cutoff !== null && Date.parse(entry.timestamp) < cutoff) {
          continue;
        }

        scanned += 1;
        if (entries.length < options.limit) {
          entries.push(entry);
        }
      }
    }

    if (skippedCorruptRecords > 0) {
      entries.unshift({
        timestamp: this.#now().toISOString(), level: "WARN", event: "diagnostics.runtime-log.corrupt-records",
        component: "diagnostics", correlationId: "runtime-log-corrupt-records", processingId: null, exception: null,
        message: `Runtime log coverage is incomplete: ${skippedCorruptRecords} damaged records were skipped.`,
        details: { skippedCorruptRecords, coverageIncomplete: true }
      });
    }
    return { entries: entries.slice(0, options.limit), truncated: scanned + (skippedCorruptRecords > 0 ? 1 : 0) > options.limit, skippedCorruptRecords };
  }

  async #write(level: LogLevel, message: string, context: LogContext, originalException?: unknown): Promise<void> {
    if (levelPriority[level] < levelPriority[this.#settings.level]) {
      return;
    }

    const timestamp = this.#now();
    try {
      const exception = originalException === undefined ? null : this.#serialize(originalException);
      await this.#fileSystem.mkdir(this.#logDirectory, { recursive: true });
      const entry = this.#redactor.redact({
        timestamp: timestamp.toISOString(),
        level,
        event: context.source,
        component: context.module,
        message,
        correlationId: context.correlationId,
        processingId: context.processingId,
        exception,
        ...(context.metadata === undefined ? {} : { details: sanitizeMetadata(context.metadata) })
      }) as RuntimeLogEntry;
      await this.#fileSystem.appendFile(this.#filePathFor(timestamp), `${JSON.stringify(entry)}\n`, "utf8");
      await this.#retentionService.cleanupExpiredLogs({
        logDirectory: this.#logDirectory,
        settings: this.#settings,
        now: timestamp
      });
    } catch (loggerException) {
      const emergency: EmergencyLogInput = {
        timestamp: timestamp.toISOString(),
        component: context.module,
        event: context.source,
        referenceId: context.correlationId,
        message,
        originalException,
        loggerException
      };
      try { this.#emergencyWriter.write(emergency); }
      // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
      catch { /* The default emergency writer never throws. */ }
    }
  }

  async #listLogFiles(): Promise<string[]> {
    try {
      return [...await this.#fileSystem.readdir(this.#logDirectory)]
        .filter((file) => /^runtime-\d{10}\.jsonl$/.test(file))
        .sort();
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  #filePathFor(date: Date): string {
    return join(this.#logDirectory, `runtime-${date.toISOString().slice(0, 13).replaceAll("-", "").replace("T", "")}.jsonl`);
  }
}

function normalizeRuntimeLogEntry(value: unknown): RuntimeLogEntry | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.timestamp !== "string" || !Number.isFinite(Date.parse(entry.timestamp)) ||
    typeof entry.level !== "string" || !Object.hasOwn(levelPriority, entry.level) ||
    typeof entry.event !== "string" || typeof entry.component !== "string" || typeof entry.message !== "string" ||
    typeof entry.correlationId !== "string" || (entry.processingId !== null && typeof entry.processingId !== "string")) return null;
  const exception = entry.exception == null ? null : serializedExceptionSchema.safeParse(entry.exception);
  if (exception !== null && !exception.success) return null;
  if (entry.details !== undefined && (entry.details === null || typeof entry.details !== "object" || Array.isArray(entry.details))) return null;
  return {
    timestamp: entry.timestamp, level: entry.level as LogLevel, event: entry.event, component: entry.component,
    message: entry.message, correlationId: entry.correlationId, processingId: entry.processingId,
    exception: exception?.data ?? null,
    ...(entry.details === undefined ? {} : { details: sanitizeMetadata(entry.details as Record<string, unknown>) })
  };
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (droppedMetadataNames.has(normalizeName(key))) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
    }
  }

  return safe;
}

function normalizeName(name: string): string {
  return name.replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
