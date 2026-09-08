import { app, BrowserWindow, protocol, session, utilityProcess } from "electron";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";

// Developer-only reduction: no Stream Jams imports in windows/audio stages.
const stage = process.env.STREAM_JAMS_DIAG_STAGE;
const profile = process.env.STREAM_JAMS_DESKTOP_USER_DATA_PATH;
if (!["windows", "audio", "service"].includes(stage) || !profile || !isAbsolute(profile)) throw new Error("An explicit stage and isolated absolute profile are required");
app.setPath("userData", profile);
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{ scheme: "stream-jams-audio", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
const state = globalThis.shutdownProbe = { stage, ready: false, error: null, events: [], servicePid: null, workerExitCode: null };
function mark(phase) {
  const event = { phase, elapsedMs: Math.round(performance.now()), sequence: state.events.length + 1 };
  state.events.push(event);
  globalThis.console.info(`shutdown-probe:${JSON.stringify(event)}`);
}
let worker;
let quitting = false;
let stopping = false;
let stopId;
let stopped = false;
app.on("window-all-closed", () => {});
app.on("before-quit", event => { mark("before-quit"); if (!quitting) { event.preventDefault(); void quit(); } });
app.on("will-quit", () => mark("will-quit"));
app.on("quit", () => mark("quit"));

async function until(predicate, timeout) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (state.error) throw new Error(state.error);
    if (Date.now() >= deadline) throw new Error("Fixture operation timed out; no forced cleanup");
    await delay(50);
  }
}
async function quit() {
  if (stopping || quitting) return;
  stopping = true;
  mark("quit-requested");
  try {
    if (worker && state.workerExitCode === null) {
      mark("service-stop-requested");
      stopId = randomUUID();
      worker.postMessage({ type: "stop", generation: 1, requestId: stopId });
      await until(() => state.workerExitCode !== null, 10_000);
      if (!stopped || state.workerExitCode !== 0) throw new Error("Service exit was not clean and acknowledged");
      mark("service-stop-completed");
    }
    mark("windows-destroy-requested");
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    mark("windows-destroyed");
    quitting = true;
    app.quit();
  } catch (error) { state.error = error.message; mark("quit-failed"); }
}
globalThis.quitShutdownProbe = quit;

app.whenReady().then(async () => {
  mark("app-ready");
  const management = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await management.loadFile(join(import.meta.dirname, "shutdown-probe-management.html"));
  const audioSession = session.fromPartition("persist:stream-jams-audio", { cache: false });
  audioSession.protocol.handle("stream-jams-audio", async request => {
    const url = new URL(request.url);
    const name = url.pathname === "/" ? "shutdown-probe.html" : url.pathname === "/player.js" ? "shutdown-probe-player.js" : null;
    if (url.host !== "player" || !name || request.method !== "GET") return new globalThis.Response("Not found", { status: 404 });
    return new globalThis.Response(await readFile(join(import.meta.dirname, name)), { headers: {
      "Content-Type": name.endsWith(".html") ? "text/html" : "text/javascript",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; media-src data: blob:; base-uri 'none'; frame-ancestors 'none'"
    } });
  });
  const audio = new BrowserWindow({ show: false, skipTaskbar: true, focusable: false, webPreferences: { session: audioSession, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const allowed = (contents, permission, url, main) => contents === audio.webContents && permission === "speaker-selection" && url === "stream-jams-audio://player/" && main;
  audioSession.setPermissionCheckHandler((contents, permission, origin, details) => allowed(contents, permission, details.requestingUrl, details.isMainFrame) && origin === "stream-jams-audio://player/");
  audioSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(allowed(contents, permission, details.requestingUrl, details.isMainFrame)));
  await audio.loadURL("stream-jams-audio://player/");
  if (stage === "service") {
    const workerPath = process.env.STREAM_JAMS_DIAG_WORKER;
    if (!workerPath || !isAbsolute(workerPath)) throw new Error("An absolute bundled worker path is required");
    worker = utilityProcess.fork(workerPath, [], { stdio: "ignore" });
    let ready = false;
    const startId = randomUUID();
    worker.on("spawn", () => { state.servicePid = worker.pid; });
    worker.on("exit", code => { state.workerExitCode = code; mark("service-exit"); });
    worker.on("message", message => {
      if (message.generation !== 1) return;
      if (message.type === "ready" && message.requestId === startId) ready = true;
      if (message.type === "stopped" && message.requestId === stopId) { stopped = true; mark("service-stopped-ack"); }
      if (message.type === "failed") state.error = "Owned service failed to start";
      // Lifecycle-only IPC stub. Actual alert routing is covered elsewhere;
      // the independent zero-PCM renderer is unchanged between audio/service.
      if (message.type === "audio-request") worker.postMessage({ type: "audio-response", generation: 1, requestId: message.requestId, result: ["set-muted", "close"].includes(message.command.type) ? { type: "ok" } : null });
    });
    worker.postMessage({ type: "start", generation: 1, requestId: startId });
    await until(() => ready || state.workerExitCode !== null, 20_000);
    if (!ready || state.workerExitCode !== null) throw new Error("Owned service did not stay ready");
    mark("service-ready");
  }
  state.ready = true;
  mark("ready");
}).catch(error => { state.error = error.message; mark("startup-failed"); });
