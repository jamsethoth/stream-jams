import {
  isLocalHostIceCandidate, parseYouTubeMessage, videoMirrorFrameRate, videoMirrorIceServers, videoMirrorVideoEncoding,
  type VideoMirrorHello, type VideoMirrorReceiverSignal
} from "@stream-jams/core/videos";
import type { VideoPlayerCommand, VideoPlayerReport } from "./video-ipc.js";

/*
 * The Videos primary player page (OpenSpec add-video-request-queue 5.2-5.3). It lives in a
 * hidden window for as long as its purpose is owned. Providers are swapped inside #stage;
 * the page captures itself once and publishes that capture to every receiver over
 * loopback WebRTC. Nothing else in this page makes sound.
 */

declare global {
  interface Window {
    streamJamsVideoPlayer?: {
      onCommand(callback: (command: VideoPlayerCommand) => void): () => void;
      report(report: VideoPlayerReport): void;
    };
    streamJamsStartCapture?: () => Promise<boolean>;
  }
}

type LoadCommand = Extract<VideoPlayerCommand, { type: "load" }>;
interface Provider {
  readonly itemId: string;
  play(positionMs: number): void;
  pause(): void;
  seek(positionMs: number): void;
  dispose(): void;
}

const youtubeOrigin = "https://www.youtube-nocookie.com";
const progressIntervalMs = 1000;
const driftToleranceMs = 2000;
const startTimeoutMs = 20_000;
const maximumConnections = 16;
const bridge = window.streamJamsVideoPlayer;
const stage = document.getElementById("stage");

function report(message: VideoPlayerReport): void { bridge?.report(message); }
function ms(seconds: number): number { return Math.max(0, Math.round(seconds * 1000)); }
function durationMs(seconds: number | undefined): number | null { return seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds * 1000)) : null; }

let provider: Provider | null = null;

function replaceProvider(next: Provider | null, element: HTMLElement | null): void {
  provider?.dispose();
  provider = next;
  stage?.replaceChildren(...(element === null ? [] : [element]));
}

/** Stream Jams' own `<video>` for allowlisted direct files. */
function directProvider(command: LoadCommand): { readonly provider: Provider; readonly element: HTMLVideoElement } {
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.autoplay = !command.paused;
  let started = false;
  let lastProgress = 0;
  const state = (value: "started" | "progress" | "ended" | "failed", reason?: string) => report({
    type: "state", itemId: command.itemId, state: value, positionMs: ms(video.currentTime), durationMs: durationMs(video.duration), ...(reason === undefined ? {} : { reason })
  });
  video.addEventListener("loadedmetadata", () => { if (command.positionMs > 0) video.currentTime = command.positionMs / 1000; }, { once: true });
  video.addEventListener("playing", () => { if (!started) { started = true; state("started"); } });
  video.addEventListener("timeupdate", () => {
    if (!started || performance.now() - lastProgress < progressIntervalMs) return;
    lastProgress = performance.now();
    state("progress");
  });
  video.addEventListener("ended", () => state("ended"));
  video.addEventListener("error", () => state("failed", "The video file could not be loaded."));
  video.src = command.url;
  if (command.paused) {
    // A paused item still shows its frame; it is started so the queue can resume it.
    video.addEventListener("loadeddata", () => { if (!started) { started = true; state("started"); } }, { once: true });
  }
  return { element: video, provider: {
    itemId: command.itemId,
    play: positionMs => {
      if (Math.abs(video.currentTime * 1000 - positionMs) > driftToleranceMs) video.currentTime = positionMs / 1000;
      void video.play().catch(
        // error-provenance: allow expected -- a refused resume is reported to the queue as a failed item
        () => state("failed", "The video could not resume."));
    },
    pause: () => video.pause(),
    seek: positionMs => { video.currentTime = positionMs / 1000; },
    dispose: () => { video.pause(); video.removeAttribute("src"); video.load(); }
  } };
}

