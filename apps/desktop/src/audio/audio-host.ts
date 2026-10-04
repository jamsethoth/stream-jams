import { randomUUID } from "node:crypto";
import { audioPlaybackPayloadSchema, audioTransportCommandSchema, type AudioPlaybackPayload, type AudioTransportCommand, type AudioTransportResult, type PrivateMediaReference, type TrustedMediaGrant, type PrivateAudioPlaybackPayload, type DesktopAudioTransport } from "@stream-jams/core";
import { audioRendererReplySchema, type AudioRendererRequest } from "./audio-ipc.js";
import type { DesktopDiagnosticInput } from "../desktop-diagnostics.js";

export interface AudioRendererCallbacks { onReply(reply: unknown): void; onDestroyed(): void }
export interface AudioRendererPort { load(): Promise<void>; send(request: AudioRendererRequest): void; destroy(): void; issueMedia(ownerId: string, grant: TrustedMediaGrant): PrivateMediaReference; revokeMediaOwner(ownerId: string): void }
type Pending = { resolve(result: AudioTransportResult): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };

/** Main-process ownership is the last-resort silence boundary. No interrupted play is replayed. */
export class AudioHost implements DesktopAudioTransport {
  #port: AudioRendererPort | null = null;
  #generation = 0;
  #ready: Promise<void> | null = null;
  #pending = new Map<string, Pending>();
  #prepared = new Map<string, { playbackId: string; generation: number; durationMs: number; timer: ReturnType<typeof setTimeout> }>();
  #mediaOwners = new Map<string, string>();
  #starts = new Set<{ playbackId: string; cancelled: boolean }>();
  #moduleMutes: import("@stream-jams/core").ModuleMuteState | undefined;
  #muted = true;
  #owned = false;
  #failures = 0;
  #retryAt = 0;
  #cooldown: Promise<void> | null = null;
  #cancelCooldown: (() => void) | null = null;
  #leaseAt = 0;
  #leaseTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly createRenderer: (callbacks: AudioRendererCallbacks, generation: number) => AudioRendererPort, private readonly diagnose?: (input: DesktopDiagnosticInput) => void) {}

