import { randomUUID } from "node:crypto";
import { desktopOverlayStatusSchema, desktopVisualCommandSchema, maxDesktopVisualTransferBytes, type DesktopModuleSync, type DesktopOverlayDiagnostic, type DesktopOverlayStatus, type SelectedDesktopDisplay, type DesktopOverlayTransport, type DesktopVisualBatch, type DesktopVisualCommand, type DesktopVisualReply, type PlaybackTimingDiagnostics, type SurfaceConfiguration, type VisualRecipientKey } from "@stream-jams/core";
import { overlayRendererReplySchema, type OverlayRendererRequest } from "./overlay-ipc.js";
import type { DesktopDiagnosticInput } from "../desktop-diagnostics.js";

type Configuration = Extract<SurfaceConfiguration, { kind: "desktop" }>;
type RendererFailure = Pick<DesktopOverlayDiagnostic, "kind" | "reason" | "exitCode"> & { readonly operation?: DesktopOverlayDiagnostic["operation"] };
export interface OverlayRendererCallbacks { onReply(candidate: unknown): void; onDestroyed(failure?: RendererFailure): void; onUnavailable(failure?: RendererFailure): void }
export interface OverlayRendererPort { load(): Promise<void>; send(request: OverlayRendererRequest): void; destroy(): void }
type Occurrence = { key: VisualRecipientKey; endsAt: number; durationMs: number; deferredStart: boolean; bytes: number; state: "preparing" | "prepared" | "started" | "stopping"; timer: ReturnType<typeof setTimeout> };
type Pending = { resolve(reply: DesktopVisualReply): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; key: string | null; record: Occurrence | undefined; expected: DesktopVisualReply["type"] };

/** The main process owns the final visual lifetime boundary. Interrupted media is never replayed. */
export class OverlayHost implements DesktopOverlayTransport {
  #config: Configuration = { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null, displayLabel: null, autoFollowDisplayName: false, opacity: 1, layers: [] };
  #port: OverlayRendererPort | null = null;
  #generation = 0;
  #ready: Promise<void> | null = null;
  #loaded = false;
  #cancelLoad: (() => void) | null = null;
  #owned = false;
  #failures = 0;
  #retryAt = 0;
  #cooldown: Promise<void> | null = null;
  #cancelCooldown: (() => void) | null = null;
  #diagnostic: DesktopOverlayDiagnostic | null = null;
  #leaseAt = 0;
  #leaseTimer: ReturnType<typeof setInterval> | undefined;
  #pending = new Map<string, Pending>();
  #occurrences = new Map<string, Occurrence>();
  #stops = new Map<string, Promise<void>>();
  #moduleSyncs = new Map<string, DesktopModuleSync>();
  #bytes = 0;

  constructor(
    private readonly createRenderer: (config: Configuration, callbacks: OverlayRendererCallbacks) => OverlayRendererPort | null,
    private readonly capabilities: () => { available: boolean; displays: SelectedDesktopDisplay[] } = () => ({ available: false, displays: [] }),
    private readonly diagnose?: (input: DesktopDiagnosticInput) => void
  ) {}

