import { startVideoMirrorReceiver, videoMirrorPublisherSignalSchema, type VideoMirrorPublisherSignal } from "@stream-jams/core/videos";
import type { VideoDevicesCommand, VideoDevicesReport } from "./video-ipc.js";

/*
 * Hidden device-output receiver for the Videos mirror (OpenSpec add-video-request-queue 5.5).
 * It runs outside the captured player, so its sound is never captured back into the mirror.
 * It asks the publisher for sound only, so no video is encoded or decoded for it. Remote
 * WebRTC audio needs the stream attached to a media element, so it stays on a muted
 * `<video>`; each selected device gets its own AudioContext bound to that device, with a
 * per-device delay to line it up with OBS.
 */

declare global {
  interface Window {
    streamJamsVideoDevices?: {
      onCommand(callback: (command: VideoDevicesCommand) => void): () => void;
      report(report: VideoDevicesReport): void;
    };
  }
}

type Configure = Extract<VideoDevicesCommand, { type: "configure" }>;
interface DeviceGraph {
  readonly deviceId: string;
  readonly context: AudioContext;
  readonly source: MediaStreamAudioSourceNode;
  readonly delay: DelayNode;
  readonly gain: GainNode;
}

const bridge = window.streamJamsVideoDevices;
const video = document.createElement("video");
video.muted = true;
video.playsInline = true;
document.body.append(video);

let config: Configure = { type: "configure", muted: true, devices: [] };
let stream: MediaStream | null = null;
let graphs: DeviceGraph[] = [];
let build = 0;
const signalListeners = new Set<(signal: VideoMirrorPublisherSignal) => void>();

function dispose(graph: DeviceGraph): void {
  for (const node of [graph.source, graph.delay, graph.gain]) {
    try { node.disconnect(); }
    // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
    catch { /* Continue releasing the graph. */ }
  }
  void graph.context.close().catch(
    // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
    () => undefined);
}

function applyLevels(): void {
  const delays = new Map(config.devices.map(device => [device.deviceId, device.delayMs]));
  for (const graph of graphs) {
    graph.gain.gain.value = config.muted ? 0 : 1;
    graph.delay.delayTime.value = (delays.get(graph.deviceId) ?? 0) / 1000;
  }
  // Inspectable state without device ids, for diagnostics and acceptance tests.
  document.documentElement.dataset.outputs = String(graphs.length);
  document.documentElement.dataset.muted = String(config.muted);
  document.documentElement.dataset.delaysMs = graphs.map(graph => Math.round(graph.delay.delayTime.value * 1000)).join(",");
}

/** Rebuilds the per-device graphs when the stream or the device set changes; delay and mute apply in place. */
async function rebuild(): Promise<void> {
  const current = ++build;
  const wanted = config.devices.map(device => device.deviceId);
  const track = stream?.getAudioTracks()[0];
  const same = graphs.length === wanted.length && graphs.every((graph, index) => graph.deviceId === wanted[index]) && track !== undefined &&
    graphs.every(graph => graph.source.mediaStream.getAudioTracks()[0] === track);
  if (same) { applyLevels(); return; }
  for (const graph of graphs) dispose(graph);
  graphs = [];
  if (track === undefined || wanted.length === 0) { applyLevels(); return; }
  let failed = 0;
  const next: DeviceGraph[] = [];
  for (const device of config.devices) {
    try {
      const context = new AudioContext({ sinkId: device.deviceId, latencyHint: "playback" } as AudioContextOptions);
      const source = context.createMediaStreamSource(new MediaStream([track]));
      const delay = context.createDelay(1);
      const gain = context.createGain();
      source.connect(delay).connect(gain).connect(context.destination);
      next.push({ deviceId: device.deviceId, context, source, delay, gain });
      // A device that never starts must not hold up the others.
      await Promise.race([context.resume(), new Promise(resolve => window.setTimeout(resolve, 3000))]);
      if (context.state !== "running") failed += 1;
    }
    // error-provenance: allow expected -- an unavailable device is counted and reported as a failed output
    catch {
      failed += 1;
    }
    if (current !== build) { for (const graph of next) dispose(graph); return; }
  }
  graphs = next;
  applyLevels();
  bridge?.report({ type: "outputs", started: next.length - failed, failed });
}

const receiver = startVideoMirrorReceiver({
  connector: {
    send: signal => bridge?.report({ type: "signal", signal }),
    subscribe: listener => { signalListeners.add(listener); return () => { signalListeners.delete(listener); }; }
  },
  onStream: next => {
    stream = next;
    video.srcObject = next;
    if (next !== null) void video.play().catch(
      // error-provenance: allow expected -- the muted holder element only keeps the stream flowing; device audio comes from Web Audio
      () => undefined);
    void rebuild();
  },
  onState: () => undefined,
  request: () => ({ media: "audio" })
});

bridge?.onCommand(command => {
  if (command.type === "signal") {
    const parsed = videoMirrorPublisherSignalSchema.safeParse(command.signal);
    if (parsed.success) for (const listener of signalListeners) listener(parsed.data);
    return;
  }
  config = command;
  void rebuild();
});

window.addEventListener("pagehide", () => {
  receiver.stop();
  for (const graph of graphs) dispose(graph);
  graphs = [];
}, { once: true });
