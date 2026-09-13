import { randomUUID } from "node:crypto";
import {
  desktopVisualCommandSchema, maxDesktopVisualTransferBytes, type DesktopVisualBatch, type DesktopVisualCommand, type DesktopVisualReply,
  type DesktopOverlayTransport, type DesktopOverlayStatus, type SurfaceConfiguration, type VisualRecipientKey
} from "@stream-jams/core";
import { overlayWorkerResponseSchema, type OverlayWorkerMessage } from "./overlay-ipc.js";

type Pending = { key: VisualRecipientKey | null; resolve(result: DesktopVisualReply): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
type Occurrence = { deadline: number; bytes: number; phase: "preparing" | "ready" | "started" | "cancelled"; timer: ReturnType<typeof setTimeout> };

/** Worker-side requests own no media renderer or credentials. Host watchdogs remain authoritative. */
export class WorkerOverlayClient implements DesktopOverlayTransport {
  #closed = false;
  readonly #pending = new Map<string, Pending>();
  readonly #occurrences = new Map<string, Occurrence>();
  readonly #stops = new Map<string, Promise<void>>();
  #reservedBytes = 0;
  readonly #lease: ReturnType<typeof setInterval>;

  constructor(private readonly generation: number, private readonly send: (message: OverlayWorkerMessage) => void) {
    if (!Number.isSafeInteger(generation) || generation <= 0) throw new Error("Invalid worker generation");
    this.#lease = setInterval(() => {
      try { this.send({ type: "overlay-lease", generation, requestId: null }); }
      catch { this.dispose(); }
    }, 2000);
  }

  receive(candidate: unknown): void {
    if (this.#closed) return;
    const parsed = overlayWorkerResponseSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.generation !== this.generation) return;
    const pending = this.#pending.get(parsed.data.requestId);
    if (pending === undefined) return;
    const result = parsed.data.result;
    const expected = pending.key;
    if (result !== null && "key" in result && (expected === null || keyId(result.key) !== keyId(expected))) return;
    this.#pending.delete(parsed.data.requestId);
    clearTimeout(pending.timer);
    if (result === null || result.type === "error") pending.reject(unavailable());
    else pending.resolve(result);
  }

  async configure(config: Extract<SurfaceConfiguration, { kind: "desktop" }>): Promise<void> {
    await this.#ok({ type: "configure", config });
  }

  async getStatus(): Promise<DesktopOverlayStatus> {
    const result = await this.#request({ type: "status" }, 5000);
    if (result.type !== "status") throw unavailable();
    return result.status;
  }

  async prepare(batch: DesktopVisualBatch): Promise<"ready" | "unavailable"> {
    const command = desktopVisualCommandSchema.parse({ type: "prepare", batch });
    const id = keyId(batch.key);
    const bytes = batch.assets.reduce((total, asset) => total + asset.bytes.byteLength, 0);
    if (this.#closed || this.#occurrences.has(id) || this.#occurrences.size >= 64 || Date.now() >= batch.timing.endsAtEpochMs ||
      bytes > maxDesktopVisualTransferBytes - this.#reservedBytes) return "unavailable";
    const deadline = batch.timing.endsAtEpochMs + 5000;
    const occurrence: Occurrence = { deadline, bytes, phase: "preparing", timer: setTimeout(() => this.#forget(id, occurrence), Math.max(1, deadline - Date.now())) };
    this.#reservedBytes += bytes;
    this.#occurrences.set(id, occurrence);
    try {
      const result = await this.#request(command, Math.min(5000, Math.max(1, deadline - Date.now())));
      if (result.type !== "ready" || this.#occurrences.get(id) !== occurrence || occurrence.phase === "cancelled" || Date.now() >= deadline - 5000) {
        this.#forget(id, occurrence); return "unavailable";
      }
      occurrence.phase = "ready";
      return "ready";
    } catch { if (occurrence.phase !== "cancelled") this.#forget(id, occurrence); return "unavailable"; }
  }

  /** Resolves on completion, not on initial renderer admission. */
  async start(key: VisualRecipientKey): Promise<void> {
    const id = keyId(key);
    const occurrence = this.#occurrences.get(id);
    if (occurrence === undefined || occurrence.phase !== "ready") throw unavailable();
    if (Date.now() >= occurrence.deadline - 5000) { this.#forget(id, occurrence); throw unavailable(); }
    occurrence.phase = "started";
    try {
      const result = await this.#request({ type: "start", key }, Math.max(1, occurrence.deadline - Date.now()));
      if (result.type !== "complete") throw unavailable();
    } finally { if (this.#occurrences.get(id)?.phase !== "cancelled") this.#forget(id, occurrence); }
  }

  stop(key: VisualRecipientKey): Promise<void> {
    const id = keyId(key);
    const existing = this.#stops.get(id);
    if (existing !== undefined) return existing;
    const occurrence = this.#occurrences.get(id);
    if (occurrence !== undefined) occurrence.phase = "cancelled";
    for (const [requestId, pending] of this.#pending) {
      const expected = pending.key;
      if (expected !== null && keyId(expected) === id) {
        clearTimeout(pending.timer);
        this.#pending.delete(requestId);
        pending.reject(unavailable());
      }
    }
    const stopping = (async () => {
      try { if (!this.#closed) await this.#ok({ type: "stop", key }); }
      finally { if (occurrence !== undefined) this.#forget(id, occurrence); }
    })().finally(() => { if (this.#stops.get(id) === stopping) this.#stops.delete(id); });
    this.#stops.set(id, stopping);
    return stopping;
  }

  async retry(): Promise<void> { await this.#ok({ type: "retry" }); }
  async close(): Promise<void> {
    if (this.#closed) return;
    try { await this.#ok({ type: "close" }); } finally { this.dispose(); }
  }
  dispose(): void {
    this.#closed = true;
    clearInterval(this.#lease);
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(unavailable()); }
    this.#pending.clear();
    for (const id of this.#occurrences.keys()) this.#forget(id);
  }

  #forget(id: string, expected?: Occurrence): void {
    const occurrence = this.#occurrences.get(id);
    if (occurrence === undefined || (expected !== undefined && occurrence !== expected)) return;
    clearTimeout(occurrence.timer);
    this.#reservedBytes -= occurrence.bytes;
    this.#occurrences.delete(id);
  }
  async #ok(command: DesktopVisualCommand): Promise<void> {
    if ((await this.#request(command, 5000)).type !== "ok") throw unavailable();
  }
  #request(candidate: DesktopVisualCommand, timeout: number): Promise<DesktopVisualReply> {
    if (this.#closed || this.#pending.size >= 64) return Promise.reject(unavailable());
    const command = desktopVisualCommandSchema.parse(candidate);
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(requestId); reject(unavailable()); }, timeout);
      this.#pending.set(requestId, { key: commandKey(command), resolve, reject, timer });
      try { this.send({ type: "overlay-request", generation: this.generation, requestId, command }); }
      catch { this.dispose(); }
    });
  }
}

function commandKey(command: DesktopVisualCommand): VisualRecipientKey | null {
  return command.type === "prepare" ? command.batch.key : "key" in command ? command.key : null;
}
function keyId(key: VisualRecipientKey): string { return JSON.stringify([key.surfaceId, key.moduleId, key.occurrenceId, key.generation]); }
function unavailable(): Error { return new Error("The owned desktop overlay connection is unavailable."); }
