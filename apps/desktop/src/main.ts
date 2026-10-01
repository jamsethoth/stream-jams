import { basename, isAbsolute, resolve } from "node:path";
import { app, crashReporter, dialog, utilityProcess } from "electron";
import { AudioWindow, registerAudioPlayerScheme } from "./audio/audio-window.js";
import { AudioHost } from "./audio/audio-host.js";
import { OverlayHost } from "./overlay/overlay-host.js";
import { enumerateDesktopDisplays } from "./overlay/overlay-window.js";
import { PrivateOverlayWindow } from "./overlay/private-overlay-window.js";
import { overlayPlayerScheme } from "./overlay/overlay-player-policy.js";
import { closeAction } from "./close-policy.js";
import { ManagementWindow } from "./management-window.js";
import { ServiceSupervisor } from "./service-supervisor.js";
import { createTray } from "./tray.js";
import { ShutdownLog } from "./shutdown-log.js";
import { collectPriorCrashDumpMetadata, createDesktopDiagnosticFallbackWriter, DesktopDiagnostics } from "./desktop-diagnostics.js";

// Keep the management renderer off the hardware GPU process. On Windows 25H2,
// that subprocess can remain in a terminating state after every JS quit event,
// delaying the owned desktop process and locking its isolated profile.
app.disableHardwareAcceleration();
registerAudioPlayerScheme([overlayPlayerScheme]);

const isolatedUserData = process.env.STREAM_JAMS_DESKTOP_USER_DATA_PATH;
if (isolatedUserData !== undefined) {
  if (!isAbsolute(isolatedUserData) || isolatedUserData.trim() === "") throw new Error("STREAM_JAMS_DESKTOP_USER_DATA_PATH must be absolute.");
  app.setPath("userData", isolatedUserData);
}
let management: ManagementWindow | null = null;
const audio = new AudioHost((callbacks, generation) => new AudioWindow(callbacks, () => ownedMediaOptions(generation)), (input) => diagnostics.record(input));
const overlay = new OverlayHost((config, callbacks, generation) => PrivateOverlayWindow.create(config, callbacks, () => ownedMediaOptions(generation)), () => ({
  available: process.platform === "win32", displays: process.platform === "win32" ? enumerateDesktopDisplays() : []
}), (input) => diagnostics.record(input));
let tray: ReturnType<typeof createTray> | null = null;
let exiting = false;
let quitPending: Promise<void> | null = null;
let failureVisible = false;
let firstHide = true;
let shutdownLog: ShutdownLog | undefined;

const supervisor = new ServiceSupervisor(() => utilityProcess.fork(resolve(import.meta.dirname, "service-worker.js"), [], { serviceName: "Stream Jams local service", stdio: "ignore" }), () => {
  tray?.update(supervisor.snapshot);
  if (supervisor.state === "failed" && !exiting) void showFailure();
}, audio, overlay, (input) => diagnostics.record(input), (report) => diagnostics.fallback(report));
const diagnostics = new DesktopDiagnostics({
  send: (report) => supervisor.recordDiagnostic(report),
  writeFallback: createDesktopDiagnosticFallbackWriter(resolve(app.getPath("logs"), "desktop-emergency.jsonl"))
});

function ownedMediaOptions(generation: number): { trustedServiceOrigin: string; generation: number } {
  if (supervisor.snapshot === null) throw new Error("The owned media service is unavailable");
  return { trustedServiceOrigin: new URL(supervisor.snapshot.url).origin, generation };
}

try {
  crashReporter.start({ productName: "Stream Jams", uploadToServer: false });
} catch (error) {
  diagnostics.record({ component: "crashpad", source: "desktop.crashpad.start-failed", message: "Local crash capture could not be initialized.", exception: error });
}

process.on("uncaughtExceptionMonitor", (error) => {
  diagnostics.record({ component: "main-process", source: "desktop.main.uncaught-exception", message: "The desktop main process encountered an uncaught exception.", exception: error });
});
process.on("unhandledRejection", (reason) => {
  diagnostics.record({ component: "main-process", source: "desktop.main.unhandled-rejection", message: "The desktop main process encountered an unhandled rejection.", exception: reason });
});
app.on("child-process-gone", (_event, details) => {
  diagnostics.record({
    component: details.type.toLowerCase(),
    source: "desktop.child-process.gone",
    message: "An Electron child process exited unexpectedly.",
    reason: [details.reason, details.serviceName, details.name].filter(Boolean).join(":"),
    exitCode: details.exitCode
  });
});
app.on("web-contents-created", (_event, contents) => {
  contents.on("preload-error", (_preloadEvent, preloadPath, error) => {
    diagnostics.record({ component: `renderer-${contents.id}-preload`, source: "desktop.renderer.preload-error", message: "A renderer preload script failed.", exception: error, reason: basename(preloadPath) });
  });
  contents.on("render-process-gone", (_goneEvent, details) => {
    diagnostics.record({ component: `renderer-${contents.id}`, source: "desktop.renderer.gone", message: "An Electron renderer process exited unexpectedly.", reason: details.reason, exitCode: details.exitCode });
  });
});