  async getStatus(): Promise<DesktopOverlayStatus> {
    let available: boolean; let displays: SelectedDesktopDisplay[];
    try {
      const capabilities = this.capabilities();
      available = desktopOverlayStatusSchema.shape.available.parse(capabilities.available);
      displays = desktopOverlayStatusSchema.shape.displays.parse(capabilities.displays);
    }
    // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
    catch { return { available: false, displays: [], state: "unavailable", message: "Desktop displays could not be inspected. Restart the desktop application and try again." }; }
    if (!available) return { available, displays, state: "unavailable", message: "Desktop output requires the Windows desktop application.", diagnostic: this.#diagnostic };
    if (!this.#owned) return { available, displays, state: "unavailable", message: "The desktop service is disconnected. Restart the service to restore desktop output.", diagnostic: this.#diagnostic };
    if (!this.#config.enabled) return { available, displays, state: "disabled", message: null, diagnostic: this.#diagnostic };
    if (!displays.some(display => display.id === this.#config.displayId)) return { available, displays, state: "unavailable", message: "The selected display is unavailable. Select a connected display and save the desktop settings.", diagnostic: this.#diagnostic };
    if (Date.now() < this.#retryAt) return { available, displays, state: "failed", message: "Desktop output is recovering automatically. Future alerts will wait briefly; Retry can restore it immediately.", diagnostic: this.#diagnostic };
    return { available, displays, state: "ready", message: null, diagnostic: this.#diagnostic };
  }

  beginOwnership(): void {
    this.serviceLost();
    this.#owned = true;
    this.#failures = 0; this.#retryAt = 0;
    this.#config = { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null, displayLabel: null, autoFollowDisplayName: false, opacity: 1, layers: [] };
    this.#startLease();
  }
  refreshLease(): void {
    if (!this.#owned) {
      this.#owned = true;
      this.#startLease();
      return;
    }
    this.#leaseAt = Date.now();
  }
  serviceLost(): void {
    this.#owned = false;
    clearInterval(this.#leaseTimer);
    this.#discard(false);
    this.#moduleSyncs.clear();
  }
  async handle(candidate: DesktopVisualCommand): Promise<DesktopVisualReply> {
    const command = desktopVisualCommandSchema.parse(candidate);
    switch (command.type) {
      case "status": return { type: "status", status: await this.getStatus() };
      case "configure": return this.configure(command.config as Configuration).then(ok);
      case "prepare": {
        const key = command.batch.key;
        return this.prepare(command.batch).then(result => ({ type: result === "ready" ? "ready" : "error", key }));
      }
      case "sync-module": return this.syncModule(command).then(ok);
      case "start": return this.start(command.key, command.timing).then(diagnostics => ({ type: "complete", key: command.key, ...(diagnostics === undefined ? {} : { diagnostics }) }));
      case "stop": return this.stop(command.key).then(ok);
      case "retry": return this.retry().then(ok);
      case "close": return this.close().then(ok);
    }
  }
  async configure(candidate: Configuration): Promise<void> {
    const command = desktopVisualCommandSchema.parse({ type: "configure", config: candidate });
    if (command.type !== "configure" || command.config.kind !== "desktop") throw unavailable();
    const previous = this.#config;
    this.#config = command.config;
    if (!this.#config.enabled || this.#config.displayId !== previous.displayId) { this.#discard(false); this.#moduleSyncs.clear(); return; }
    if (this.#port !== null) {
      await this.#ensure();
      await this.#request({ type: "configure", config: this.#config }, 2000);
    }
  }
  async syncModule(candidate: DesktopModuleSync): Promise<void> {
    const command = desktopVisualCommandSchema.parse({ type: "sync-module", ...candidate });
    if (command.type !== "sync-module") throw unavailable();
    const current = this.#moduleSyncs.get(command.moduleId);
    if (current !== undefined && command.revision <= current.revision) return;
    if (command.presentation !== null && (!this.#owned || !this.#config.enabled || this.#config.displayId === null)) throw unavailable();
    // Cache desired state before any acknowledgement can race with a newer clear.
    this.#moduleSyncs.set(command.moduleId, command);
    if (command.presentation === null) {
      if (this.#loaded) await this.#request(command, 5000);
      return;
    }
    await this.#ensure(command);
    if (this.#moduleSyncs.get(command.moduleId) !== command) return;
    await this.#request(command, 5000);
  }
  async prepare(candidate: DesktopVisualBatch): Promise<"ready" | "unavailable"> {
    const command = desktopVisualCommandSchema.parse({ type: "prepare", batch: candidate });
    if (command.type !== "prepare") return Promise.resolve("unavailable");
    return this.#prepare(command.batch);
  }
  async #prepare(payload: DesktopVisualBatch | undefined): Promise<"ready" | "unavailable"> {
    if (payload === undefined) return "unavailable";
    const id = identity(payload.key);
    const bytes = payload.assets.reduce((sum, asset) => sum + asset.bytes.byteLength, 0);
    if (!this.#owned || !this.#config.enabled || this.#config.displayId === null || Date.now() >= payload.timing.endsAtEpochMs || this.#occurrences.has(id) || this.#occurrences.size >= 64 || this.#bytes + bytes > maxDesktopVisualTransferBytes) return "unavailable";
    const record: Occurrence = { key: payload.key, durationMs: payload.timing.endsAtEpochMs - payload.timing.startsAtEpochMs, deferredStart: payload.deferredStart === true, endsAt: payload.timing.endsAtEpochMs, bytes, state: "preparing", timer: setTimeout(() => this.#expireOccurrence(id, record), payload.deferredStart === true ? 15000 : payload.timing.endsAtEpochMs + 5000 - Date.now()) };
    this.#occurrences.set(id, record); this.#bytes += bytes;
    try {
      await this.#ensure();
      if (this.#occurrences.get(id) !== record || record.state !== "preparing" || Date.now() >= record.endsAt) return "unavailable";
      const pending = this.#request({ type: "prepare", batch: payload }, Math.min(5000, record.endsAt + 5000 - Date.now()));
      payload = undefined;
      const result = await pending;
      if (result.type !== "ready" || this.#occurrences.get(id) !== record || record.state !== "preparing" || Date.now() >= record.endsAt) return "unavailable";
      record.state = "prepared";
      return "ready";
    }
    catch (error) {
      this.diagnose?.({ component: "overlay-renderer", source: "desktop.overlay.prepare-failed", message: "Desktop overlay media preparation failed.", exception: error });
      return "unavailable";
    }
    finally { if (record.state !== "prepared" && record.state !== "stopping") this.#release(id, record); }
  }
  async start(key: VisualRecipientKey, timing?: DesktopVisualBatch["timing"]): Promise<void | PlaybackTimingDiagnostics> {
    const command = desktopVisualCommandSchema.parse({ type: "start", key, ...(timing === undefined ? {} : { timing }) });
    const id = identity(key); const record = this.#occurrences.get(id);
    if (record === undefined || record.state !== "prepared") throw unavailable();
    if (Date.now() >= record.endsAt) { this.#release(id, record); throw unavailable(); }
    if (record.deferredStart) {
      if (timing === undefined || timing.endsAtEpochMs - timing.startsAtEpochMs !== record.durationMs) throw unavailable();
      record.endsAt = timing.endsAtEpochMs;
      clearTimeout(record.timer);
      record.timer = setTimeout(() => this.#expireOccurrence(id, record), Math.max(1, record.endsAt + 5000 - Date.now()));
    } else if (timing !== undefined) throw unavailable();
    record.state = "started";
    try { const reply = await this.#request(command, Math.max(1, record.endsAt + 5000 - Date.now())); return reply.type === "complete" ? reply.diagnostics : undefined; }
    finally { if (this.#occurrences.get(id)?.state !== "stopping") this.#release(id, record); }
  }
  stop(key: VisualRecipientKey): Promise<void> {
    desktopVisualCommandSchema.parse({ type: "stop", key });
    const id = identity(key); const existing = this.#stops.get(id);
    if (existing !== undefined) return existing;
    const record = this.#occurrences.get(id);
    if (record === undefined) return Promise.resolve();
    record.state = "stopping";
    if (!this.#loaded) { this.#discard(false); return Promise.resolve(); }
    const stopped = (async () => {
      try { await this.#request({ type: "stop", key }, 2000); }
      // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
      catch { /* Request failure already destroys the renderer. */ }
      finally {
        this.#release(id, record);
        for (const [requestId, pending] of this.#pending) {
          if (pending.record === record) { clearTimeout(pending.timer); this.#pending.delete(requestId); pending.reject(unavailable()); }
        }
      }
    })();
    this.#stops.set(id, stopped);
    void stopped.finally(() => { if (this.#stops.get(id) === stopped) this.#stops.delete(id); });
    return stopped;
  }
  async retry(): Promise<void> {
    if (!this.#owned) throw unavailable();
    this.#discard(false); this.#failures = 0; this.#retryAt = 0;
    await this.#ensure();
    this.#diagnostic = null;
  }
  async close(): Promise<void> { this.serviceLost(); }

  #startLease(): void {
    this.#leaseAt = Date.now();
    clearInterval(this.#leaseTimer);
    this.#leaseTimer = setInterval(() => {
      if (Date.now() - this.#leaseAt < 10_000) return;
      this.#recordDiagnostic({ kind: "service-lease-expired", operation: null, reason: "lease-missed-for-10000ms", exitCode: null });
      this.serviceLost();
    }, 1000);
  }

  async #ensure(pendingSync?: DesktopModuleSync): Promise<void> {
    if (!this.#owned || !this.#config.enabled || this.#config.displayId === null) throw unavailable();
    if (Date.now() < this.#retryAt) await this.#waitForRecovery();
    if (!this.#owned || !this.#config.enabled || this.#config.displayId === null) throw unavailable();
    if (this.#ready !== null) return this.#ready;
    const generation = ++this.#generation;
    const port = this.createRenderer(this.#config, {
      onReply: candidate => this.#receive(candidate, generation),
      onDestroyed: failure => {
        if (generation === this.#generation) this.#discard(true, failure ?? { kind: "renderer-window-closed", operation: null, reason: "window-closed", exitCode: null });
      },
      onUnavailable: failure => {
        if (generation !== this.#generation) return;
        const diagnostic = failure ?? { kind: "display-unavailable", operation: null, reason: "selected-display-missing", exitCode: null };
        this.#discard(diagnostic.kind !== "display-unavailable", diagnostic);
      }
    });
    if (port === null) throw unavailable();
    this.#port = port;
    this.#ready = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let loadTimedOut = false;
      try {
        await Promise.race([Promise.resolve().then(() => port.load()), new Promise<never>((_, reject) => {
          this.#cancelLoad = () => reject(unavailable());
          timer = setTimeout(() => { loadTimedOut = true; reject(unavailable()); }, 5000);
        })]);
        if (generation !== this.#generation || port !== this.#port) throw unavailable();
        this.#loaded = true;
        await this.#request({ type: "configure", config: this.#config }, 2000);
        for (const sync of this.#moduleSyncs.values()) {
          if (sync !== pendingSync && sync.presentation !== null) await this.#request({ type: "sync-module", ...sync }, 5000);
        }
      } catch (error) {
        if (generation === this.#generation) this.#discard(true, {
          kind: loadTimedOut ? "renderer-load-timeout" : "renderer-load-failed",
          operation: null,
          reason: loadTimedOut ? "load-timeout-after-5000ms" : safeReason(error, "renderer-load-failed"),
          exitCode: null
        });
        throw unavailable();
      } finally { clearTimeout(timer); if (generation === this.#generation) this.#cancelLoad = null; }
    })();
    return this.#ready;
  }
  #request(command: DesktopVisualCommand, timeoutMs: number): Promise<DesktopVisualReply> {
    if (!this.#owned || this.#port === null || this.#pending.size >= 64) { this.#discard(false); return Promise.reject(unavailable()); }
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const key = command.type === "prepare" ? identity(command.batch.key) : "key" in command ? identity(command.key) : null;
      this.#pending.set(requestId, { resolve, reject, key, record: key === null ? undefined : this.#occurrences.get(key), expected: command.type === "prepare" ? "ready" : command.type === "start" ? "complete" : "ok", timer: setTimeout(() => this.#discard(true, {
        kind: "renderer-command-timeout", operation: command.type, reason: `timeout-after-${Math.max(1, timeoutMs)}ms`, exitCode: null
      }), Math.max(1, timeoutMs)) });
      try { this.#port!.send({ generation: this.#generation, requestId, command }); }
      // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
      catch { this.#discard(true); }
    });
  }
  #receive(candidate: unknown, generation: number): void {
    if (generation !== this.#generation || this.#port === null) return;
    const parsed = overlayRendererReplySchema.safeParse(candidate);
    if (!parsed.success || parsed.data.generation !== generation) return;
    const pending = this.#pending.get(parsed.data.requestId);
    if (pending === undefined) return;
    const result = parsed.data.result;
    if (result === null) { this.#discard(true); return; }
    if ("key" in result && identity(result.key) !== pending.key) return;
    if (result.type !== pending.expected && result.type !== "error") return;
    this.#pending.delete(parsed.data.requestId); clearTimeout(pending.timer);
    if (result.type === "error") {
      const failure = parsed.data.failure;
      pending.reject(failure === undefined ? unavailable() : new Error(`Desktop media playback failed during ${failure.stage}.`, { cause: failure }));
    } else pending.resolve(result);
  }
  #release(id: string, record: Occurrence): void {
    if (this.#occurrences.get(id) !== record) return;
    clearTimeout(record.timer); this.#occurrences.delete(id); this.#bytes -= record.bytes;
  }
  #expireOccurrence(id: string, record: Occurrence): void {
    if (this.#occurrences.get(id) !== record) return;
    // A request timer owns failure classification when both deadlines coincide.
    if ([...this.#pending.values()].some(pending => pending.record === record)) return;
    this.#release(id, record);
  }
  async #waitForRecovery(): Promise<void> {
    if (Date.now() >= this.#retryAt) return;
    const generation = this.#generation;
    if (this.#cooldown === null) {
      this.#cooldown = new Promise<void>(resolve => {
        const timer = setTimeout(() => {
          this.#cooldown = null; this.#cancelCooldown = null; resolve();
        }, this.#retryAt - Date.now());
        this.#cancelCooldown = () => { clearTimeout(timer); resolve(); };
      });
    }
    await this.#cooldown;
    if (generation !== this.#generation) throw unavailable();
  }
  #discard(failed: boolean, diagnostic?: RendererFailure): void {
    const port = this.#port;
    this.#cancelCooldown?.(); this.#cancelCooldown = null; this.#cooldown = null;
    this.#port = null; this.#ready = null; this.#loaded = false; this.#generation++;
    // Invalidate callbacks, then destroy before settling any caller obligation.
    port?.destroy();
    if (failed && port !== null) {
      this.#failures++;
      this.#retryAt = Date.now() + (this.#failures === 1 ? 0 : Math.min(5000, 1000 * 2 ** Math.min(3, this.#failures - 2)));
    }
    if (diagnostic !== undefined) this.#recordDiagnostic(diagnostic);
    this.#cancelLoad?.(); this.#cancelLoad = null;
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(unavailable()); }
    this.#pending.clear();
    for (const [id, record] of this.#occurrences) this.#release(id, record);
    this.#stops.clear();
  }
  #recordDiagnostic(failure: RendererFailure): void {
    this.#diagnostic = {
      kind: failure.kind,
      operation: failure.operation ?? null,
      reason: failure.reason.slice(0, 256),
      exitCode: failure.exitCode,
      occurredAt: new Date().toISOString(),
      consecutiveFailures: this.#failures
    };
  }
}
function identity(key: VisualRecipientKey): string { return JSON.stringify([key.surfaceId, key.moduleId, key.occurrenceId, key.generation]); }
function unavailable(cause?: unknown): Error {
  return new Error("Desktop overlay is unavailable. Future requests recover automatically; Retry can restore it immediately.", cause === undefined ? undefined : { cause });
}
function ok(): DesktopVisualReply { return { type: "ok" }; }
function safeReason(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || error.message.trim() === "") return fallback;
  return `${error.name}:${error.message}`.slice(0, 256);
}
