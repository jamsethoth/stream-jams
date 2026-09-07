import { randomUUID } from "node:crypto";
import { audioPlaybackPayloadSchema, audioTransportCommandSchema, type AudioPlaybackPayload, type AudioTransportCommand, type AudioTransportResult, type DesktopAudioTransport } from "@stream-jams/core";
import { audioRendererReplySchema, type AudioRendererRequest } from "./audio-ipc.js";

export interface AudioRendererCallbacks { onReply(reply: unknown): void; onDestroyed(): void }
export interface AudioRendererPort { load(): Promise<void>; send(request: AudioRendererRequest): void; destroy(): void }
type Pending = { resolve(result: AudioTransportResult): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };

/** Main-process ownership is the last-resort silence boundary. No interrupted play is replayed. */
export class AudioHost implements DesktopAudioTransport {
  #port: AudioRendererPort | null = null;
  #generation = 0;
  #ready: Promise<void> | null = null;
  #pending = new Map<string, Pending>();
  #starts = new Set<{ playbackId: string; cancelled: boolean }>();
  #muted = true;
  #owned = false;
  #failures = 0;
  #leaseAt = 0;
  #leaseTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly createRenderer: (callbacks: AudioRendererCallbacks) => AudioRendererPort) {}

  beginOwnership(): void {
    this.serviceLost();
    this.#owned = true;
    this.#muted = true;
    this.#failures = 0;
    this.refreshLease();
    this.#leaseTimer = setInterval(() => {
      if (Date.now() - this.#leaseAt >= 10_000) this.serviceLost();
    }, 1000);
  }
  refreshLease(): void { if (this.#owned) this.#leaseAt = Date.now(); }
  serviceLost(): void {
    this.#owned = false;
    clearInterval(this.#leaseTimer);
    this.#discard(false);
  }
  async handle(candidate: AudioTransportCommand): Promise<AudioTransportResult> {
    const command = audioTransportCommandSchema.parse(candidate);
    switch (command.type) {
      case "enumerate": return { type: "devices", devices: [...await this.listOutputDevices()] };
      case "play": return { type: "played", failedRouteIds: [...(await this.play(command.payload)).failedRouteIds] };
      case "stop": await this.stop(command.playbackId); break;
      case "set-muted": await this.setMuted(command.muted); break;
      case "test": await this.testOutput(command.deviceId); break;
      case "retry": await this.retry(); break;
      case "close": await this.close(); break;
    }
    return { type: "ok" };
  }
  async listOutputDevices() {
    await this.#ensure();
    const result = await this.#request({ type: "enumerate" }, 5000);
    if (result.type !== "devices") { this.#discard(true); throw unavailable(); }
    return result.devices;
  }
  async play(candidate: AudioPlaybackPayload) {
    const payload = audioPlaybackPayloadSchema.parse(candidate);
    const start = { playbackId: payload.batch.playbackId, cancelled: false };
    this.#starts.add(start);
    try {
      await this.#ensure();
      if (start.cancelled || Date.now() >= Math.min(payload.startDeadlineMs, payload.deadlineMs)) throw unavailable();
      const result = await this.#request({ type: "play", payload }, Math.max(1, payload.deadlineMs + 5000 - Date.now()));
      if (result.type !== "played") { this.#discard(true); throw unavailable(); }
      return { failedRouteIds: result.failedRouteIds };
    } finally { this.#starts.delete(start); }
  }
  async stop(playbackId: string): Promise<void> {
    for (const start of this.#starts) if (start.playbackId === playbackId) start.cancelled = true;
    if (this.#port === null) return;
    // Do not wait for loading: even a pending load owns a renderer capable of sound.
    try {
      const result = await this.#request({ type: "stop", playbackId }, 2000);
      if (result.type !== "ok") this.#discard(true);
    } catch { this.#discard(false); }
  }
  async setMuted(muted: boolean): Promise<void> {
    this.#muted = muted;
    if (this.#port === null) return;
    try {
      const result = await this.#request({ type: "set-muted", muted }, 2000);
      if (result.type !== "ok") { this.#discard(true); throw unavailable(); }
    } catch { this.#discard(false); throw unavailable(); }
  }
  async retry(): Promise<void> {
    if (!this.#owned) throw unavailable();
    this.#discard(false);
    this.#failures = 0;
    await this.#ensure();
  }
  async close(): Promise<void> { this.serviceLost(); }
  async testOutput(deviceId: string): Promise<void> {
    // A fixed one-second PCM fixture. Uses exactly the same sink/mute/lifetime path.
    audioTransportCommandSchema.parse({ type: "test", deviceId });
    const bytes = testTone();
    const result = await this.play({ batch: {
      playbackId: randomUUID(), documentId: "route-test", durationMs: 1000, muted: this.#muted,
      layers: [{ layerId: "tone", assetId: "tone", volume: 0.25 }], destinations: [{ deviceId, routeIds: ["route-test"] }]
    }, assets: [{ assetId: "tone", mimeType: "audio/wav", bytes }], startDeadlineMs: Date.now() + 1000, deadlineMs: Date.now() + 1000 });
    if (result.failedRouteIds.length > 0) throw unavailable();
  }
  async #ensure(): Promise<void> {
    if (!this.#owned || this.#failures > 1) throw unavailable();
    if (this.#ready !== null) return this.#ready;
    const generation = ++this.#generation;
    const port = this.createRenderer({
      onReply: candidate => this.#receive(candidate, generation),
      onDestroyed: () => { if (this.#generation === generation && this.#port !== null) this.#discard(true); }
    });
    this.#port = port;
    this.#ready = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([port.load(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(unavailable()), 5000);
        })]);
        if (this.#port !== port || generation !== this.#generation) throw unavailable();
        const result = await this.#request({ type: "initialize", muted: this.#muted }, 2000);
        if (result.type !== "ok") throw unavailable();
      } catch {
        if (this.#port === port) this.#discard(true);
        throw unavailable();
      } finally { clearTimeout(timer); }
    })();
    return this.#ready;
  }
  #request(command: AudioRendererRequest["command"], timeoutMs: number): Promise<AudioTransportResult> {
    if (this.#port === null || !this.#owned) return Promise.reject(unavailable());
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.#discard(true), timeoutMs);
      this.#pending.set(requestId, { resolve, reject, timer });
      try { this.#port!.send({ generation: this.#generation, requestId, command }); }
      catch { this.#discard(true); }
    });
  }
  #receive(candidate: unknown, generation: number): void {
    if (generation !== this.#generation || this.#port === null) return;
    const parsed = audioRendererReplySchema.safeParse(candidate);
    if (!parsed.success || parsed.data.generation !== generation) return;
    const pending = this.#pending.get(parsed.data.requestId);
    if (pending === undefined) return;
    if (parsed.data.result === null) { this.#discard(true); return; }
    this.#pending.delete(parsed.data.requestId);
    clearTimeout(pending.timer);
    pending.resolve(parsed.data.result);
  }
  #discard(failed: boolean): void {
    const port = this.#port;
    this.#port = null;
    this.#ready = null;
    this.#generation++;
    for (const start of this.#starts) start.cancelled = true;
    // Destroy synchronously before rejecting terminal promises or acknowledging stop.
    port?.destroy();
    if (failed && port !== null) this.#failures++;
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(unavailable()); }
    this.#pending.clear();
  }
}
function unavailable(): Error { return new Error("Local audio is unavailable. Retry the audio backend explicitly if automatic recovery has been exhausted."); }
function testTone(): Uint8Array<ArrayBuffer> {
  const samples = 24_000;
  const bytes = new Uint8Array(44 + samples * 2);
  const data = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => data.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF"); data.setUint32(4, bytes.length - 8, true); text(8, "WAVEfmt ");
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, samples, true); data.setUint32(28, samples * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
  text(36, "data"); data.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) data.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 660 * i / samples) * 16383 * Math.min(1, i / 240, (samples - i) / 240)), true);
  return bytes;
}