  beginOwnership(): void {
    this.serviceLost();
    this.#owned = true;
    this.#muted = true;
    this.#moduleMutes = undefined;
    this.#failures = 0; this.#retryAt = 0;
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
  }
  async handle(candidate: AudioTransportCommand): Promise<AudioTransportResult> {
    const command = audioTransportCommandSchema.parse(candidate);
    switch (command.type) {
      case "enumerate": return { type: "devices", devices: [...await this.listOutputDevices()] };
      case "prepare": return this.#prepare(command.token, command.payload);
      case "start": return this.#start(command.token, command.startsAtEpochMs);
      case "play": return { type: "played", ...await this.play(command.payload) };
      case "stop": await this.stop(command.playbackId); break;
      case "set-muted": await this.setMuted(command.muted); break;
      case "set-module-mutes": await this.setModuleMutes(command.moduleMutes); break;
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
  async prepare(payload: AudioPlaybackPayload) {
    const token = randomUUID();
    await this.#prepare(token, payload);
    return { start: async (startsAtEpochMs: number) => {
      const result = await this.#start(token, startsAtEpochMs);
      if (result.type !== "played") throw unavailable();
      return { ...(result.outputDiagnostics === undefined ? {} : { outputDiagnostics: result.outputDiagnostics }), ...(result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics }), failedRouteIds: result.failedRouteIds, ...(result.failures === undefined ? {} : { failures: result.failures }) };
    } };
  }
  async #prepare(token: string, candidate: AudioPlaybackPayload): Promise<AudioTransportResult> {
    const payload = audioPlaybackPayloadSchema.parse(candidate);
    if (this.#prepared.size >= 64 || this.#prepared.has(token)) throw unavailable();
    const start = { playbackId: payload.batch.playbackId, cancelled: false };
    this.#starts.add(start);
    try {
      await this.#ensure();
      if (start.cancelled) throw unavailable();
      const now = Date.now();
      const result = await this.#request({ type: "prepare", token, payload: this.#translate({ ...payload, startDeadlineMs: now + 5000, deadlineMs: now + 15000 }, token) }, 6000);
      if (start.cancelled || result.type !== "prepared" || result.token !== token) throw unavailable();
      const timer = setTimeout(() => { void this.stop(payload.batch.playbackId); }, 15000);
      this.#prepared.set(token, { playbackId: payload.batch.playbackId, generation: this.#generation, durationMs: payload.batch.durationMs, timer });
      return result;
    } catch (error) { this.#revoke(token); throw error; } finally { this.#starts.delete(start); }
  }
  async #start(token: string, startsAtEpochMs: number): Promise<AudioTransportResult> {
    const prepared = this.#prepared.get(token);
    if (prepared === undefined || prepared.generation !== this.#generation) throw unavailable();
    clearTimeout(prepared.timer);
    this.#prepared.delete(token);
    try {
      const result = await this.#request({ type: "start", token, startsAtEpochMs, durationMs: prepared.durationMs }, Math.max(1, startsAtEpochMs + prepared.durationMs + 5000 - Date.now()));
      if (result.type !== "played") throw unavailable();
      return result;
    } finally { this.#revoke(token); }
  }
  async play(candidate: AudioPlaybackPayload) {
    const payload = audioPlaybackPayloadSchema.parse(candidate);
    const owner = randomUUID();
    const start = { playbackId: payload.batch.playbackId, cancelled: false };
    this.#starts.add(start);
    try {
      await this.#ensure();
      if (start.cancelled || Date.now() >= Math.min(payload.startDeadlineMs, payload.deadlineMs)) throw unavailable();
      const result = await this.#request({ type: "play", payload: this.#translate(payload, owner) }, Math.max(1, payload.deadlineMs + 5000 - Date.now()));
      if (result.type !== "played") { this.#discard(true); throw unavailable(); }
      return { ...(result.outputDiagnostics === undefined ? {} : { outputDiagnostics: result.outputDiagnostics }), ...(result.diagnostics === undefined ? {} : { diagnostics: result.diagnostics }), failedRouteIds: result.failedRouteIds, ...(result.failures === undefined ? {} : { failures: result.failures }) };
    } finally { this.#revoke(owner); this.#starts.delete(start); }
  }
  async stop(playbackId: string): Promise<void> {
    for (const [token, prepared] of this.#prepared) if (prepared.playbackId === playbackId) { clearTimeout(prepared.timer); this.#prepared.delete(token); }
    for (const start of this.#starts) if (start.playbackId === playbackId) start.cancelled = true;
    for (const [owner, id] of this.#mediaOwners) if (id === playbackId) this.#revoke(owner);
    if (this.#port === null) return;
    // Do not wait for loading: even a pending load owns a renderer capable of sound.
    try {
      const result = await this.#request({ type: "stop", playbackId }, 2000);
      if (result.type !== "ok") this.#discard(true);
    }
    catch (error) {
      this.diagnose?.({ component: "audio-renderer", source: "desktop.audio.stop-failed", message: "Desktop audio could not confirm playback stop.", exception: error });
      this.#discard(false, error);
    }
  }
  async setModuleMutes(moduleMutes: import("@stream-jams/core").ModuleMuteState): Promise<void> {
    this.#moduleMutes = { ...moduleMutes };
    this.#muted = false;
    if (this.#port === null) return;
    try {
      const result = await this.#request({ type: "set-module-mutes", moduleMutes }, 2000);
      if (result.type !== "ok") { this.#discard(true); throw unavailable(); }
    } catch (error) { this.#discard(false, error); throw unavailable(error); }
  }
  async setMuted(muted: boolean): Promise<void> {
    this.#muted = muted;
    if (this.#port === null) return;
    try {
      const result = await this.#request({ type: "set-muted", muted }, 2000);
      if (result.type !== "ok") { this.#discard(true); throw unavailable(); }
    }
    catch (error) { this.#discard(false, error); throw unavailable(error); }
  }
  async retry(): Promise<void> {
    if (!this.#owned) throw unavailable();
    this.#discard(false);
    this.#failures = 0; this.#retryAt = 0;
    await this.#ensure();
  }
  async close(): Promise<void> { this.serviceLost(); }
  async testOutput(deviceId: string): Promise<void> {
    audioTransportCommandSchema.parse({ type: "test", deviceId });
    await this.#ensure();
    const result = await this.#request({ type: "test", deviceId }, 6000);
    if (result.type !== "ok") throw unavailable();
  }
  #translate(payload: AudioPlaybackPayload, owner: string): PrivateAudioPlaybackPayload {
    if (this.#port === null) throw unavailable();
    this.#mediaOwners.set(owner, payload.batch.playbackId);
    return { ...payload, assets: payload.assets.map(asset => ({ assetId: asset.assetId, reference: this.#port!.issueMedia(owner, asset.grant) })) };
  }
  #revoke(owner: string): void { this.#port?.revokeMediaOwner(owner); this.#mediaOwners.delete(owner); }
  #startLease(): void {
    this.#leaseAt = Date.now();
    clearInterval(this.#leaseTimer);
    this.#leaseTimer = setInterval(() => {
      if (Date.now() - this.#leaseAt >= 10_000) this.serviceLost();
    }, 1000);
  }
  async #ensure(): Promise<void> {
    if (!this.#owned) throw unavailable();
    if (Date.now() < this.#retryAt) await this.#waitForRecovery();
    if (!this.#owned) throw unavailable();
    if (this.#ready !== null) return this.#ready;
    const generation = ++this.#generation;
    const port = this.createRenderer({
      onReply: candidate => this.#receive(candidate, generation),
      onDestroyed: () => { if (this.#generation === generation && this.#port !== null) this.#discard(true); }
    }, generation);
    this.#port = port;
    this.#ready = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([port.load(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(unavailable()), 5000);
        })]);
        if (this.#port !== port || generation !== this.#generation) throw unavailable();
        const result = await this.#request({ type: "initialize", protocolVersion: 1, muted: this.#muted, ...(this.#moduleMutes === undefined ? {} : { moduleMutes: this.#moduleMutes }) }, 2000);
        if (result.type !== "ok") throw unavailable();
      }
      catch (error) {
        if (this.#port === port) this.#discard(true, error);
        throw unavailable(error);
      } finally { clearTimeout(timer); }
    })();
    return this.#ready;
  }
  #request(command: AudioRendererRequest["command"], timeoutMs: number): Promise<AudioTransportResult> {
    if (this.#port === null || !this.#owned) return Promise.reject(unavailable());
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (command.type === "initialize") {
          const error = new Error("Desktop media protocol v1 initialization was not acknowledged. Rebuild the desktop runtime and private renderer together.");
          this.diagnose?.({ component: "audio-renderer", source: "desktop.audio.incompatible-media-protocol", message: error.message });
          this.#discard(true, error);
        } else this.#discard(true);
      }, timeoutMs);
      this.#pending.set(requestId, { resolve, reject, timer });
      try { this.#port!.send({ protocolVersion: 1, generation: this.#generation, requestId, command }); }
      catch (error) { this.#discard(true, error); }
    });
  }
  #receive(candidate: unknown, generation: number): void {
    if (generation !== this.#generation || this.#port === null) return;
    if (typeof candidate === "object" && candidate !== null && "generation" in candidate && candidate.generation === generation && (! ("protocolVersion" in candidate) || candidate.protocolVersion !== 1)) {
      const error = new Error("Incompatible desktop media protocol. Rebuild the desktop runtime and its private renderer together.");
      this.diagnose?.({ component: "audio-renderer", source: "desktop.audio.incompatible-media-protocol", message: error.message });
      this.#discard(true, error); return;
    }
    const parsed = audioRendererReplySchema.safeParse(candidate);
    if (!parsed.success || parsed.data.generation !== generation) return;
    const pending = this.#pending.get(parsed.data.requestId);
    if (pending === undefined) return;
    if (parsed.data.result === null) { this.#discard(true, parsed.data.exception); return; }
    this.#pending.delete(parsed.data.requestId);
    clearTimeout(pending.timer);
    pending.resolve(parsed.data.result);
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
  #discard(failed: boolean, cause?: unknown): void {
    const port = this.#port;
    for (const prepared of this.#prepared.values()) clearTimeout(prepared.timer);
    this.#prepared.clear();
    this.#mediaOwners.clear();
    this.#cancelCooldown?.(); this.#cancelCooldown = null; this.#cooldown = null;
    this.#port = null;
    this.#ready = null;
    this.#generation++;
    for (const start of this.#starts) start.cancelled = true;
    // Destroy synchronously before rejecting terminal promises or acknowledging stop.
    port?.destroy();
    if (failed && port !== null) {
      this.#failures++;
      this.#retryAt = Date.now() + (this.#failures === 1 ? 0 : Math.min(5000, 1000 * 2 ** Math.min(3, this.#failures - 2)));
    }
    for (const pending of this.#pending.values()) { clearTimeout(pending.timer); pending.reject(unavailable(cause)); }
    this.#pending.clear();
  }
}
function unavailable(cause?: unknown): Error {
  return new Error("Local audio is unavailable. Future requests recover automatically; Retry can restore the backend immediately.", cause === undefined ? undefined : { cause });
}
