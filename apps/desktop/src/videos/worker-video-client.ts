import { desktopVideoCommandSchema, desktopVideoEventSchema, type DesktopVideoCommand, type DesktopVideoEvent, type DesktopVideoTransport } from "@stream-jams/core/videos";
import type { WorkerMessage } from "../desktop-ipc.js";
import { videoWorkerEventSchema } from "./video-ipc.js";

/**
 * The local service's side of the private Videos transport. The main-process player host
 * is available only after it answers this client's lease; losing the main process or
 * disposing the client makes it unavailable again.
 */
export class WorkerVideoClient implements DesktopVideoTransport {
  readonly #listeners = new Set<(event: DesktopVideoEvent) => void>();
  #lease: ReturnType<typeof setInterval> | undefined;
  #available = false;
  #closed = false;

  constructor(private readonly generation: number, private readonly post: (message: WorkerMessage) => void) {}

  get available(): boolean { return this.#available && !this.#closed; }

  /** Starts leasing the player host once the service is ready; the first lease makes it announce itself. */
  start(): void {
    if (this.#closed || this.#lease !== undefined) return;
    this.#sendLease();
    this.#lease = setInterval(() => this.#sendLease(), 2000);
  }

  send(candidate: DesktopVideoCommand): void {
    if (this.#closed) return;
    const command = desktopVideoCommandSchema.parse(candidate);
    this.post({ type: "video-command", generation: this.generation, requestId: null, command });
  }

  subscribe(listener: (event: DesktopVideoEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  }

  receive(candidate: unknown): void {
    const parsed = videoWorkerEventSchema.safeParse(candidate);
    if (this.#closed || !parsed.success || parsed.data.generation !== this.generation) return;
    const event = desktopVideoEventSchema.parse(parsed.data.event) as DesktopVideoEvent;
    if (event.type === "status") this.#available = event.available;
    this.#emit(event);
  }

  dispose(): void {
    if (this.#closed) return;
    const wasAvailable = this.#available;
    this.#available = false;
    clearInterval(this.#lease);
    if (wasAvailable) this.#emit({ type: "status", available: false });
    this.#closed = true;
    this.#listeners.clear();
  }

  #sendLease(): void {
    try { this.post({ type: "video-lease", generation: this.generation, requestId: null }); }
    // error-provenance: allow cleanup -- a lost parent port ends the transport; the host silences itself on lease expiry
    catch { this.dispose(); }
  }

  #emit(event: DesktopVideoEvent): void {
    for (const listener of [...this.#listeners]) {
      try { listener(event); }
      // error-provenance: allow expected -- one failing subscriber must not stop the others; the director logs its own failures
      catch { /* Continue delivering. */ }
    }
  }
}
