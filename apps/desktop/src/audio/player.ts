import { isExplicitAudioOutputDeviceId } from "./audio-player-policy.js";
import { DeviceAudioPlayer, type PlayerMediaElement } from "./device-audio-player.js";
import { audioRendererRequestSchema, type AudioRendererReply, type AudioRendererRequest } from "./audio-ipc.js";

declare global {
  interface Window {
    streamJamsAudioHost?: {
      readonly isolated: boolean;
      onCommand(callback: (request: AudioRendererRequest) => void): () => void;
      report(reply: AudioRendererReply): void;
    };
    streamJamsAudioCapability?: {
      listOutputDevices: typeof listOutputDevices;
      playFixture: typeof playFixture;
    };
  }
}

async function listOutputDevices() {
  return (await navigator.mediaDevices.enumerateDevices())
    .filter(device => device.kind === "audiooutput" && isExplicitAudioOutputDeviceId(device.deviceId))
    .map(({ deviceId, label }) => ({ deviceId, label: label || "Unlabelled output" }));
}

const player = new DeviceAudioPlayer({
  createElement(source) {
    const element = new Audio(source);
    document.body.append(element);
    return element as PlayerMediaElement;
  },
  createSource: asset => URL.createObjectURL(new Blob([new Uint8Array(asset.bytes)], { type: asset.mimeType })),
  revokeSource: source => URL.revokeObjectURL(source),
  listOutputDevices
});
let generation = 0;
const bridge = window.streamJamsAudioHost;
bridge?.onCommand(candidate => {
  const parsed = audioRendererRequestSchema.safeParse(candidate);
  if (!parsed.success) return;
  const request = parsed.data;
  if (request.command.type === "initialize") {
    if (request.generation < generation) return;
    generation = request.generation;
    player.initialize(generation, request.command.muted);
  } else if (request.generation !== generation) return;
  const reply = (result: AudioRendererReply["result"]) => bridge.report({ generation: request.generation, requestId: request.requestId, result });
  void (async () => {
    switch (request.command.type) {
      case "enumerate": reply({ type: "devices", devices: await listOutputDevices() }); break;
      case "play": reply({ type: "played", failedRouteIds: [...(await player.play({ generation, ...request.command.payload })).failedRouteIds] }); break;
      case "stop": player.stop(request.command.playbackId); reply({ type: "ok" }); break;
      case "set-muted": player.setMuted(request.command.muted); reply({ type: "ok" }); break;
      case "initialize": reply({ type: "ok" }); break;
    }
  })().catch(() => { player.close(); reply(null); });
});
navigator.mediaDevices.addEventListener("devicechange", () => { void player.reconcileDevices(); });
window.addEventListener("pagehide", () => player.close());

// Retain the bounded packaged capability harness, using the production engine
// and its authoritative mute state rather than a second unmanaged audio path.
async function playFixture(request: { source: string; deviceIds: readonly string[]; volume: number }): Promise<void> {
  const match = /^data:audio\/wav;base64,([A-Za-z0-9+/=]+)$/.exec(request.source);
  if (match === null || request.source.length > 36 * 1024 * 1024 || generation === 0) throw new Error("A bounded WAV fixture and initialized audio host are required.");
  const bytes = Uint8Array.from(atob(match[1]!), char => char.charCodeAt(0));
  const result = await player.play({ generation, batch: {
    playbackId: crypto.randomUUID(), documentId: "capability-fixture", durationMs: 30_000, muted: false,
    layers: [{ layerId: "fixture", assetId: "fixture", volume: request.volume }],
    destinations: [...new Set(request.deviceIds)].map(deviceId => ({ deviceId, routeIds: [deviceId] }))
  }, assets: [{ assetId: "fixture", mimeType: "audio/wav", bytes }], deadlineMs: Date.now() + 30_000 });
  if (result.failedRouteIds.length > 0) throw new Error("An explicit output could not complete the fixture.");
}
window.streamJamsAudioCapability = Object.freeze({ listOutputDevices, playFixture });
