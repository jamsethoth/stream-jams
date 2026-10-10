import type { OverlayPurpose, VideoControlSupport, VideosModuleConfig } from "@stream-jams/core";
import {
  desktopVideoEventSchema, videoClockPositionMs,
  type DesktopVideoCommand, type DesktopVideoEvent, type DesktopVideoTransport, type VideoMirrorPublisherSignal, type VideoMirrorReceiverSignal
} from "@stream-jams/core/videos";
import type { VideoQueueService, VideoQueueView } from "./video-queue-service.js";

/** A browser source that relays mirror signaling over its overlay WebSocket. */
export interface VideoMirrorBrowserClient {
  readonly id: string;
  readonly purpose: OverlayPurpose;
}

export interface VideoMirrorDirectorOptions {
  readonly queue: Pick<VideoQueueService, "view" | "reportStarted" | "reportProgress" | "reportEnded" | "reportFailed">;
  readonly transport?: DesktopVideoTransport | undefined;
  readonly getConfig: () => Pick<VideosModuleConfig, "audioDeviceIds" | "audioDeviceDelaysMs">;
  readonly isMuted: () => boolean;
  /** Resolves selected audio route ids to explicit device ids the same way alert audio does. */
  readonly resolveDevices: (routeIds: readonly string[]) => Promise<readonly { readonly routeId: string; readonly deviceId: string }[]>;
  readonly deliverSignal: (clientId: string, signal: VideoMirrorPublisherSignal) => boolean;
  /** Called when the desktop player appears or disappears, so outputs switch between mirror and player delivery. */
  readonly onAvailabilityChanged: () => void;
  readonly onError?: (message: string, error: unknown) => void;
  readonly now?: () => number;
}

interface SentState {
  readonly itemId: string;
  readonly paused: boolean;
  readonly seekGeneration: number;
}

const purposes = ["live", "test"] as const;
const browserPrefix = "browser:";

/**
 * Drives the desktop primary player from the authoritative queue and routes what it
 * reports back. The queue stays authoritative: the player only ever receives commands
 * derived from queue state, and its reports go through the same queue entry points as
 * browser players.
 */
export class VideoMirrorDirector {
  readonly #sent = new Map<OverlayPurpose, SentState | null>([["live", null], ["test", null]]);
  readonly #controls = new Map<string, VideoControlSupport>();
  /** Browser receivers that have signaled, so a disconnect can close their peer connection. */
  readonly #browserReceivers = new Map<string, OverlayPurpose>();
  readonly #unsubscribe: (() => void) | null;
  #available: boolean;
  #outputRequest = 0;
  #closed = false;

