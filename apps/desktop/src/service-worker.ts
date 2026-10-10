import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import type {} from "electron";
import { resolve } from "node:path";
import { LocalRuntimeStartupError, startLocalRuntime, type StartedLocalRuntime } from "@stream-jams/server/runtime";
import { workerRequestSchema, type WorkerMessage } from "./desktop-ipc.js";
import { WorkerAudioClient } from "./audio/worker-audio-client.js";
import { WorkerOverlayClient } from "./overlay/worker-overlay-client.js";
import { WorkerVideoClient } from "./videos/worker-video-client.js";
import { serializeException } from "@stream-jams/core";

const parent = process.parentPort;
if (parent == null) throw new Error("The service worker requires an owned utility process.");
let generation: number | null = null;
let runtime: Promise<StartedLocalRuntime> | null = null;
let stopping = false;
let audio: WorkerAudioClient | null = null;
let overlay: WorkerOverlayClient | null = null;
let video: WorkerVideoClient | null = null;
function send(message: WorkerMessage): void { parent!.postMessage(message); }

parent.on("message", ({ data }: { data: unknown }) => {
  const parsed = workerRequestSchema.safeParse(data);
  if (!parsed.success) return;
  const request = parsed.data;
  if (request.type === "audio-response") { audio?.receive(request); return; }
  if (request.type === "overlay-response") { overlay?.receive(request); return; }
  if (request.type === "video-event") { video?.receive(request); return; }
  if (request.type === "start") {
    if (runtime !== null || stopping) return;
    generation = request.generation;
    audio = new WorkerAudioClient(generation, send);
    overlay = new WorkerOverlayClient(generation, send);
    video = new WorkerVideoClient(generation, send);
    runtime = startLocalRuntime({
      homeDirectory: homedir(),
      webBuildDirectory: resolve(import.meta.dirname, "../web"),
      desktopAudioTransport: audio,
      desktopOverlayTransport: overlay,
      desktopVideoTransport: video,
      desktopHost: {
        onConfigChanged(config) { send({ type: "desktop-config-changed", generation: request.generation, requestId: null, closeToTray: config.closeToTray, gpuAcceleration: config.gpuAcceleration }); },
        onPlaybackStateChanged(state) { send({ type: "playback-state-changed", generation: request.generation, requestId: null, muted: state.muted }); }
      }
    });
    void runtime.then(async (started) => {
      if (stopping) return;
      const { desktop } = await started.composition.configStore.readConfig();
      send({ type: "ready", generation: request.generation, requestId: request.requestId, url: started.url, closeToTray: desktop.closeToTray, gpuAcceleration: desktop.gpuAcceleration, muted: started.composition.playbackOperationsService.getSnapshot().muted });
      // The player page is served from the service origin, which the main process learns from "ready".
      video?.start();
    }).catch((error: unknown) => {
      audio?.dispose();
      overlay?.dispose();
      video?.dispose();
      send({ type: "failed", generation: request.generation, requestId: request.requestId, referenceId: `err_${randomUUID()}`, exception: serializeException(error), message: error instanceof LocalRuntimeStartupError ? error.message : "The local service could not start. Check the configured data paths and runtime dependencies, then retry." });
    });
    return;
  }
  if (request.generation !== generation || runtime === null) return;
  if (request.type === "stop") {
    if (stopping) return;
    stopping = true;
    void runtime.then((started) => started.close()).then(() => {
      audio?.dispose();
      overlay?.dispose();
      video?.dispose();
      send({ type: "stopped", generation: request.generation, requestId: request.requestId });
      process.exit(0);
    }).catch((error: unknown) => {
      audio?.dispose();
      overlay?.dispose();
      video?.dispose();
      send({ type: "command-failed", generation: request.generation, requestId: request.requestId, referenceId: `err_${randomUUID()}`, exception: serializeException(error), message: "The local service could not stop cleanly." });
      process.exit(1);
    });
    return;
  }
  if (stopping) return;
  if (request.type === "record-diagnostic") {
    void runtime.then(({ composition }) => composition.recordDesktopDiagnostic(request.report)).then(() => {
      send({ type: "diagnostic-recorded", generation: request.generation, requestId: request.requestId });
    }).catch((error: unknown) => {
      send({ type: "command-failed", generation: request.generation, requestId: request.requestId, referenceId: request.report.referenceId, exception: serializeException(error), message: "The desktop diagnostic could not be written to the runtime log." });
    });
    return;
  }
  void runtime.then(async ({ composition }) => {
    const result = await composition.playbackOperationsService.setSafety({ muted: request.muted });
    send({ type: "playback-state-changed", generation: request.generation, requestId: request.requestId, muted: result.muted });
  }).catch((error: unknown) => send({ type: "command-failed", generation: request.generation, requestId: request.requestId, referenceId: `err_${randomUUID()}`, exception: serializeException(error), message: "Mute could not be saved. Check the operator controls and data-directory permissions." }));
});