async function start(): Promise<void> {
  try {
    const ready = await supervisor.start();
    management?.window.destroy();
    management = new ManagementWindow(new URL(ready.url).origin, (input) => diagnostics.record(input));
    management.window.on("close", (event) => {
      if (exiting) return;
      event.preventDefault();
      if (closeAction(supervisor.snapshot?.closeToTray ?? true, false) === "hide") {
        management?.window.hide();
        if (firstHide) {
          firstHide = false;
          tray?.tray.displayBalloon({ title: "Stream Jams is still running", content: "Use the tray icon to reopen Stream Jams or choose Quit to stop the service." });
        }
      } else requestQuit();
    });
    management.window.on("query-session-end", () => { shutdownLog?.record("query-session-end"); exiting = true; audio.serviceLost(); void supervisor.stop().catch((error: unknown) => diagnostics.record({ component: "service-worker", source: "desktop.shutdown.session-stop-failed", message: "The local service failed to stop during session shutdown.", exception: error })); });
    management.window.on("session-end", () => { shutdownLog?.record("session-end"); exiting = true; audio.serviceLost(); void supervisor.stop().catch((error: unknown) => diagnostics.record({ component: "service-worker", source: "desktop.shutdown.session-stop-failed", message: "The local service failed to stop during session shutdown.", exception: error })); });
    await management.load();
  } catch (error) {
    diagnostics.record({ component: "management-window", source: "desktop.management.start-failed", message: "The management window could not be started.", exception: error });
    await showFailure();
  }
}

async function showFailure(): Promise<void> {
  if (failureVisible || exiting) return;
  failureVisible = true;
  const result = await dialog.showMessageBox({ type: "error", title: "Stream Jams service unavailable", message: supervisor.error ?? "Management could not be loaded.", buttons: ["Retry", "Quit"], defaultId: 0, cancelId: 1 });
  failureVisible = false;
  if (result.response === 0) {
    try { await supervisor.stop(); await start(); }
    catch (error) {
      diagnostics.record({ component: "service-worker", source: "desktop.retry.failed", message: "The desktop service retry failed.", exception: error });
      requestQuit();
    }
  } else requestQuit();
}

function requestQuit(): void {
  if (quitPending !== null || exiting) return;
  shutdownLog?.record("quit-requested");
  quitPending = (async () => {
    if (management !== null && !management.window.isDestroyed() && !(await management.requestQuit())) {
      shutdownLog?.record("decision-cancelled");
      return;
    }
    shutdownLog?.record("decision-accepted");
    exiting = true;
    shutdownLog?.record("service-stop-requested");
    try { await supervisor.stop(); shutdownLog?.record("service-stop-completed"); }
    catch (error) {
      const report = diagnostics.record({ component: "service-worker", source: "desktop.shutdown.service-stop-failed", message: "The owned service did not stop normally.", exception: error });
      shutdownLog?.recordFailure("service-stop-failed", error, report.referenceId);
      dialog.showErrorBox("Abnormal shutdown", error instanceof Error ? error.message : "The owned service did not stop normally.");
    }
    shutdownLog?.record("audio-close-requested");
    await audio.close();
    shutdownLog?.record("audio-closed");
    shutdownLog?.record("overlay-close-requested");
    await overlay.close();
    shutdownLog?.record("overlay-closed");
    shutdownLog?.record("windows-destroy-requested");
    management?.window.destroy();
    tray?.tray.destroy();
    shutdownLog?.record("windows-destroyed");
    shutdownLog?.record("electron-quit-requested");
    app.quit();
  })().finally(() => { quitPending = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  shutdownLog = new ShutdownLog(process.env.STREAM_JAMS_SHUTDOWN_LOG);
  app.on("second-instance", () => management?.show());
  app.on("window-all-closed", () => { /* The tray owns service lifetime. */ });
  app.on("before-quit", (event) => { shutdownLog?.record("electron-before-quit"); if (!exiting) { event.preventDefault(); requestQuit(); } });
  app.on("will-quit", () => shutdownLog?.record("electron-will-quit"));
  app.on("quit", () => { shutdownLog?.record("electron-quit"); shutdownLog?.close(); });
  void app.whenReady().then(async () => {
    shutdownLog?.record("app-ready");
    tray = createTray({
      open: () => management?.show(),
      mute: (muted) => { void supervisor.setMuted(muted).catch((error: unknown) => {
        diagnostics.record({ component: "service-worker", source: "desktop.mute.failed", message: "Mute was not changed.", exception: error });
        dialog.showErrorBox("Mute was not changed", error instanceof Error ? error.message : "Check the operator controls and retry.");
      }); },
      quit: requestQuit
    });
    tray.update(null);
    await start();
    diagnostics.recordPriorCrashDumps(collectPriorCrashDumpMetadata(app.getPath("crashDumps")));
    if (supervisor.state === "running") await audio.listOutputDevices().catch((error: unknown) => {
      diagnostics.record({ component: "audio-window", source: "desktop.audio.enumeration-failed", message: "Desktop audio devices could not be enumerated.", exception: error });
    });
  }).catch((error: unknown) => {
    diagnostics.record({ component: "main-process", source: "desktop.ready.failed", message: "Desktop initialization failed after Electron became ready.", exception: error });
    void showFailure();
  });
}