/** YouTube through its postMessage API; no provider script runs in this page. */
function youtubeProvider(command: LoadCommand, frame: HTMLIFrameElement): Provider {
  let started = false;
  let ended = false;
  let paused = command.paused;
  let lastProgress = 0;
  let currentMs: number | null = null;
  let totalMs: number | null = null;
  const post = (message: object) => frame.contentWindow?.postMessage(JSON.stringify(message), youtubeOrigin);
  const call = (func: string, args: readonly unknown[] = []) => post({ event: "command", func, args, id: 1, channel: "widget" });
  const fail = (reason: string) => {
    if (ended) return;
    ended = true;
    report({ type: "state", itemId: command.itemId, state: "failed", reason });
  };
  const timeout = window.setTimeout(() => { if (!started) fail("The YouTube player did not start."); }, startTimeoutMs);
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== youtubeOrigin || event.source !== frame.contentWindow || typeof event.data !== "string") return;
    if (isYouTubeError(event.data)) { fail("YouTube could not play this video."); return; }
    const message = parseYouTubeMessage(event.data);
    if (message === null || ended) return;
    if (message.currentTime !== null) currentMs = ms(message.currentTime);
    if (message.duration !== undefined) totalMs = durationMs(message.duration);
    if (message.playerState === 1 && !started) {
      started = true;
      window.clearTimeout(timeout);
      // Resume where the queue says, then honour a paused queue.
      if (currentMs !== null && Math.abs(currentMs - command.positionMs) > driftToleranceMs) call("seekTo", [command.positionMs / 1000, true]);
      if (paused) call("pauseVideo");
      report({ type: "state", itemId: command.itemId, state: "started", positionMs: currentMs ?? command.positionMs, durationMs: totalMs });
      return;
    }
    if (message.playerState === 0 && started) {
      ended = true;
      report({ type: "state", itemId: command.itemId, state: "ended", ...(currentMs === null ? {} : { positionMs: currentMs }), durationMs: totalMs });
      return;
    }
    if (started && currentMs !== null && performance.now() - lastProgress >= progressIntervalMs) {
      lastProgress = performance.now();
      report({ type: "state", itemId: command.itemId, state: "progress", positionMs: currentMs, durationMs: totalMs });
    }
  };
  window.addEventListener("message", onMessage);
  frame.addEventListener("load", () => {
    report({ type: "state", itemId: command.itemId, state: "frame-loaded" });
    post({ event: "listening", id: 1, channel: "widget" });
  });
  return {
    itemId: command.itemId,
    play: positionMs => {
      paused = false;
      if (currentMs === null || Math.abs(currentMs - positionMs) > driftToleranceMs) call("seekTo", [positionMs / 1000, true]);
      call("playVideo");
    },
    pause: () => { paused = true; call("pauseVideo"); },
    seek: positionMs => call("seekTo", [positionMs / 1000, true]),
    dispose: () => { window.clearTimeout(timeout); window.removeEventListener("message", onMessage); }
  };
}

function isYouTubeError(data: string): boolean {
  try { return (JSON.parse(data) as { event?: unknown }).event === "onError"; }
  // error-provenance: allow expected -- non-JSON provider messages are not errors
  catch { return false; }
}

/** Twitch exposes no message API here; the main process steers its `<video>` from outside the page. */
function twitchProvider(command: LoadCommand, frame: HTMLIFrameElement): Provider {
  frame.addEventListener("load", () => report({ type: "state", itemId: command.itemId, state: "frame-loaded" }));
  return { itemId: command.itemId, play: () => undefined, pause: () => undefined, seek: () => undefined, dispose: () => undefined };
}

function load(command: LoadCommand): void {
  if (command.source.provider === "direct") {
    const { provider: next, element } = directProvider(command);
    replaceProvider(next, element);
    return;
  }
  const frame = document.createElement("iframe");
  frame.allow = "autoplay; fullscreen";
  frame.referrerPolicy = "origin";
  frame.title = "Video player";
  const next = command.source.provider === "youtube" ? youtubeProvider(command, frame) : twitchProvider(command, frame);
  frame.src = command.url;
  replaceProvider(next, frame);
}

/* Capture and publishing. */

interface Connection {
  readonly connection: number;
  readonly pc: RTCPeerConnection;
  /** Diagnostics without receiver ids: media, then per video sender its scale, bitrate and frame rate caps. */
  summary: string;
}

let captured: MediaStream | null = null;
const connections = new Map<string, Connection>();
const captureSize = { width: 1920, height: 1080 };

function captureLive(): boolean {
  return captured !== null && captured.getTracks().length > 0 && captured.getTracks().every(track => track.readyState === "live");
}

/** Inspectable state for diagnostics and acceptance tests; receiver ids stay private. */
function describeConnections(): void {
  document.documentElement.dataset.mirrorPeers = [...connections.values()].map(entry => entry.summary).join(";");
}

function closeConnection(receiverId: string, entry: Connection): void {
  entry.pc.close();
  if (connections.get(receiverId) === entry) connections.delete(receiverId);
  describeConnections();
}

function closeAll(): void {
  for (const connection of connections.values()) connection.pc.close();
  connections.clear();
  describeConnections();
}

window.streamJamsStartCapture = async () => {
  if (captureLive()) return true;
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: videoMirrorFrameRate, width: captureSize.width, height: captureSize.height },
      // Music, not a call: no voice processing, keep stereo. The hidden player must not also play
      // its own sound locally, or every output is heard twice at different delays.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, suppressLocalAudioPlayback: true } as MediaTrackConstraints
    });
    closeAll();
    captured = stream;
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => {
        if (captured !== stream) return;
        captured = null;
        closeAll();
        report({ type: "capture", ok: false, reason: "capture-ended" });
      }, { once: true });
    }
    report({ type: "capture", ok: true });
    return true;
  } catch (error) {
    report({ type: "capture", ok: false, reason: error instanceof Error ? error.name.slice(0, 200) || "capture-failed" : "capture-failed" });
    return false;
  }
};

