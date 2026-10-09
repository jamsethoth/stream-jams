import { randomUUID } from "node:crypto";
import { closeSync, openSync, writeSync } from "node:fs";
import { isAbsolute } from "node:path";
import { performance } from "node:perf_hooks";
import { serializeException } from "@stream-jams/core";

const phases = new Set([
  "app-ready", "quit-requested", "decision-accepted", "decision-cancelled",
  "service-stop-requested", "service-stop-completed", "service-stop-failed",
  "audio-close-requested", "audio-closed", "windows-destroy-requested", "windows-destroyed",
  "overlay-close-requested", "overlay-closed",
  "electron-quit-requested", "electron-before-quit", "electron-will-quit", "electron-quit",
  "query-session-end", "session-end"
]);

/**
 * Opt-in, best-effort evidence. A quit event is never proof of native exit.
 * Each record is one small synchronous append so the final phases reach the file before the
 * process exits; queued stream writes were lost when Electron exited right after `quit`.
 * Nothing is flushed to stable storage, and writes stop at the record and byte bounds.
 */
export class ShutdownLog {
  #fd: number | undefined;
  #closed = false;
  #bytes = 0;
  #sequence = 0;
  #attempt = 0;
  readonly #launchId = randomUUID();
  readonly #started = performance.now();

  constructor(path?: string) {
    if (path === undefined || !isAbsolute(path)) return;
    try { this.#fd = openSync(path, "wx", 0o600); }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch { this.#closed = true; }
  }

  record(phase: unknown): void {
    this.#write(phase);
  }

  recordFailure(phase: unknown, error: unknown, referenceId: string): void {
    this.#write(phase, { referenceId, exception: serializeException(error) });
  }

  #write(phase: unknown, failure?: { readonly referenceId: string; readonly exception: ReturnType<typeof serializeException> }): void {
    if (this.#fd === undefined || this.#closed || typeof phase !== "string" || !phases.has(phase)) return;
    if (phase === "quit-requested") this.#attempt++;
    const line = JSON.stringify({
      version: 1, launchId: this.#launchId, pid: process.pid, attempt: this.#attempt,
      sequence: this.#sequence + 1, utc: new Date().toISOString(),
      elapsedMs: Math.round((performance.now() - this.#started) * 1000) / 1000, phase,
      ...(failure === undefined ? {} : failure)
    }) + "\n";
    const bytes = Buffer.byteLength(line);
    if (this.#sequence >= 256 || this.#bytes + bytes > 64 * 1024) { this.close(); return; }
    this.#bytes += bytes;
    this.#sequence++;
    try { writeSync(this.#fd, line); }
    // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
    catch { this.close(); return; }
    if (this.#sequence === 256) this.close();
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    const fd = this.#fd;
    this.#fd = undefined;
    if (fd === undefined) return;
    try { closeSync(fd); }
    // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
    catch { /* The evidence file is best effort. */ }
  }
}
