import { mkdir, readdir, readFile, appendFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { LogContext, Logger, LogLevel, LogSettings, Redactor } from "@stream-jams/core";
import { LogRetentionService } from "./log-retention-service.js";

export interface RuntimeLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly component: string;
  readonly message: string;
  readonly correlationId: string;
  readonly processingId: string | null;
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
}

export interface RuntimeJsonlLoggerOptions {
  readonly logDirectory: string;
  readonly settings: LogSettings;
  readonly redactor: Redactor;
  readonly retentionService?: Pick<LogRetentionService, "cleanupExpiredLogs"> | undefined;
  readonly now?: (() => Date) | undefined;
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

  constructor(options: RuntimeJsonlLoggerOptions) {
    this.#logDirectory = options.logDirectory;
    this.#settings = options.settings;
    this.#redactor = options.redactor;
    this.#retentionService = options.retentionService ?? new LogRetentionService();
    this.#now = options.now ?? (() => new Date());
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

  async error(message: string, context: LogContext): Promise<void> {
    await this.#write("ERROR", message, context);
  }

  async getMetadata(): Promise<RuntimeLogMetadata> {
    await mkdir(this.#logDirectory, { recursive: true });
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

    for (const file of files) {
      const raw = await readFile(join(this.#logDirectory, file), "utf8");
      const fileEntries = raw
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line) as RuntimeLogEntry)
        .reverse();

      for (const entry of fileEntries) {
        if (cutoff !== null && Date.parse(entry.timestamp) < cutoff) {
          continue;
        }

        scanned += 1;
        if (entries.length < options.limit) {
          entries.push(entry);
        }
      }
    }

    return {
      entries,
      truncated: scanned > entries.length
    };
  }

  async #write(level: LogLevel, message: string, context: LogContext): Promise<void> {
    if (levelPriority[level] < levelPriority[this.#settings.level]) {
      return;
    }

    const timestamp = this.#now();
    await mkdir(this.#logDirectory, { recursive: true });
    const entry = this.#redactor.redact({
      timestamp: timestamp.toISOString(),
      level,
      event: context.source,
      component: context.module,
      message,
      correlationId: context.correlationId,
      processingId: context.processingId,
      ...(context.metadata === undefined ? {} : { details: sanitizeMetadata(context.metadata) })
    }) as RuntimeLogEntry;
    await appendFile(this.#filePathFor(timestamp), `${JSON.stringify(entry)}\n`, "utf8");
    await this.#retentionService.cleanupExpiredLogs({
      logDirectory: this.#logDirectory,
      settings: this.#settings,
      now: timestamp
    });
  }

  async #listLogFiles(): Promise<string[]> {
    try {
      return (await readdir(this.#logDirectory)).filter((file) => /^runtime-\d{10}\.jsonl$/.test(file)).sort();
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