function sendToReceiver(receiverId: string, signal: Extract<VideoPlayerReport, { type: "signal" }>["signal"]): void {
  report({ type: "signal", receiverId, signal });
}

/**
 * Every receiver costs its own software encode (hardware acceleration is off), so each one
 * gets only what it plays: no video for the device output, no audio for the desktop overlay,
 * and video no larger than the picture it shows. Motion stays smooth under load: the encoder
 * lowers resolution before it drops frames.
 */
async function limitVideo(sender: RTCRtpSender, track: MediaStreamTrack, hello: VideoMirrorHello): Promise<string> {
  const settings = track.getSettings();
  const encoding = videoMirrorVideoEncoding({ width: settings.width ?? captureSize.width, height: settings.height ?? captureSize.height }, hello);
  const parameters = sender.getParameters();
  const first = parameters.encodings[0];
  if (first === undefined) return "unlimited";
  Object.assign(first, encoding);
  parameters.degradationPreference = "maintain-framerate";
  try { await sender.setParameters(parameters); }
  // error-provenance: allow expected -- a refused cap still mirrors, at the capture size, rather than leaving the receiver blank
  catch { return "unlimited"; }
  const applied = sender.getParameters();
  const used = applied.encodings[0];
  return [used?.scaleResolutionDownBy, used?.maxBitrate, used?.maxFramerate, applied.degradationPreference].join(",");
}

async function receiverSignal(receiverId: string, signal: VideoMirrorReceiverSignal): Promise<void> {
  const existing = connections.get(receiverId);
  if (signal.type === "bye") {
    if (existing !== undefined && (signal.connection === Number.MAX_SAFE_INTEGER || signal.connection === existing.connection)) closeConnection(receiverId, existing);
    return;
  }
  if (signal.type === "hello") {
    if (existing !== undefined) closeConnection(receiverId, existing);
    const media = signal.media ?? "both";
    const tracks = captured === null || !captureLive() ? [] : captured.getTracks().filter(track => media === "both" || track.kind === media);
    if (captured === null || tracks.length === 0 || connections.size >= maximumConnections) { sendToReceiver(receiverId, { type: "not-ready", connection: signal.connection }); return; }
    const stream = captured;
    const pc = new RTCPeerConnection({ iceServers: [...videoMirrorIceServers] });
    const entry: Connection = { connection: signal.connection, pc, summary: media };
    connections.set(receiverId, entry);
    pc.addEventListener("icecandidate", event => {
      const candidate = event.candidate;
      if (candidate === null || connections.get(receiverId) !== entry || !isLocalHostIceCandidate(candidate.candidate)) return;
      sendToReceiver(receiverId, { type: "ice", connection: entry.connection, candidate: {
        candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex, usernameFragment: candidate.usernameFragment
      } });
    });
    pc.addEventListener("connectionstatechange", () => {
      if ((pc.connectionState === "failed" || pc.connectionState === "closed") && connections.get(receiverId) === entry) closeConnection(receiverId, entry);
    });
    for (const track of tracks) {
      const sender = pc.addTrack(track, stream);
      if (track.kind === "video") entry.summary += `:${await limitVideo(sender, track, signal)}`;
    }
    if (connections.get(receiverId) !== entry) return;
    describeConnections();
    await pc.setLocalDescription(await pc.createOffer());
    const sdp = pc.localDescription?.sdp;
    if (connections.get(receiverId) === entry && sdp !== undefined) sendToReceiver(receiverId, { type: "offer", connection: entry.connection, sdp });
    return;
  }
  if (existing === undefined || existing.connection !== signal.connection) return;
  if (signal.type === "answer") { await existing.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp }); return; }
  await existing.pc.addIceCandidate({
    candidate: signal.candidate.candidate, sdpMid: signal.candidate.sdpMid ?? null, sdpMLineIndex: signal.candidate.sdpMLineIndex ?? null,
    usernameFragment: signal.candidate.usernameFragment ?? null
  });
}

bridge?.onCommand(command => {
  switch (command.type) {
    case "load": load(command); break;
    case "play": provider?.play(command.positionMs); break;
    case "pause": provider?.pause(); break;
    case "seek": provider?.seek(command.positionMs); break;
    case "stop": replaceProvider(null, null); break;
    case "signal":
      void receiverSignal(command.receiverId, command.signal).catch(
        // error-provenance: allow expected -- a failed negotiation closes that receiver's connection; it reconnects with backoff
        () => {
        const entry = connections.get(command.receiverId);
        if (entry === undefined || entry.connection !== command.signal.connection) return;
        closeConnection(command.receiverId, entry);
      });
      break;
  }
});
