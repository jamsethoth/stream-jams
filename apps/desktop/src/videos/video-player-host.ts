import type { OverlayPurpose, VideoControlSupport, VideoSource } from "@stream-jams/core";
import {
  buildVideoPlayerUrl, desktopVideoCommandSchema, videoMirrorReceiverSignalSchema,
  type DesktopVideoCommand, type DesktopVideoEvent, type VideoMirrorPublisherSignal, type VideoMirrorReceiverSignal
} from "@stream-jams/core/videos";
import { videoDevicesReportSchema, videoPlayerReportSchema, type VideoDevicesCommand, type VideoPlayerCommand } from "./video-ipc.js";
import type { DesktopDiagnosticInput } from "../desktop-diagnostics.js";

export interface VideoPortCallbacks {
  onReport(candidate: unknown): void;
  onDestroyed(): void;
}

export type TwitchFrameOperation = { readonly type: "state" } | { readonly type: "pause" } | { readonly type: "play" } | { readonly type: "seek"; readonly positionMs: number };
export interface TwitchFrameState {
  readonly video: boolean;
  readonly paused?: boolean | undefined;
  readonly ended?: boolean | undefined;
  readonly positionMs?: number | undefined;
  readonly durationMs?: number | null | undefined;
}

/** One long-lived hidden player window per purpose. Providers are swapped inside it; it never navigates. */
export interface VideoPlayerPort {
  load(): Promise<void>;
  /** Starts frame capture with a user gesture supplied by the main process. */
  startCapture(): Promise<boolean>;
  send(command: VideoPlayerCommand): void;
  /** Runs an operation on the Twitch provider frame's `<video>`; null when no Twitch frame is present. */
  twitch(operation: TwitchFrameOperation): Promise<TwitchFrameState | null>;
  destroy(): void;
}

/** The hidden receiver that plays the mirror on selected devices, outside the captured player. */
export interface VideoDeviceOutputPort {
  load(): Promise<void>;
  send(command: VideoDevicesCommand): void;
  destroy(): void;
}

export interface VideoPlayerHostDependencies {
  readonly createPlayer: (purpose: OverlayPurpose, callbacks: VideoPortCallbacks) => VideoPlayerPort;
  readonly createDeviceOutput: (purpose: OverlayPurpose, callbacks: VideoPortCallbacks) => VideoDeviceOutputPort;
  /** The local service origin the player page is served from; Twitch and YouTube check it. */
  readonly playerOrigin: () => string;
  readonly diagnose?: ((input: DesktopDiagnosticInput) => void) | undefined;
  readonly now?: (() => number) | undefined;
  readonly twitchPollMs?: number | undefined;
}

export interface DesktopMirrorReceiver {
  send(signal: VideoMirrorReceiverSignal): void;
  detach(): void;
}

type Output = { readonly muted: boolean; readonly devices: readonly { readonly deviceId: string; readonly delayMs: number }[] };
interface Item {
  readonly itemId: string;
  readonly source: VideoSource;
  paused: boolean;
  positionMs: number;
  started: boolean;
  frameLoadedAt: number | null;
  controls: VideoControlSupport | null;
}
interface Session {
  readonly purpose: OverlayPurpose;
  generation: number;
  port: VideoPlayerPort | null;
  ready: Promise<boolean> | null;
  live: boolean;
  item: Item | null;
  output: Output;
  device: { readonly port: VideoDeviceOutputPort; readonly generation: number; loaded: boolean } | null;
  twitchTimer: ReturnType<typeof setInterval> | null;
  twitchBusy: boolean;
}

const devicesReceiverId = "desktop:devices";
const loadTimeoutMs = 10_000;
/** A Twitch frame whose `<video>` cannot be found by then plays with play and stop only. */
export const twitchDetectionMs = 6_000;
const leaseTimeoutMs = 10_000;
const purposes = ["live", "test"] as const;

/**
 * Main-process owner of the Videos primary players (OpenSpec add-video-request-queue 5.1-5.3, 5.5).
 * Commands come from the local service; reports, signals and availability go back to it.
 * Losing the service, a renderer or the app ends every player's sound.
 */
