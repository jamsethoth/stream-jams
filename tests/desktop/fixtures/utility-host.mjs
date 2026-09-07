import { app, utilityProcess } from "electron";
import { randomUUID } from "node:crypto";
import process from "node:process";

// A test-only host for the real bundled worker: no HTTP test bypass, live
// profile, renderer, or production startup diagnostics are introduced.
app.setPath("userData", process.env.STREAM_JAMS_DESKTOP_USER_DATA_PATH);
const workerPath = process.argv.at(-1);
globalThis.workerObservation = { messages: [], stderr: "", exited: false, workerPath, exitCode: null };
app.on("window-all-closed", () => {});
app.whenReady().then(() => {
  const worker = utilityProcess.fork(workerPath, [], { stdio: "pipe" });
  globalThis.ownedWorker = worker;
  worker.stderr.on("data", (chunk) => {
    globalThis.workerObservation.stderr = (globalThis.workerObservation.stderr + chunk).slice(-4000);
  });
  worker.on("message", (message) => {
    globalThis.workerObservation.messages.push(message);
    // This worker-only fixture has no audio renderer. Acknowledge just the
    // required lifecycle controls; never claim that playback was performed.
    if (message.type === "audio-request") {
      const lifecycle = message.command.type === "set-muted" || message.command.type === "close";
      worker.postMessage({
        type: "audio-response", generation: message.generation,
        requestId: message.requestId, result: lifecycle ? { type: "ok" } : null
      });
    }
  });
  worker.on("exit", (code) => { globalThis.workerObservation.exited = true; globalThis.workerObservation.exitCode = code; });
  worker.postMessage({ type: "start", generation: 1, requestId: randomUUID() });
});
