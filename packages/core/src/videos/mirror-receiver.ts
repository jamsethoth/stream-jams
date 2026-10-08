import { isLocalHostIceCandidate, videoMirrorIceServers, type VideoMirrorPublisherSignal, type VideoMirrorReceiverSignal } from "./mirror.js";

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
}

/** Bounded reconnect: 1 s doubling to 10 s, reset after a connection succeeds. */
export const videoMirrorRetryDelaysMs = [1_000, 2_000, 4_000, 8_000, 10_000] as const;
/** A hello with no offer by then is retried; it covers a dropped WebSocket or a restarted player. */
export const videoMirrorOfferTimeoutMs = 5_000;
/** A briefly disconnected peer often recovers on its own; after this it is replaced. */
export const videoMirrorDisconnectGraceMs = 3_000;
/** Consecutive failures before the receiver reports the mirror unavailable (it keeps retrying). */
const unavailableAfterFailures = 2;

/**
 * Receives the desktop primary player's mirror over loopback WebRTC. Each attempt is
 * numbered so late messages from a replaced attempt are ignored. Every failure, close or
 * stalled offer reconnects with bounded backoff; `stop` releases everything.
 */
export function startVideoMirrorReceiver(options: VideoMirrorReceiverOptions): { stop(): void } {
  const timers = options.timers ?? { setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms), clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>) };
  const createPeerConnection = options.createPeerConnection ?? (configuration => new RTCPeerConnection(configuration));
  let connection = 0;
  let failures = 0;
  let peer: RTCPeerConnection | null = null;
  let stream: MediaStream | null = null;
  let timer: unknown = null;
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
    options.connector.send({ type: "hello", connection: current });
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
      const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = event.candidate.toJSON();
      options.connector.send({ type: "ice", connection: current, candidate: { candidate: candidate ?? "", sdpMid: sdpMid ?? null, sdpMLineIndex: sdpMLineIndex ?? null, usernameFragment: usernameFragment ?? null } });
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
    const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = signal.candidate;
    if (current !== null) void current.addIceCandidate({ candidate, sdpMid: sdpMid ?? null, sdpMLineIndex: sdpMLineIndex ?? null, usernameFragment: usernameFragment ?? null }).catch(
      // error-provenance: allow expected -- a stale or unusable candidate is skipped; connection failure is handled by state changes
      () => undefined);
  });

  setState("connecting");
  attempt();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimer();
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
