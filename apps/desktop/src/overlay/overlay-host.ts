import { randomUUID } from "node:crypto";
import { desktopOverlayStatusSchema, desktopVisualCommandSchema, maxDesktopVisualTransferBytes, type DesktopOverlayStatus, type SelectedDesktopDisplay, type DesktopOverlayTransport, type DesktopVisualBatch, type DesktopVisualCommand, type DesktopVisualReply, type SurfaceConfiguration, type VisualRecipientKey } from "@stream-jams/core";
import { overlayRendererReplySchema, type OverlayRendererRequest } from "./overlay-ipc.js";

type Configuration = Extract<SurfaceConfiguration, { kind: "desktop" }>;
export interface OverlayRendererCallbacks { onReply(candidate: unknown): void; onDestroyed(): void; onUnavailable(): void }
export interface OverlayRendererPort { load(): Promise<void>; send(request: OverlayRendererRequest): void; destroy(): void }
type Occurrence = { key: VisualRecipientKey; endsAt: number; bytes: number; state: "preparing" | "prepared" | "started" | "stopping"; timer: ReturnType<typeof setTimeout> };
type Pending = { resolve(reply: DesktopVisualReply): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; key: string | null; record: Occurrence | undefined; expected: DesktopVisualReply["type"] };

/** The main process owns the final visual lifetime boundary. Interrupted media is never replayed. */
export class OverlayHost implements DesktopOverlayTransport {
  #config: Configuration = { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null, opacity: 1, layers: [] };
  #port: OverlayRendererPort | null = null;
  #generation = 0;
  #ready: Promise<void> | null = null;
  #loaded = false;
  #cancelLoad: (() => void) | null = null;
  #owned = false;
  #failures = 0;
  #leaseAt = 0;
  #leaseTimer: ReturnType<typeof setInterval> | undefined;
  #pending = new Map<string, Pending>();
  #occurrences = new Map<string, Occurrence>();
  #stops = new Map<string, Promise<void>>();
  #bytes = 0;

  constructor(
    private readonly createRenderer: (config: Configuration, callbacks: OverlayRendererCallbacks) => OverlayRendererPort | null,
    private readonly capabilities: () => { available: boolean; displays: SelectedDesktopDisplay[] } = () => ({ available: false, displays: [] })
  ) {}

