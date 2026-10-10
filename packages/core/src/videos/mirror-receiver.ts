import {
  isLocalHostIceCandidate, videoMirrorIceServers, videoMirrorMaximumHeight, videoMirrorMaximumWidth,
  type VideoMirrorPublisherSignal, type VideoMirrorReceiverSignal, type VideoMirrorRequest
} from "./mirror.js";

/** Browser-side receiver for the desktop Videos mirror, shared by overlays and the desktop device output. */

/** How a receiver exchanges signaling with the desktop primary player: the overlay WebSocket or the desktop bridge. */
export interface VideoMirrorConnector {
  send(signal: VideoMirrorReceiverSignal): void;
  subscribe(listener: (signal: VideoMirrorPublisherSignal) => void): () => void;
}

export type VideoMirrorReceiverState = "connecting" | "playing" | "unavailable";

export interface VideoMirrorReceiverOptions {
  readonly connector: VideoMirrorConnector;
  readonly onStream: (stream: MediaStream | null) => void;
  readonly onState: (state: VideoMirrorReceiverState) => void;
  readonly createPeerConnection?: ((configuration: RTCConfiguration) => RTCPeerConnection) | undefined;
  readonly timers?: { setTimeout(callback: () => void, ms: number): unknown; clearTimeout(handle: unknown): void } | undefined;
  /** What this receiver needs, read for every hello. Without it the publisher sends sound and picture at capture size. */
  readonly request?: (() => VideoMirrorRequest) | undefined;
}

export interface VideoMirrorReceiver {
  /** Re-reads the request; reconnects only when it needs more than the current connection carries. */
  refresh(): void;
  stop(): void;
}

/** Bounded reconnect: 1 s doubling to 10 s, reset after a connection succeeds. */
export const videoMirrorRetryDelaysMs = [1_000, 2_000, 4_000, 8_000, 10_000] as const;
/** A hello with no offer by then is retried; it covers a dropped WebSocket or a restarted player. */
export const videoMirrorOfferTimeoutMs = 5_000;
/** A briefly disconnected peer often recovers on its own; after this it is replaced. */
export const videoMirrorDisconnectGraceMs = 3_000;
/** A request that grows waits this long so quick toggles or a dragged box reconnect once. */
export const videoMirrorUpgradeDelayMs = 500;
/** Consecutive failures before the receiver reports the mirror unavailable (it keeps retrying). */
const unavailableAfterFailures = 2;

/** The declared picture size in whole device pixels, within the schema's bounds; nothing when unknown. */
export function videoMirrorPictureSize(width: number, height: number): Pick<VideoMirrorRequest, "maxWidth" | "maxHeight"> {
  // Rounded: the publisher rounds its scale up, so the encode still never exceeds the box.
  const size = (value: number, limit: number) => Math.min(limit, Math.max(1, Math.round(value)));
  return width > 0 && height > 0 ? { maxWidth: size(width, videoMirrorMaximumWidth), maxHeight: size(height, videoMirrorMaximumHeight) } : {};
}

/** True when `next` needs sound, picture or picture size that `sent` did not ask for. Shrinking never reconnects. */
export function videoMirrorRequestGrew(sent: VideoMirrorRequest, next: VideoMirrorRequest): boolean {
  // Missing media is both; a missing size is unbounded; a receiver without picture needs no size.
  const needs = ({ media, maxWidth = Infinity, maxHeight = Infinity }: VideoMirrorRequest) =>
    media === "audio" ? [1, 0, 0] : [+(media !== "video"), maxWidth, maxHeight];
  const before = needs(sent);
  return needs(next).some((value, index) => value > before[index]!);
}

/** A candidate with every field present, absent ones as null, as both directions send and apply it. */
function iceCandidate({ candidate, sdpMid, sdpMLineIndex, usernameFragment }: {
  readonly candidate?: string | undefined; readonly sdpMid?: string | null | undefined;
  readonly sdpMLineIndex?: number | null | undefined; readonly usernameFragment?: string | null | undefined;
}): { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment: string | null } {
  return { candidate: candidate ?? "", sdpMid: sdpMid ?? null, sdpMLineIndex: sdpMLineIndex ?? null, usernameFragment: usernameFragment ?? null };
}

/**
 * Receives the desktop primary player's mirror over loopback WebRTC. Each attempt is
 * numbered so late messages from a replaced attempt are ignored. Every failure, close or
 * stalled offer reconnects with bounded backoff; `stop` releases everything.
 */