  constructor(private readonly options: VideoMirrorDirectorOptions) {
    this.#available = options.transport?.available === true;
    this.#unsubscribe = options.transport?.subscribe(event => this.#receive(event)) ?? null;
    if (this.#available) this.#resync();
  }

  /** Whether outputs should show the desktop mirror rather than play on their own. */
  get available(): boolean { return this.#available && !this.#closed; }

  /** Pause and seek support the desktop player confirmed for this item (Twitch is feature-detected). */
  controlsFor(itemId: string): VideoControlSupport | undefined { return this.available ? this.#controls.get(itemId) : undefined; }

  /** Translates a queue change into player commands: load, play, pause, seek or stop. */
  queueChanged(purpose: OverlayPurpose, view: VideoQueueView): void {
    if (!this.available) return;
    const current = view.current;
    const sent = this.#sent.get(purpose) ?? null;
    if (current === null) {
      if (sent !== null) { this.#sent.set(purpose, null); this.#send({ type: "stop", purpose }); }
      return;
    }
    const itemId = current.item.id;
    const paused = current.phase === "paused";
    const positionMs = Math.round(videoClockPositionMs(current.clock, (this.options.now ?? Date.now)()));
    if (sent === null || sent.itemId !== itemId) {
      if (sent !== null) this.#controls.delete(sent.itemId);
      this.#sent.set(purpose, { itemId, paused, seekGeneration: current.seekGeneration });
      this.#send({ type: "load", purpose, itemId, source: current.item.source, positionMs, paused });
      return;
    }
    if (sent.seekGeneration !== current.seekGeneration) this.#send({ type: "seek", purpose, itemId, positionMs });
    if (sent.paused !== paused) this.#send(paused ? { type: "pause", purpose, itemId } : { type: "play", purpose, itemId, positionMs });
    this.#sent.set(purpose, { itemId, paused, seekGeneration: current.seekGeneration });
  }

  /** Mute policy or device selection changed: re-send the audio destinations for both purposes. */
  refreshOutput(): void {
    if (!this.available) return;
    const request = ++this.#outputRequest;
    const config = this.options.getConfig();
    const muted = this.options.isMuted();
    void this.options.resolveDevices(config.audioDeviceIds).then(resolved => {
      if (request !== this.#outputRequest || !this.available) return;
      const devices = [...new Map(resolved.map(entry => [entry.deviceId, { deviceId: entry.deviceId, delayMs: config.audioDeviceDelaysMs[entry.routeId] ?? 0 }])).values()].slice(0, 8);
      for (const purpose of purposes) this.#send({ type: "set-output", purpose, muted, devices });
    }).catch((error: unknown) => {
      if (request !== this.#outputRequest || !this.available) return;
      this.options.onError?.("Video device audio destinations could not be resolved.", error);
      // Fail closed for devices only; OBS audio still follows the browser source.
      for (const purpose of purposes) this.#send({ type: "set-output", purpose, muted, devices: [] });
    });
  }

  /** A browser source sent a mirror signal over its overlay WebSocket. Its id is assigned here, never by the client. */
  receiveBrowserSignal(client: VideoMirrorBrowserClient, signal: VideoMirrorReceiverSignal): void {
    if (!this.available) {
      if (signal.type === "hello") this.options.deliverSignal(client.id, { type: "not-ready", connection: signal.connection });
      return;
    }
    if (signal.type === "bye") this.#browserReceivers.delete(client.id);
    else if (!this.#browserReceivers.has(client.id) && this.#browserReceivers.size >= 256) return;
    else this.#browserReceivers.set(client.id, client.purpose);
    this.#send({ type: "signal", purpose: client.purpose, receiverId: `${browserPrefix}${client.id}`, signal });
  }

  browserClientDisconnected(clientId: string): void {
    const purpose = this.#browserReceivers.get(clientId);
    if (purpose === undefined) return;
    this.#browserReceivers.delete(clientId);
    // Connection numbers are per receiver; the host closes every connection for a bye.
    if (this.available) this.#send({ type: "signal", purpose, receiverId: `${browserPrefix}${clientId}`, signal: { type: "bye", connection: Number.MAX_SAFE_INTEGER } });
  }

  close(): void {
    this.#closed = true;
    this.#unsubscribe?.();
    this.#browserReceivers.clear();
    this.#controls.clear();
  }

  #receive(candidate: DesktopVideoEvent): void {
    if (this.#closed) return;
    const parsed = desktopVideoEventSchema.safeParse(candidate);
    if (!parsed.success) return;
    const event = parsed.data;
    if (event.type === "status") {
      if (event.available === this.#available) return;
      this.#available = event.available;
      for (const purpose of purposes) this.#sent.set(purpose, null);
      this.#controls.clear();
      this.#browserReceivers.clear();
      if (event.available) this.#resync();
      this.options.onAvailabilityChanged();
      return;
    }
    if (event.type === "signal") {
      if (!event.receiverId.startsWith(browserPrefix)) return;
      const clientId = event.receiverId.slice(browserPrefix.length);
      if (this.#browserReceivers.get(clientId) !== event.purpose) return;
      if (!this.options.deliverSignal(clientId, event.signal as VideoMirrorPublisherSignal)) this.#browserReceivers.delete(clientId);
      return;
    }
    // Reports only count for the item this purpose is currently playing.
    const current = this.options.queue.view(event.purpose).current;
    if (current === null || current.item.id !== event.itemId || this.#sent.get(event.purpose)?.itemId !== event.itemId) return;
    if (event.controls !== undefined) this.#controls.set(event.itemId, event.controls);
    const report = { ...(event.positionMs === undefined ? {} : { positionMs: event.positionMs }), ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }) };
    switch (event.state) {
      case "started": this.options.queue.reportStarted(event.itemId, report); break;
      case "progress": if (event.positionMs !== undefined) this.options.queue.reportProgress(event.itemId, { positionMs: event.positionMs, durationMs: event.durationMs ?? null }); break;
      case "ended": this.options.queue.reportEnded(event.itemId); break;
      case "failed": this.options.queue.reportFailed(event.itemId); break;
    }
  }

  #resync(): void {
    this.refreshOutput();
    for (const purpose of purposes) this.queueChanged(purpose, this.options.queue.view(purpose));
  }

  #send(command: DesktopVideoCommand): void {
    try { this.options.transport?.send(command); }
    catch (error) { this.options.onError?.("A desktop video command could not be sent.", error); }
  }
}
