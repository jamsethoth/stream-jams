import { randomUUID } from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import { isAbsolute } from "node:path";
import { performance } from "node:perf_hooks";

const phases = new Set([
  "app-ready", "quit-requested", "decision-accepted", "decision-cancelled",
  "service-stop-requested", "service-stop-completed", "service-stop-failed",
  "audio-close-requested", "audio-closed", "windows-destroy-requested", "windows-destroyed",
  "electron-quit-requested", "electron-before-quit", "electron-will-quit", "electron-quit",
  "query-session-end", "session-end"
]);

/** Opt-in, best-effort evidence. A quit event is never proof of native exit. */
export class ShutdownLog {
  #stream: WriteStream | undefined;
  #closed = false;
  #bytes = 0;
  #sequence = 0;
  #attempt = 0;
  readonly #launchId = randomUUID();
  readonly #started = performance.now();

  constructor(path?: string) {
    if (path === undefined || !isAbsolute(path)) return;
    try {
      this.#stream = createWriteStream(path, { flags: "wx", mode: 0o600 });
      this.#stream.on("error", () => { this.#closed = true; this.#stream = undefined; });
    } catch { this.#closed = true; }
  }

  record(phase: unknown): void {
    if (this.#stream === undefined || this.#closed || typeof phase !== "string" || !phases.has(phase)) return;
    if (phase === "quit-requested") this.#attempt++;
    const line = JSON.stringify({
      version: 1, launchId: this.#launchId, pid: process.pid, attempt: this.#attempt,
      sequence: this.#sequence + 1, utc: new Date().toISOString(),
      elapsedMs: Math.round((performance.now() - this.#started) * 1000) / 1000, phase
    }) + "\n";
    const bytes = Buffer.byteLength(line);
    if (this.#sequence >= 256 || this.#bytes + bytes > 64 * 1024) { this.close(); return; }
    this.#bytes += bytes; // Includes queued writes, not just bytes already on disk.
    this.#sequence++;
    try { this.#stream.write(line); }
    catch { this.#stream.destroy(); this.#closed = true; }
    if (this.#sequence === 256) this.close();
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#stream?.end(); // Never await disk completion on the native teardown path.
  }
}