  async getStatus(): Promise<DesktopOverlayStatus> {
    let available: boolean; let displays: SelectedDesktopDisplay[];
    try {
      const capabilities = this.capabilities();
      available = desktopOverlayStatusSchema.shape.available.parse(capabilities.available);
      displays = desktopOverlayStatusSchema.shape.displays.parse(capabilities.displays);
    } catch { return { available: false, displays: [], state: "unavailable", message: "Desktop displays could not be inspected. Restart the desktop application and try again." }; }
    if (!available) return { available, displays, state: "unavailable", message: "Desktop output requires the Windows desktop application." };
    if (!this.#owned) return { available, displays, state: "unavailable", message: "The desktop service is disconnected. Restart the service to restore desktop output." };
    if (!this.#config.enabled) return { available, displays, state: "disabled", message: null };
    if (!displays.some(display => display.id === this.#config.displayId)) return { available, displays, state: "unavailable", message: "The selected display is unavailable. Select a connected display and save the desktop settings." };
    if (this.#failures > 1) return { available, displays, state: "failed", message: "Desktop output failed repeatedly. Use Retry to restore it for future alerts." };
    return { available, displays, state: "ready", message: null };
  }

  beginOwnership(): void {
    this.serviceLost();
    this.#owned = true;
    this.#failures = 0;
    this.#config = { id: "desktop:primary", kind: "desktop", enabled: false, displayId: null, opacity: 1, layers: [] };
    this.refreshLease();
    this.#leaseTimer = setInterval(() => { if (Date.now() - this.#leaseAt >= 10_000) this.serviceLost(); }, 1000);
  }
  refreshLease(): void { if (this.#owned) this.#leaseAt = Date.now(); }
  serviceLost(): void {
    this.#owned = false;
    clearInterval(this.#leaseTimer);
    this.#discard(false);
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
      case "start": return this.start(command.key).then(() => ({ type: "complete", key: command.key }));
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
    if (!this.#config.enabled || this.#config.displayId !== previous.displayId) { this.#discard(false); return; }
    if (this.#port !== null) {
      await this.#ensure();
      await this.#request({ type: "configure", config: this.#config }, 2000);
    }
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
    const record: Occurrence = { key: payload.key, endsAt: payload.timing.endsAtEpochMs, bytes, state: "preparing", timer: setTimeout(() => this.#discard(true), payload.timing.endsAtEpochMs + 5000 - Date.now()) };
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
    } catch { return "unavailable"; }
    finally { if (record.state !== "prepared" && record.state !== "stopping") this.#release(id, record); }
  }
  async start(key: VisualRecipientKey): Promise<void> {
    desktopVisualCommandSchema.parse({ type: "start", key });
    const id = identity(key); const record = this.#occurrences.get(id);
    if (record === undefined || record.state !== "prepared") throw unavailable();
    if (Date.now() >= record.endsAt) { this.#release(id, record); throw unavailable(); }
    record.state = "started";
    try { await this.#request({ type: "start", key }, record.endsAt + 5000 - Date.now()); }
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
    this.#discard(false); this.#failures = 0;
    await this.#ensure();
  }
  async close(): Promise<void> { this.serviceLost(); }

  async #ensure(): Promise<void> {
    if (!this.#owned || !this.#config.enabled || this.#config.displayId === null || this.#failures > 1) throw unavailable();
    if (this.#ready !== null) return this.#ready;
    const generation = ++this.#generation;
    const port = this.createRenderer(this.#config, {
      onReply: candidate => this.#receive(candidate, generation),
      onDestroyed: () => { if (generation === this.#generation) this.#discard(true); },
      onUnavailable: () => { if (generation === this.#generation) this.#discard(false); }
    });
    if (port === null) throw unavailable();
    this.#port = port;
    this.#ready = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([Promise.resolve().then(() => port.load()), new Promise<never>((_, reject) => {
          this.#cancelLoad = () => reject(unavailable());
          timer = setTimeout(() => reject(unavailable()), 5000);
        })]);
        if (generation !== this.#generation || port !== this.#port) throw unavailable();
        this.#loaded = true;
        await this.#request({ type: "configure", config: this.#config }, 2000);
      } catch {
        if (generation === this.#generation) this.#discard(true);
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
      this.#pending.set(requestId, { resolve, reject, key, record: key === null ? undefined : this.#occurrences.get(key), expected: command.type === "prepare" ? "ready" : command.type === "start" ? "complete" : "ok", timer: setTimeout(() => this.#discard(true), Math.max(1, timeoutMs)) });
      try { this.#port!.send({ generation: this.#generation, requestId, command }); }
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
    if (result.type === "error") pending.reject(unavailable()); else pending.resolve(result);
  }
  #release(id: string, record: Occurrence): void {
    if (this.#occurrences.get(id) !== record) return;
    clearTimeout(record.timer); this.#occurrences.delete(id); this.#bytes -= record.bytes;
  }
  #discard(failed: boolean): void {
    const port = this.#port;
    this.#port = null; this.#ready = null; this.#loaded = false; this.#generation++;
    // Invalidate callbacks, then destroy before settling any caller obligation.
    port?.destroy();
    if (failed && port !== null) this.#failures++;
    this.#cancelLoad?.(); this.#cancelLoad = null;
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(unavailable()); }
    this.#pending.clear();
    for (const [id, record] of this.#occurrences) this.#release(id, record);
    this.#stops.clear();
  }
}
function identity(key: VisualRecipientKey): string { return JSON.stringify([key.surfaceId, key.moduleId, key.occurrenceId, key.generation]); }
function unavailable(): Error { return new Error("Desktop overlay is unavailable. Retry explicitly if automatic recovery is exhausted."); }
function ok(): DesktopVisualReply { return { type: "ok" }; }
