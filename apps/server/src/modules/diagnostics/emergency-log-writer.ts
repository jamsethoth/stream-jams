import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serializeException, type SerializedException } from "@stream-jams/core";

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
    let line = "";
    try {
      line = `${JSON.stringify({
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
      } catch {
        try { this.#writeStderr(line); } catch { /* No further safe sink exists. */ }
      }
    } catch {
      const fallback = `${JSON.stringify({
        timestamp: sanitizeText(input.timestamp, 128),
        level: "ERROR",
        component: "diagnostics",
        event: "emergency-log.failed",
        referenceId: sanitizeText(input.referenceId, 256),
        message: "The emergency diagnostic record could not be encoded.",
        emergency: true
      })}\n`;
      try { this.#writeStderr(fallback); } catch { /* No further safe sink exists. */ }
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
  } catch {
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
    thrownValue: value.thrownValue === null ? null : sanitizeText(value.thrownValue, 4_096)
  };
}

function sanitizeText(value: string, limit: number): string {
  const normalized = value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, (_match, scheme: string) => `${scheme} [REDACTED]`)
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/ovl_[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/([?&](?:access_token|refresh_token|token|api_key|apikey|key|signature|sig|x-amz-signature|x-amz-credential|x-amz-security-token|key-pair-id)=)[^&\s]+/gi, "$1[REDACTED]");
  if (normalized.length <= limit) return normalized;
  const marker = "…[truncated]";
  return `${normalized.slice(0, limit - marker.length)}${marker}`;
}
