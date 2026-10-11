import { describe, expect, it } from "vitest";
import {
  startVideoMirrorReceiver, videoMirrorOfferTimeoutMs, videoMirrorPictureSize, videoMirrorRequestGrew, videoMirrorUpgradeDelayMs,
  type VideoMirrorReceiverState
} from "./mirror-receiver.js";
import type { VideoMirrorPublisherSignal, VideoMirrorReceiverSignal, VideoMirrorRequest } from "./mirror.js";

class FakeTimers {
  now = 0;
  #timers: { at: number; callback: () => void; id: number }[] = [];
  #next = 1;
  setTimeout = (callback: () => void, ms: number) => { const id = this.#next++; this.#timers.push({ at: this.now + ms, callback, id }); return id; };
  clearTimeout = (handle: unknown) => { this.#timers = this.#timers.filter(timer => timer.id !== handle); };
  advance(ms: number) {
    const target = this.now + ms;
    for (;;) {
      const due = this.#timers.filter(timer => timer.at <= target).sort((a, b) => a.at - b.at)[0];
      if (due === undefined) break;
      this.#timers = this.#timers.filter(timer => timer !== due);
      this.now = due.at;
      due.callback();
    }
    this.now = target;
  }
  get pending() { return this.#timers.length; }
}

class FakePeer {
  connectionState: RTCPeerConnectionState = "new";
  closed = false;
  localDescription: { sdp: string } | null = null;
  readonly candidates: unknown[] = [];
  ontrack: ((event: { streams: unknown[] }) => void) | null = null;
  onicecandidate: ((event: { candidate: { candidate: string; toJSON(): object } | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  constructor(readonly configuration: RTCConfiguration) {}
  async setRemoteDescription() {}
  async createAnswer() { return { type: "answer", sdp: "answer-sdp" }; }
  async setLocalDescription(description: { sdp: string }) { this.localDescription = description; }
  async addIceCandidate(candidate: unknown) { this.candidates.push(candidate); }
  close() { this.closed = true; }
  state(next: RTCPeerConnectionState) { this.connectionState = next; this.onconnectionstatechange?.(); }
}

function setup(request?: () => VideoMirrorRequest) {
  const timers = new FakeTimers();
  const sent: VideoMirrorReceiverSignal[] = [];
  const listeners = new Set<(signal: VideoMirrorPublisherSignal) => void>();
  const peers: FakePeer[] = [];
  const states: VideoMirrorReceiverState[] = [];
  const streams: unknown[] = [];
  const receiver = startVideoMirrorReceiver({
    connector: { send: signal => { sent.push(signal); }, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } },
    onStream: stream => streams.push(stream),
    onState: state => states.push(state),
    createPeerConnection: configuration => { const peer = new FakePeer(configuration); peers.push(peer); return peer as unknown as RTCPeerConnection; },
    timers,
    request
  });
  const deliver = (signal: VideoMirrorPublisherSignal) => { for (const listener of listeners) listener(signal); };
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  return { receiver, timers, sent, listeners, peers, states, streams, deliver, flush };
}

describe("startVideoMirrorReceiver", () => {
  it("says hello, answers an offer with a loopback-only peer and plays the stream", async () => {
    const { sent, peers, states, streams, deliver, flush } = setup();
    expect(sent).toEqual([{ type: "hello", connection: 1 }]);
    expect(states).toEqual(["connecting"]);
    deliver({ type: "offer", connection: 1, sdp: "offer-sdp" });
    await flush();
    expect(peers[0]!.configuration).toEqual({ iceServers: [] });
    expect(sent.at(-1)).toEqual({ type: "answer", connection: 1, sdp: "answer-sdp" });
    const stream = { id: "stream" };
    peers[0]!.ontrack?.({ streams: [stream] });
    peers[0]!.ontrack?.({ streams: [stream] });
    expect(streams).toEqual([stream]);
    peers[0]!.state("connected");
    expect(states).toEqual(["connecting", "playing"]);
  });

  it("sends only local host candidates and applies the publisher's candidates", async () => {
    const { sent, peers, deliver, flush } = setup();
    deliver({ type: "offer", connection: 1, sdp: "offer-sdp" });
    await flush();
    const local = "candidate:1 1 udp 2122260223 192.168.1.20 52000 typ host generation 0";
    const reflexive = "candidate:2 1 udp 1686052607 203.0.113.9 52000 typ srflx raddr 192.168.1.20 rport 52000";
    for (const candidate of [local, reflexive]) peers[0]!.onicecandidate?.({ candidate: { candidate, toJSON: () => ({ candidate, sdpMid: "0", sdpMLineIndex: 0 }) } });
    expect(sent.filter(signal => signal.type === "ice")).toEqual([{ type: "ice", connection: 1, candidate: { candidate: local, sdpMid: "0", sdpMLineIndex: 0, usernameFragment: null } }]);
    deliver({ type: "ice", connection: 1, candidate: { candidate: "candidate:3 1 udp 1 127.0.0.1 5000 typ host" } });
    await flush();
    expect(peers[0]!.candidates).toEqual([{ candidate: "candidate:3 1 udp 1 127.0.0.1 5000 typ host", sdpMid: null, sdpMLineIndex: null, usernameFragment: null }]);
  });

  it("ignores messages for an earlier attempt", async () => {
    const { sent, peers, deliver, timers, flush } = setup();
    timers.advance(videoMirrorOfferTimeoutMs);
    timers.advance(1000);
    expect(sent.filter(signal => signal.type === "hello").map(signal => signal.connection)).toEqual([1, 2]);
    deliver({ type: "offer", connection: 1, sdp: "late" });
    await flush();
    expect(peers).toHaveLength(0);
  });

  it("retries with bounded backoff and reports unavailable after repeated failures", () => {
    const { sent, states, deliver, timers } = setup();
    deliver({ type: "not-ready", connection: 1 });
    expect(states.at(-1)).toBe("connecting");
    timers.advance(1000);
    deliver({ type: "not-ready", connection: 2 });
    expect(states.at(-1)).toBe("unavailable");
    timers.advance(2000);
    for (let attempt = 3; attempt < 12; attempt += 1) { deliver({ type: "not-ready", connection: attempt }); timers.advance(10_000); }
    const hellos = sent.filter(signal => signal.type === "hello");
    expect(hellos.length).toBe(12);
    expect(timers.pending).toBe(1);
  });

  it("replaces a failed or stalled connection and recovers after success", async () => {
    const { sent, peers, states, deliver, timers, flush } = setup();
    deliver({ type: "offer", connection: 1, sdp: "offer" });
    await flush();
    peers[0]!.state("connected");
    peers[0]!.state("disconnected");
    timers.advance(3000);
    expect(peers[0]!.closed).toBe(true);
    expect(states.at(-1)).toBe("connecting");
    timers.advance(1000);
    expect(sent.at(-1)).toEqual({ type: "hello", connection: 2 });
    deliver({ type: "offer", connection: 2, sdp: "offer" });
    await flush();
    peers[1]!.state("failed");
    expect(peers[1]!.closed).toBe(true);
  });

  it("says bye and releases everything on stop", async () => {
    const { receiver, sent, peers, listeners, deliver, timers, streams, flush } = setup();
    deliver({ type: "offer", connection: 1, sdp: "offer" });
    await flush();
    peers[0]!.ontrack?.({ streams: [{ id: "s" }] });
    receiver.stop();
    receiver.stop();
    expect(sent.at(-1)).toEqual({ type: "bye", connection: 1 });
    expect(sent.filter(signal => signal.type === "bye")).toHaveLength(1);
    expect(peers[0]!.closed).toBe(true);
    expect(streams.at(-1)).toBeNull();
    expect(listeners.size).toBe(0);
    expect(timers.pending).toBe(0);
  });
});

describe("receiver requests", () => {
  it("declares its media and picture size in every hello", () => {
    let request: VideoMirrorRequest = { media: "video", maxWidth: 1382, maxHeight: 778 };
    const { sent, deliver, timers } = setup(() => request);
    expect(sent).toEqual([{ type: "hello", connection: 1, media: "video", maxWidth: 1382, maxHeight: 778 }]);
    request = { media: "audio" };
    deliver({ type: "not-ready", connection: 1 });
    timers.advance(1000);
    expect(sent.at(-1)).toEqual({ type: "hello", connection: 2, media: "audio" });
  });

  it("reconnects once, after a short delay, when it needs sound or a bigger picture", async () => {
    let request: VideoMirrorRequest = { media: "video", maxWidth: 640, maxHeight: 360 };
    const { receiver, sent, peers, states, deliver, timers, flush } = setup(() => request);
    deliver({ type: "offer", connection: 1, sdp: "offer" });
    await flush();
    peers[0]!.state("connected");
    request = { media: "both", maxWidth: 640, maxHeight: 360 };
    receiver.refresh();
    receiver.refresh();
    timers.advance(videoMirrorUpgradeDelayMs - 1);
    expect(sent.filter(signal => signal.type === "hello")).toHaveLength(1);
    timers.advance(1);
    expect(sent.at(-1)).toEqual({ type: "hello", connection: 2, media: "both", maxWidth: 640, maxHeight: 360 });
    expect(peers[0]!.closed).toBe(true);
    expect(states.at(-1)).toBe("playing");
    deliver({ type: "offer", connection: 2, sdp: "offer" });
    await flush();
    peers[1]!.state("connected");
    request = { media: "both", maxWidth: 1280, maxHeight: 720 };
    receiver.refresh();
    timers.advance(videoMirrorUpgradeDelayMs);
    expect(sent.at(-1)).toEqual({ type: "hello", connection: 3, media: "both", maxWidth: 1280, maxHeight: 720 });
  });

  it("does not reconnect when it needs less, or when a change is undone within the delay", async () => {
    let request: VideoMirrorRequest = { media: "both", maxWidth: 1280, maxHeight: 720 };
    const { receiver, sent, peers, deliver, timers, flush } = setup(() => request);
    deliver({ type: "offer", connection: 1, sdp: "offer" });
    await flush();
    peers[0]!.state("connected");
    request = { media: "video", maxWidth: 640, maxHeight: 360 };
    receiver.refresh();
    timers.advance(videoMirrorUpgradeDelayMs * 4);
    // Muted then unmuted again quickly: the connection still carries sound.
    request = { media: "both", maxWidth: 1280, maxHeight: 720 };
    receiver.refresh();
    timers.advance(videoMirrorUpgradeDelayMs * 4);
    expect(sent.filter(signal => signal.type === "hello")).toHaveLength(1);
    expect(peers[0]!.closed).toBe(false);
  });

  it("cancels a pending reconnect on stop and ignores refresh without a request", () => {
    let request: VideoMirrorRequest = { media: "video" };
    const { receiver, sent, timers } = setup(() => request);
    request = { media: "both" };
    receiver.refresh();
    receiver.stop();
    receiver.refresh();
    expect(timers.pending).toBe(0);
    expect(sent.filter(signal => signal.type === "hello")).toHaveLength(1);
    const plain = setup();
    plain.receiver.refresh();
    expect(plain.timers.pending).toBe(1); // Only the offer timeout.
    expect(plain.sent).toEqual([{ type: "hello", connection: 1 }]);
  });
});

describe("videoMirrorRequestGrew", () => {
  it("treats missing media as both and a missing size as unbounded", () => {
    expect(videoMirrorRequestGrew({ media: "audio" }, { media: "both" })).toBe(true);
    expect(videoMirrorRequestGrew({ media: "audio" }, {})).toBe(true);
    expect(videoMirrorRequestGrew({ media: "video" }, { media: "audio" })).toBe(true);
    expect(videoMirrorRequestGrew({}, { media: "audio" })).toBe(false);
    expect(videoMirrorRequestGrew({ maxWidth: 640, maxHeight: 360 }, {})).toBe(true);
    expect(videoMirrorRequestGrew({}, { maxWidth: 640, maxHeight: 360 })).toBe(false);
    expect(videoMirrorRequestGrew({ maxWidth: 640, maxHeight: 360 }, { maxWidth: 640, maxHeight: 361 })).toBe(true);
    // Size does not matter to a receiver that wants no picture.
    expect(videoMirrorRequestGrew({ media: "audio", maxWidth: 10 }, { media: "audio", maxWidth: 1000 })).toBe(false);
  });
});

describe("videoMirrorPictureSize", () => {
  it("rounds to whole pixels within the schema bounds and drops unknown sizes", () => {
    expect(videoMirrorPictureSize(1382, 777.375)).toEqual({ maxWidth: 1382, maxHeight: 777 });
    expect(videoMirrorPictureSize(853.3333, 480.0000001)).toEqual({ maxWidth: 853, maxHeight: 480 });
    expect(videoMirrorPictureSize(0.2, 0.1)).toEqual({ maxWidth: 1, maxHeight: 1 });
    expect(videoMirrorPictureSize(7680, 4320)).toEqual({ maxWidth: 3840, maxHeight: 2160 });
    expect(videoMirrorPictureSize(0, 360)).toEqual({});
    expect(videoMirrorPictureSize(Number.NaN, 360)).toEqual({});
  });
});
