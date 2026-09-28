import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  serializeException,
  serializedExceptionSchema,
  type SerializedException
} from "@stream-jams/core";
import { z } from "zod";

export const desktopDiagnosticReportSchema = z.object({
  referenceId: z.string().min(1).max(256),
  component: z.string().min(1).max(128),
  source: z.string().min(1).max(256),
  message: z.string().min(1).max(4_096),
  exception: serializedExceptionSchema.nullable(),
  reason: z.string().max(512).nullable(),
  exitCode: z.number().int().nullable(),
  occurredAt: z.iso.datetime()
}).strict();

export type DesktopDiagnosticReport = z.infer<typeof desktopDiagnosticReportSchema>;

export interface DesktopDiagnosticInput {
  readonly referenceId?: string;
  readonly component: string;
  readonly source: string;
  readonly message: string;
  readonly exception?: unknown;
  readonly reason?: string | null;
  readonly exitCode?: number | null;
}

interface DesktopDiagnosticsOptions {
  readonly send: (report: DesktopDiagnosticReport) => boolean;
  readonly writeFallback?: (report: DesktopDiagnosticReport) => void;
  readonly generateReferenceId?: () => string;
  readonly now?: () => Date;
}

export class DesktopDiagnostics {
  readonly #send: DesktopDiagnosticsOptions["send"];
  readonly #writeFallback: DesktopDiagnosticsOptions["writeFallback"];
  readonly #generateReferenceId: () => string;
  readonly #now: () => Date;

  constructor(options: DesktopDiagnosticsOptions) {
    this.#send = options.send;
    this.#writeFallback = options.writeFallback;
    this.#generateReferenceId = options.generateReferenceId ?? (() => `err_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date());
  }

  record(input: DesktopDiagnosticInput): DesktopDiagnosticReport {
    const report = desktopDiagnosticReportSchema.parse({
      referenceId: input.referenceId ?? this.#generateReferenceId(),
      component: input.component,
      source: input.source,
      message: input.message,
      exception: input.exception === undefined ? null : serializeException(input.exception),
      reason: input.reason ?? null,
      exitCode: input.exitCode ?? null,
      occurredAt: this.#now().toISOString()
    });
    try {
      if (this.#send(report)) return report;
    }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch {
      // Worker transport is no longer viable; use the independent local sink.
    }
    this.fallback(report);
    return report;
  }

  fallback(report: DesktopDiagnosticReport): void {
    try {
      this.#writeFallback?.(sanitizeReport(report));
    }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch {
      // The fallback is the final local sink and must never recurse.
    }
  }

  recordPriorCrashDumps(candidates: readonly { readonly name: string; readonly modifiedAt: string }[]): void {
    for (const candidate of candidates
      .filter((item) => item.name === basename(item.name) && item.name.toLowerCase().endsWith(".dmp"))
      .slice(0, 10)) {
      this.record({
        component: "crashpad",
        source: "desktop.crashpad.prior-dump",
        message: "A local Crashpad dump from a prior launch is available. No crash data was uploaded.",
        reason: `${candidate.name} modified ${candidate.modifiedAt}`,
        exitCode: null
      });
    }
  }
}

export function collectPriorCrashDumpMetadata(directory: string): Array<{ name: string; modifiedAt: string }> {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".dmp"))
      .map((entry) => {
        const stats = statSync(join(directory, entry.name));
        return { name: basename(entry.name), modifiedAt: stats.mtime.toISOString() };
      })
      .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
      .slice(0, 10);
  }
  // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
  catch {
    return [];
  }
}

export function createDesktopDiagnosticFallbackWriter(path: string): (report: DesktopDiagnosticReport) => void {
  return (report) => {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(report)}\n`, { encoding: "utf8", mode: 0o600 });
  };
}

function sanitizeReport(report: DesktopDiagnosticReport): DesktopDiagnosticReport {
  return desktopDiagnosticReportSchema.parse({
    ...report,
    message: sanitizeText(report.message),
    reason: report.reason === null ? null : sanitizeText(report.reason),
    exception: report.exception === null ? null : sanitizeException(report.exception)
  });
}

function sanitizeException(exception: SerializedException): SerializedException {
  return {
    type: sanitizeText(exception.type),
    message: sanitizeText(exception.message),
    stack: exception.stack === null ? null : sanitizeText(exception.stack),
    code: exception.code === null ? null : sanitizeText(exception.code),
    cause: exception.cause === null ? null : sanitizeException(exception.cause),
    thrownValue: exception.thrownValue === null ? null : sanitizeText(exception.thrownValue)
  };
}

function sanitizeText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/giu, "[REDACTED_URL]")
    .replace(/\b(authorization|token|password|secret|api[-_ ]?key)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/giu, "$1=[REDACTED]")
    // eslint-disable-next-line no-control-regex -- remove unsafe control bytes from the final emergency sink
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "");
}
