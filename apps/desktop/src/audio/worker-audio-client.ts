import { randomUUID } from "node:crypto";
import { audioTransportCommandSchema, type AudioPlaybackPayload, type AudioTransportCommand, type AudioTransportResult, type DesktopAudioTransport } from "@stream-jams/core";
import { workerRequestSchema, type WorkerMessage } from "../desktop-ipc.js";

export class WorkerAudioClient implements DesktopAudioTransport {
  #closed = false;
  #pending = new Map<string, { resolve(result: AudioTransportResult): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  #lease: ReturnType<typeof setInterval>;
  constructor(private readonly generation: number, private readonly send: (message: WorkerMessage) => void) {
    this.#lease = setInterval(() => {
      try { send({ type: "audio-lease", generation, requestId: null }); }
      catch { this.dispose(); }
    }, 2000);
  }
  receive(candidate: unknown): void {
    const parsed = workerRequestSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.type !== "audio-response" || parsed.data.generation !== this.generation) return;
    const request = this.#pending.get(parsed.data.requestId);
    if (request === undefined) return;
    this.#pending.delete(parsed.data.requestId);
    clearTimeout(request.timer);
    if (parsed.data.result === null) request.reject(unavailable()); else request.resolve(parsed.data.result);
  }
  async listOutputDevices() {
    const result = await this.#request({ type: "enumerate" });
    if (result.type !== "devices") throw unavailable();
    return result.devices;
  }
  async play(payload: AudioPlaybackPayload) {
    const result = await this.#request({ type: "play", payload });
    if (result.type !== "played") throw unavailable();
    return { failedRouteIds: result.failedRouteIds };
  }
  async stop(playbackId: string): Promise<void> { await this.#ok({ type: "stop", playbackId }); }
  async setMuted(muted: boolean): Promise<void> { await this.#ok({ type: "set-muted", muted }); }
  async testOutput(deviceId: string): Promise<void> { await this.#ok({ type: "test", deviceId }); }
  async retry(): Promise<void> { await this.#ok({ type: "retry" }); }
  async close(): Promise<void> {
    try { await this.#ok({ type: "close" }); } finally { this.dispose(); }
  }
  dispose(): void {
    this.#closed = true;
    clearInterval(this.#lease);
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(unavailable()); }
    this.#pending.clear();
  }
  async #ok(command: AudioTransportCommand): Promise<void> {
    if ((await this.#request(command)).type !== "ok") throw unavailable();
  }
  #request(candidate: AudioTransportCommand): Promise<AudioTransportResult> {
    if (this.#closed) return Promise.reject(unavailable());
    const command = audioTransportCommandSchema.parse(candidate);
    const requestId = randomUUID();
    const timeout = command.type === "play" ? Math.max(1, command.payload.deadlineMs + 8000 - Date.now()) : command.type === "stop" ? 4000 : 15_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#pending.delete(requestId); reject(unavailable()); }, timeout);
      this.#pending.set(requestId, { resolve, reject, timer });
      try { this.send({ type: "audio-request", generation: this.generation, requestId, command }); }
      catch { this.dispose(); }
    });
  }
}
function unavailable(): Error { return new Error("The owned desktop audio connection is unavailable."); }