export function startVideoMirrorReceiver(options: VideoMirrorReceiverOptions): VideoMirrorReceiver {
  // The global timers, called as methods of globalThis.
  const timers: NonNullable<VideoMirrorReceiverOptions["timers"]> = options.timers ?? globalThis;
  const request = options.request ?? (() => ({}));
  const createPeerConnection = options.createPeerConnection ?? (configuration => new RTCPeerConnection(configuration));
  let connection = 0;
  let failures = 0;
  let peer: RTCPeerConnection | null = null;
  let stream: MediaStream | null = null;
  let timer: unknown = null;
  let upgradeTimer: unknown = null;
  let sent: VideoMirrorRequest = {};
  let state: VideoMirrorReceiverState | null = null;
  let stopped = false;

  const setState = (next: VideoMirrorReceiverState) => {
    if (state === next) return;
    state = next;
    options.onState(next);
  };
  const clearTimer = () => { if (timer !== null) { timers.clearTimeout(timer); timer = null; } };
  const schedule = (ms: number, work: () => void) => { clearTimer(); timer = timers.setTimeout(() => { timer = null; work(); }, ms); };
  const closePeer = () => {
    const current = peer;
    peer = null;
    if (current !== null) {
      current.ontrack = null; current.onicecandidate = null; current.onconnectionstatechange = null;
      current.close();
    }
    if (stream !== null) { stream = null; options.onStream(null); }
  };
  const attempt = () => {
    if (stopped) return;
    closePeer();
    connection += 1;
    const current = connection;
    sent = request();
    options.connector.send({ type: "hello", connection: current, ...sent });
    schedule(videoMirrorOfferTimeoutMs, () => { if (current === connection) retry(); });
  };
  const retry = () => {
    if (stopped) return;
    closePeer();
    failures += 1;
    setState(failures >= unavailableAfterFailures ? "unavailable" : "connecting");
    const delay = videoMirrorRetryDelaysMs[Math.min(failures - 1, videoMirrorRetryDelaysMs.length - 1)] ?? 10_000;
    schedule(delay, attempt);
  };
  const answer = async (current: number, sdp: string) => {
    closePeer();
    const next = createPeerConnection({ iceServers: [...videoMirrorIceServers] });
    peer = next;
    next.ontrack = event => {
      const received = event.streams[0] ?? null;
      // Attach once per stream: a second assignment would interrupt the first play().
      if (peer !== next || received === null || received === stream) return;
      stream = received;
      options.onStream(received);
    };
    next.onicecandidate = event => {
      if (peer !== next || event.candidate === null || !isLocalHostIceCandidate(event.candidate.candidate)) return;
      options.connector.send({ type: "ice", connection: current, candidate: iceCandidate(event.candidate.toJSON()) });
    };
    next.onconnectionstatechange = () => {
      if (peer !== next || current !== connection) return;
      const status = next.connectionState;
      if (status === "connected") { failures = 0; clearTimer(); setState("playing"); }
      else if (status === "failed" || status === "closed") retry();
      else if (status === "disconnected") schedule(videoMirrorDisconnectGraceMs, () => { if (peer === next && next.connectionState !== "connected") retry(); });
    };
    await next.setRemoteDescription({ type: "offer", sdp });
    const local = await next.createAnswer();
    await next.setLocalDescription(local);
    if (peer !== next || current !== connection || stopped) return;
    options.connector.send({ type: "answer", connection: current, sdp: next.localDescription?.sdp ?? local.sdp ?? "" });
  };

  const unsubscribe = options.connector.subscribe(signal => {
    if (stopped || signal.connection !== connection) return;
    if (signal.type === "not-ready") { retry(); return; }
    if (signal.type === "offer") {
      schedule(videoMirrorOfferTimeoutMs * 2, () => { if (signal.connection === connection && state !== "playing") retry(); });
      void answer(signal.connection, signal.sdp).catch(
        // error-provenance: allow expected -- a failed negotiation is retried with bounded backoff
        () => { if (signal.connection === connection) retry(); });
      return;
    }
    const current = peer;
    if (current !== null) void current.addIceCandidate(iceCandidate(signal.candidate)).catch(
      // error-provenance: allow expected -- a stale or unusable candidate is skipped; connection failure is handled by state changes
      () => undefined);
  });

  setState("connecting");
  attempt();
  return {
    refresh() {
      // Checked again after the delay: a toggle back within it needs no reconnect.
      const grew = () => !stopped && videoMirrorRequestGrew(sent, request());
      if (upgradeTimer === null && grew()) upgradeTimer = timers.setTimeout(() => {
        upgradeTimer = null;
        if (grew()) { failures = 0; attempt(); }
      }, videoMirrorUpgradeDelayMs);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimer();
      if (upgradeTimer !== null) timers.clearTimeout(upgradeTimer);
      unsubscribe();
      if (connection > 0) {
        try { options.connector.send({ type: "bye", connection }); }
        // error-provenance: allow cleanup -- the transport may already be closed during teardown
        catch { /* already gone */ }
      }
      closePeer();
    }
  };
}
