import { isExplicitAudioOutputDeviceId } from "./audio-player-policy.js";
import { deviceAudioResultSchema, privateAudioMediaUrl, serializeException } from "@stream-jams/core";
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

const toneReference = { protocolVersion: 1 as const, handle: `private_${"T".repeat(43)}`, snapshot: { assetId: "tone", version: "0".repeat(64), mimeType: "audio/wav" as const, sizeBytes: 48044, durationMs: 1000 } };
const player = new DeviceAudioPlayer({
  createElement(source) {
    const element = new Audio(source);
    document.body.append(element);
    return element as PlayerMediaElement;
  },
  async createAmplifier(element, deviceId) {
    const context = new AudioContext();
    const routed = context as AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };
    if (routed.setSinkId === undefined) { await context.close(); throw new Error("Amplified explicit audio output is unavailable."); }
    await routed.setSinkId(deviceId);
    const source = context.createMediaElementSource(element as HTMLMediaElement);
    const gain = context.createGain();
    source.connect(gain); gain.connect(context.destination);
    await context.resume();
    return {
      setGain(value: number) { gain.gain.value = Math.max(0, Math.min(2, value)); },
      dispose() {
        try { source.disconnect(); }
        // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
        catch { /* Continue releasing the graph. */ }
        try { gain.disconnect(); }
        // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
        catch { /* Continue releasing the graph. */ }
        void context.close().catch(
        // error-provenance: allow cleanup -- teardown must continue after this best-effort cleanup step
        () => {});
      }
    };
  },
  createSource: asset => asset.reference.handle === toneReference.handle ? "stream-jams-audio://player/tone.wav" : privateAudioMediaUrl(asset.reference),
  revokeSource: () => {},
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
    if (request.command.moduleMutes !== undefined) player.setModuleMutes(request.command.moduleMutes);
  } else if (request.generation !== generation) return;
  const reply = (result: AudioRendererReply["result"], exception?: AudioRendererReply["exception"]) => bridge.report({ protocolVersion: 1, generation: request.generation, requestId: request.requestId, result, ...(exception === undefined ? {} : { exception }) });
  void (async () => {
    switch (request.command.type) {
      case "test": await playTone(request.command.deviceId); reply({ type: "ok" }); break;
      case "enumerate": reply({ type: "devices", devices: await listOutputDevices() }); break;
      case "prepare": await player.prepare(request.command.token, { generation, ...request.command.payload }); reply({ type: "prepared", token: request.command.token }); break;
      case "start": reply({ type: "played", ...deviceAudioResultSchema.parse(await player.start(request.command.token, request.command.startsAtEpochMs)) }); break;
      case "play": reply({ type: "played", ...deviceAudioResultSchema.parse(await player.play({ generation, ...request.command.payload })) }); break;
      case "stop": player.stop(request.command.playbackId); reply({ type: "ok" }); break;
      case "set-muted": player.setMuted(request.command.muted); reply({ type: "ok" }); break;
      case "set-module-mutes": player.setModuleMutes(request.command.moduleMutes); reply({ type: "ok" }); break;
      case "initialize": reply({ type: "ok" }); break;
    }
  })().catch((error: unknown) => { player.close(); reply(null, serializeException(error)); });
});
navigator.mediaDevices.addEventListener("devicechange", () => { void player.reconcileDevices(); });
window.addEventListener("pagehide", () => player.close());

// A fixed packaged tone exercises routing without moving registered media bodies.
async function playTone(deviceId: string, volume = 0.25, deviceIds: readonly string[] = [deviceId]): Promise<void> {
  const result = await player.play({ generation, batch: {
    playbackId: crypto.randomUUID(), documentId: "route-test", durationMs: 1000, muted: false,
    layers: [{ sourceKind: "audio", layerId: "tone", assetId: "tone", volume }],
    destinations: [...new Set(deviceIds)].map(id => ({ deviceId: id, routeIds: ["route-test"] }))
  }, assets: [{ assetId: "tone", reference: toneReference }], deadlineMs: Date.now() + 1000 });
  if (result.failedRouteIds.length > 0) throw new Error("The explicit output could not complete the test tone.");
}
async function playFixture(request: { source: string; deviceIds: readonly string[]; volume: number }): Promise<void> {
  if (request.source !== "stream-jams-audio://player/tone.wav" || !Number.isFinite(request.volume) || request.volume < 0 || request.volume > 2 || request.deviceIds.length === 0 || request.deviceIds.length > 16) throw new Error("Only the fixed packaged tone is available.");
  await playTone(request.deviceIds[0]!, request.volume, request.deviceIds);
}
window.streamJamsAudioCapability = Object.freeze({ listOutputDevices, playFixture });