export class VideoPlayerHost {
  readonly #sessions = new Map<OverlayPurpose, Session>(purposes.map(purpose => [purpose, {
    purpose, generation: 0, port: null, ready: null, live: false, item: null, output: { muted: false, devices: [] }, device: null, twitchTimer: null, twitchBusy: false
  }]));
  readonly #desktopReceivers = new Map<string, { readonly purpose: OverlayPurpose; readonly deliver: (signal: VideoMirrorPublisherSignal) => void }>();
  #sink: (event: DesktopVideoEvent) => void = () => undefined;
  #owned = false;
  #announced = false;
  #leaseAt = 0;
  #leaseTimer: ReturnType<typeof setInterval> | undefined;
  readonly #now: () => number;

  constructor(private readonly dependencies: VideoPlayerHostDependencies) {
    this.#now = dependencies.now ?? Date.now;
  }

  onEvent(sink: (event: DesktopVideoEvent) => void): void { this.#sink = sink; }

  beginOwnership(): void {
    this.serviceLost();
    this.#owned = true;
    this.#startLease();
  }

  /** The service's lease. The first one after ownership announces the player as available. */
  refreshLease(): void {
    if (!this.#owned) { this.#owned = true; this.#startLease(); }
    this.#leaseAt = this.#now();
    if (!this.#announced) { this.#announced = true; this.#emit({ type: "status", available: true }); }
  }

  /** Without its service the player must fall silent: every window is destroyed. */
  serviceLost(): void {
    const wasAnnounced = this.#announced;
    this.#owned = false;
    this.#announced = false;
    clearInterval(this.#leaseTimer);
    for (const session of this.#sessions.values()) {
      session.item = null;
      session.output = { muted: false, devices: [] };
      this.#discardPlayer(session, false);
    }
    if (wasAnnounced) this.#emit({ type: "status", available: false });
  }

  async close(): Promise<void> {
    this.serviceLost();
    this.#sink = () => undefined;
  }

  handle(candidate: DesktopVideoCommand): void {
    if (!this.#owned) return;
    const parsed = desktopVideoCommandSchema.safeParse(candidate);
    if (!parsed.success) return;
    const command = parsed.data as DesktopVideoCommand;
    const session = this.#session(command.purpose);
    switch (command.type) {
      case "load": void this.#load(session, command); break;
      case "play": this.#control(session, command.itemId, item => { item.paused = false; item.positionMs = command.positionMs; }, { type: "play", positionMs: command.positionMs }, { type: "play" }); break;
      case "pause": this.#control(session, command.itemId, item => { item.paused = true; }, { type: "pause" }, { type: "pause" }); break;
      case "seek": this.#control(session, command.itemId, item => { item.positionMs = command.positionMs; }, { type: "seek", positionMs: command.positionMs }, { type: "seek", positionMs: command.positionMs }); break;
      case "stop": this.#stop(session); break;
      case "set-output": session.output = { muted: command.muted, devices: command.devices }; this.#reconcileDevices(session); break;
      case "signal":
        if (!command.receiverId.startsWith("browser:")) return;
        this.#receiverSignal(session, command.receiverId, command.signal);
        break;
    }
  }

  /** A receiver inside the desktop app (the desktop overlay layer) joins one purpose's mirror. */
  attachDesktopReceiver(receiverId: `desktop:${string}`, purpose: OverlayPurpose, deliver: (signal: VideoMirrorPublisherSignal) => void): DesktopMirrorReceiver {
    if (receiverId === devicesReceiverId) throw new Error("Reserved mirror receiver id");
    const entry = { purpose, deliver };
    this.#desktopReceivers.set(receiverId, entry);
    let attached = true;
    return {
      send: candidate => {
        const signal = videoMirrorReceiverSignalSchema.safeParse(candidate);
        if (attached && signal.success) this.#receiverSignal(this.#session(purpose), receiverId, signal.data);
      },
      detach: () => {
        if (!attached) return;
        attached = false;
        if (this.#desktopReceivers.get(receiverId) === entry) this.#desktopReceivers.delete(receiverId);
        this.#toPublisher(this.#session(purpose), receiverId, { type: "bye", connection: Number.MAX_SAFE_INTEGER });
      }
    };
  }

  async #load(session: Session, command: Extract<DesktopVideoCommand, { type: "load" }>): Promise<void> {
    this.#stopTwitch(session);
    const item: Item = { itemId: command.itemId, source: command.source, paused: command.paused, positionMs: command.positionMs, started: false, frameLoadedAt: null, controls: null };
    session.item = item;
    const ready = await this.#ensurePlayer(session);
    if (session.item !== item) return;
    if (!ready || session.port === null) { this.#report(session, item, "failed", { reason: "The desktop video player could not start capture." }); session.item = null; return; }
    const origin = this.dependencies.playerOrigin();
    let url: string;
    try { url = command.source.provider === "direct" ? command.source.url : buildVideoPlayerUrl(command.source, { parentHost: new URL(origin).hostname, playerOrigin: origin }); }
    catch (error) {
      this.#diagnose("desktop.video.url-failed", "The video player URL could not be built.", error);
      this.#report(session, item, "failed", { reason: "The video source could not be loaded." });
      session.item = null;
      return;
    }
    session.port.send({ type: "load", itemId: item.itemId, source: item.source, url, positionMs: item.positionMs, paused: item.paused });
    if (item.source.provider === "twitch-clip" || item.source.provider === "twitch-vod") this.#startTwitch(session, item);
    this.#reconcileDevices(session);
  }

  #control(session: Session, itemId: string, update: (item: Item) => void, page: VideoPlayerCommand, twitch: TwitchFrameOperation): void {
    const item = session.item;
    if (item === null || item.itemId !== itemId) return;
    update(item);
    if (!session.live || session.port === null) return; // Applied by the pending load.
    if (item.source.provider === "twitch-clip" || item.source.provider === "twitch-vod") {
      if (item.controls?.pause === true) void this.#twitch(session, twitch);
      return;
    }
    session.port.send(page);
  }

  #stop(session: Session): void {
    this.#stopTwitch(session);
    session.item = null;
    // Removing the provider ends the player's sound for every output at once.
    if (session.live) session.port?.send({ type: "stop" });
  }

  #ensurePlayer(session: Session): Promise<boolean> {
    if (session.ready !== null) return session.ready;
    const generation = ++session.generation;
    let port: VideoPlayerPort;
    try {
      port = this.dependencies.createPlayer(session.purpose, {
        onReport: candidate => { if (session.generation === generation) this.#playerReport(session, candidate); },
        onDestroyed: () => { if (session.generation === generation) this.#discardPlayer(session, true); }
      });
    } catch (error) {
      this.#diagnose("desktop.video.player-create-failed", "The desktop video player window could not be created.", error);
      return Promise.resolve(false);
    }
    session.port = port;
    session.ready = (async () => {
      try {
        await withTimeout(port.load(), loadTimeoutMs);
        if (session.generation !== generation) return false;
        const captured = await withTimeout(port.startCapture(), loadTimeoutMs);
        if (session.generation !== generation) return false;
        if (!captured) throw new Error("Frame capture was refused");
        session.live = true;
        return true;
      } catch (error) {
        if (session.generation === generation) {
          this.#diagnose("desktop.video.player-start-failed", "The desktop video player could not start capture.", error);
          this.#discardPlayer(session, false);
        }
        return false;
      }
    })();
    return session.ready;
  }

  #discardPlayer(session: Session, report: boolean): void {
    const port = session.port;
    session.generation += 1;
    session.port = null;
    session.ready = null;
    session.live = false;
    this.#stopTwitch(session);
    this.#discardDevices(session);
    try { port?.destroy(); }
    catch (error) { this.#diagnose("desktop.video.player-destroy-failed", "The desktop video player window could not be closed.", error); }
    const item = session.item;
    if (report && item !== null) {
      session.item = null;
      this.#report(session, item, "failed", { reason: "The desktop video player stopped unexpectedly." });
    }
  }

  #playerReport(session: Session, candidate: unknown): void {
    const parsed = videoPlayerReportSchema.safeParse(candidate);
    if (!parsed.success) return;
    const report = parsed.data;
    if (report.type === "signal") { this.#toReceiver(session, report.receiverId, report.signal); return; }
    if (report.type === "capture") {
      if (!report.ok && session.live) {
        this.#diagnose("desktop.video.capture-ended", "The desktop video capture ended.", new Error(report.reason ?? "capture-ended"));
        this.#discardPlayer(session, true);
      }
      return;
    }
    const item = session.item;
    if (item === null || item.itemId !== report.itemId) return;
    const twitch = item.source.provider === "twitch-clip" || item.source.provider === "twitch-vod";
    if (report.state === "frame-loaded") { item.frameLoadedAt ??= this.#now(); return; }
    if (twitch) return; // Twitch state is read from its frame by the main process.
    const details = { ...(report.positionMs === undefined ? {} : { positionMs: report.positionMs }), ...(report.durationMs === undefined ? {} : { durationMs: report.durationMs }), ...(report.reason === undefined ? {} : { reason: report.reason }) };
    if (report.state === "started") {
      if (item.started) return;
      item.started = true;
      item.controls = { pause: true, seek: true };
      this.#report(session, item, "started", { ...details, controls: item.controls });
      return;
    }
    if (!item.started && report.state === "progress") return;
    if (report.state === "ended" || report.state === "failed") session.item = null;
    this.#report(session, item, report.state, details);
  }

  #startTwitch(session: Session, item: Item): void {
    this.#stopTwitch(session);
    session.twitchTimer = setInterval(() => void this.#pollTwitch(session, item), this.dependencies.twitchPollMs ?? 1000);
  }

  #stopTwitch(session: Session): void {
    if (session.twitchTimer !== null) clearInterval(session.twitchTimer);
    session.twitchTimer = null;
  }

  async #pollTwitch(session: Session, item: Item): Promise<void> {
    if (session.twitchBusy || session.item !== item) return;
    session.twitchBusy = true;
    try {
      const state = await this.#twitch(session, { type: "state" });
      if (session.item !== item) return;
      if (!item.started) {
        if (state?.video === true && state.paused === false && (state.positionMs ?? 0) > 0) {
          item.started = true;
          item.controls = { pause: true, seek: true };
          this.#report(session, item, "started", { positionMs: state.positionMs ?? 0, durationMs: state.durationMs ?? null, controls: item.controls });
          if (item.paused) void this.#twitch(session, { type: "pause" });
        } else if (item.frameLoadedAt !== null && this.#now() - item.frameLoadedAt >= twitchDetectionMs) {
          // Twitch markup changed or the frame hides its video: play and stop only, as the operator sees.
          item.started = true;
          item.controls = { pause: false, seek: false };
          this.#report(session, item, "started", { controls: item.controls, reason: "Twitch player control is unavailable for this video." });
        }
        return;
      }
      if (state?.video !== true) return;
      if (state.ended === true) { session.item = null; this.#stopTwitch(session); this.#report(session, item, "ended", {}); return; }
      if (state.positionMs !== undefined) this.#report(session, item, "progress", { positionMs: state.positionMs, durationMs: state.durationMs ?? null });
    } finally { session.twitchBusy = false; }
  }

  async #twitch(session: Session, operation: TwitchFrameOperation): Promise<TwitchFrameState | null> {
    const port = session.port;
    if (port === null || !session.live) return null;
    try { return await withTimeout(port.twitch(operation), 3000); }
    catch (error) {
      this.#diagnose("desktop.video.twitch-control-failed", "The Twitch player could not be reached.", error);
      return null;
    }
  }

  #receiverSignal(session: Session, receiverId: string, signal: VideoMirrorReceiverSignal): void {
    if (session.live && session.port !== null) { this.#toPublisher(session, receiverId, signal); return; }
    // No capture yet: the receiver retries with backoff.
    if (signal.type === "hello") this.#toReceiver(session, receiverId, { type: "not-ready", connection: signal.connection });
  }

  #toPublisher(session: Session, receiverId: string, signal: VideoMirrorReceiverSignal): void {
    if (!session.live || session.port === null) return;
    try { session.port.send({ type: "signal", receiverId, signal }); }
    catch (error) { this.#diagnose("desktop.video.signal-failed", "A mirror signal could not reach the video player.", error); }
  }

  #toReceiver(session: Session, receiverId: string, signal: VideoMirrorPublisherSignal): void {
    if (receiverId.startsWith("browser:")) { this.#emit({ type: "signal", purpose: session.purpose, receiverId, signal }); return; }
    if (receiverId === devicesReceiverId) { if (session.device?.loaded === true) session.device.port.send({ type: "signal", signal }); return; }
    const receiver = this.#desktopReceivers.get(receiverId);
    if (receiver === undefined || receiver.purpose !== session.purpose) return;
    try { receiver.deliver(signal); }
    catch (error) { this.#diagnose("desktop.video.signal-failed", "A mirror signal could not reach a desktop receiver.", error); }
  }

  /** Device output runs only while a player exists and devices are selected; muting keeps it connected but silent. */
  #reconcileDevices(session: Session): void {
    const wanted = this.#owned && session.port !== null && session.output.devices.length > 0;
    if (!wanted) { this.#discardDevices(session); return; }
    const configure: VideoDevicesCommand = { type: "configure", muted: session.output.muted, devices: [...session.output.devices] };
    if (session.device !== null) { if (session.device.loaded) session.device.port.send(configure); return; }
    const generation = session.generation;
    let port: VideoDeviceOutputPort;
    try {
      port = this.dependencies.createDeviceOutput(session.purpose, {
        onReport: candidate => { if (session.device?.port === port) this.#deviceReport(session, candidate); },
        onDestroyed: () => { if (session.device?.port === port) { session.device = null; } }
      });
    } catch (error) {
      this.#diagnose("desktop.video.devices-create-failed", "The video device output could not be created.", error);
      return;
    }
    const device = { port, generation, loaded: false };
    session.device = device;
    void withTimeout(port.load(), loadTimeoutMs).then(() => {
      if (session.device !== device) return;
      device.loaded = true;
      port.send({ type: "configure", muted: session.output.muted, devices: [...session.output.devices] });
    }).catch((error: unknown) => {
      if (session.device !== device) return;
      this.#diagnose("desktop.video.devices-load-failed", "The video device output could not load.", error);
      this.#discardDevices(session);
    });
  }

  #discardDevices(session: Session): void {
    const device = session.device;
    if (device === null) return;
    session.device = null;
    this.#toPublisher(session, devicesReceiverId, { type: "bye", connection: Number.MAX_SAFE_INTEGER });
    try { device.port.destroy(); }
    catch (error) { this.#diagnose("desktop.video.devices-destroy-failed", "The video device output could not be closed.", error); }
  }

  #deviceReport(session: Session, candidate: unknown): void {
    const parsed = videoDevicesReportSchema.safeParse(candidate);
    if (!parsed.success) return;
    if (parsed.data.type === "signal") { this.#receiverSignal(session, devicesReceiverId, parsed.data.signal); return; }
    if (parsed.data.failed > 0) this.#diagnose("desktop.video.devices-unavailable", "Some selected audio outputs could not play video audio.", new Error(`${parsed.data.failed} of ${parsed.data.failed + parsed.data.started} outputs failed`));
  }

  #report(session: Session, item: Item, state: "started" | "progress" | "ended" | "failed", details: { positionMs?: number; durationMs?: number | null; controls?: VideoControlSupport; reason?: string }): void {
    this.#emit({ type: "report", purpose: session.purpose, itemId: item.itemId, state, ...details });
  }

  #emit(event: DesktopVideoEvent): void {
    try { this.#sink(event); }
    catch (error) { this.#diagnose("desktop.video.event-failed", "A video player event could not reach the local service.", error); }
  }

  #session(purpose: OverlayPurpose): Session { return this.#sessions.get(purpose)!; }

  #startLease(): void {
    this.#leaseAt = this.#now();
    clearInterval(this.#leaseTimer);
    this.#leaseTimer = setInterval(() => {
      if (this.#now() - this.#leaseAt >= leaseTimeoutMs) this.serviceLost();
    }, 1000);
    this.#leaseTimer.unref?.();
  }

  #diagnose(source: string, message: string, exception: unknown): void {
    this.dependencies.diagnose?.({ component: "video-player", source, message, exception });
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms); })])
    .finally(() => clearTimeout(timer));
}
