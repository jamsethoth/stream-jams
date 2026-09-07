import { homedir } from "node:os";
import type {} from "electron";
import { resolve } from "node:path";
import { LocalRuntimeStartupError, startLocalRuntime, type StartedLocalRuntime } from "@stream-jams/server/runtime";
import { workerRequestSchema, type WorkerMessage } from "./desktop-ipc.js";
import { WorkerAudioClient } from "./audio/worker-audio-client.js";

const parent = process.parentPort;
if (parent == null) throw new Error("The service worker requires an owned utility process.");
let generation: number | null = null;
let runtime: Promise<StartedLocalRuntime> | null = null;
let stopping = false;
let audio: WorkerAudioClient | null = null;
function send(message: WorkerMessage): void { parent!.postMessage(message); }

parent.on("message", ({ data }: { data: unknown }) => {
  const parsed = workerRequestSchema.safeParse(data);
  if (!parsed.success) return;
  const request = parsed.data;
  if (request.type === "audio-response") { audio?.receive(request); return; }
  if (request.type === "start") {
    if (runtime !== null || stopping) return;
    generation = request.generation;
    audio = new WorkerAudioClient(generation, send);
    runtime = startLocalRuntime({
      homeDirectory: homedir(),
      webBuildDirectory: resolve(import.meta.dirname, "../web"),
      desktopAudioTransport: audio,
      desktopHost: {
        onConfigChanged(config) { send({ type: "desktop-config-changed", generation: request.generation, requestId: null, closeToTray: config.closeToTray }); },
        onPlaybackStateChanged(state) { send({ type: "playback-state-changed", generation: request.generation, requestId: null, muted: state.muted }); }
      }
    });
    void runtime.then(async (started) => {
      if (stopping) return;
      const { desktop } = await started.composition.configStore.readConfig();
      send({ type: "ready", generation: request.generation, requestId: request.requestId, url: started.url, closeToTray: desktop.closeToTray, muted: started.composition.playbackCoordinator.getSnapshot().muted });
    }).catch((error: unknown) => {
      audio?.dispose();
      send({ type: "failed", generation: request.generation, requestId: request.requestId, message: error instanceof LocalRuntimeStartupError ? error.message : "The local service could not start. Check the configured data paths and runtime dependencies, then retry." });
    });
    return;
  }
  if (request.generation !== generation || runtime === null) return;
  if (request.type === "stop") {
    if (stopping) return;
    stopping = true;
    void runtime.then((started) => started.close()).then(() => {
      audio?.dispose();
      send({ type: "stopped", generation: request.generation, requestId: request.requestId });
      process.exit(0);
    }).catch(() => { audio?.dispose(); process.exit(1); });
    return;
  }
  if (stopping) return;
  void runtime.then(async ({ composition }) => {
    const result = request.muted ? await composition.playbackCoordinator.mute() : await composition.playbackCoordinator.unmute();
    send({ type: "playback-state-changed", generation: request.generation, requestId: request.requestId, muted: result.muted });
  }).catch(() => send({ type: "command-failed", generation: request.generation, requestId: request.requestId, message: "Mute could not be saved. Check the operator controls and data-directory permissions." }));
});
