import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serializeException, type SerializedException } from "@stream-jams/core";
import { createRedactor } from "../security/redactor.js";

// This pure redactor has no logger dependency and is independent of the primary logger's injected instance.
const emergencyRedactor = createRedactor();

export interface EmergencyLogInput {
  readonly timestamp: string;
  readonly component: string;
  readonly event: string;
  readonly referenceId: string;
  readonly message: string;
  readonly originalException: unknown;
  readonly loggerException: unknown;
}

export interface EmergencyLogWriterOptions {
  readonly filePath: string;
  readonly appendFile?: ((path: string, data: string) => void) | undefined;
  readonly writeStderr?: ((data: string) => void) | undefined;
}

export class EmergencyLogWriter {
  readonly #filePath: string;
  readonly #appendFile: (path: string, data: string) => void;
  readonly #writeStderr: (data: string) => void;
  #writing = false;

  constructor(options: EmergencyLogWriterOptions) {
    this.#filePath = options.filePath;
    this.#appendFile = options.appendFile ?? appendEmergencyFile;
    this.#writeStderr = options.writeStderr ?? ((data) => { process.stderr.write(data); });
  }

  write(input: EmergencyLogInput): void {
    if (this.#writing) return;
    this.#writing = true;
    try {
      const line = `${JSON.stringify({
        timestamp: sanitizeText(input.timestamp, 128),
        level: "ERROR",
        component: sanitizeText(input.component, 256),
        event: sanitizeText(input.event, 256),
        referenceId: sanitizeText(input.referenceId, 256),
        message: sanitizeText(input.message, 4_096),
        originalException: sanitizeException(input.originalException),
        loggerException: sanitizeException(input.loggerException),
        emergency: true
      })}\n`;
      try {
        this.#appendFile(this.#filePath, line);
      }
      // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
      catch {
        try { this.#writeStderr(line); }
        // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
        catch { /* No further safe sink exists. */ }
      }
    }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch {
      const fallback = `${JSON.stringify({
        timestamp: sanitizeText(input.timestamp, 128),
        level: "ERROR",
        component: "diagnostics",
        event: "emergency-log.failed",
        referenceId: sanitizeText(input.referenceId, 256),
        message: "The emergency diagnostic record could not be encoded.",
        emergency: true
      })}\n`;
      try { this.#writeStderr(fallback); }
      // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
      catch { /* No further safe sink exists. */ }
    } finally {
      this.#writing = false;
    }
  }
}

function appendEmergencyFile(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, data, { encoding: "utf8", flag: "a", mode: 0o600 });
}

function sanitizeException(value: unknown): SerializedException {
  try {
    return sanitizeExceptionNode(serializeException(value));
  }
  // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
  catch {
    return {
      type: "UnserializableException",
      message: "Exception detail was unavailable to the emergency logger.",
      stack: null,
      code: null,
      cause: null,
      thrownValue: null
    };
  }
}

function sanitizeExceptionNode(value: SerializedException): SerializedException {
  return {
    type: sanitizeText(value.type, 256),
    message: sanitizeText(value.message, 4_096),
    stack: value.stack === null ? null : sanitizeText(value.stack, 8_192),
    code: value.code === null ? null : sanitizeText(value.code, 256),
    cause: value.cause === null ? null : sanitizeExceptionNode(value.cause),
    ...(value.secondary === undefined ? {} : {
      secondary: value.secondary.slice(0, 4).map(sanitizeExceptionNode)
    }),
    thrownValue: value.thrownValue === null ? null : sanitizeText(value.thrownValue, 4_096)
  };
}

function sanitizeText(value: string, limit: number): string {
  let normalized: string;
  try { normalized = emergencyRedactor.redactText(value); }
  // error-provenance: allow expected -- omit unsafe text if even independent redaction fails
  catch { normalized = "[REDACTED]"; }
  if (normalized.length <= limit) return normalized;
  const marker = "…[truncated]";
  return `${normalized.slice(0, limit - marker.length)}${marker}`;
}
