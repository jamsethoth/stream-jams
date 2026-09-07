import { isAbsolute, resolve } from "node:path";
import { app, dialog, utilityProcess } from "electron";
import { AudioWindow, registerAudioPlayerScheme } from "./audio/audio-window.js";
import { AudioHost } from "./audio/audio-host.js";
import { closeAction } from "./close-policy.js";
import { ManagementWindow } from "./management-window.js";
import { ServiceSupervisor } from "./service-supervisor.js";
import { createTray } from "./tray.js";

// Keep the management renderer off the hardware GPU process. On Windows 25H2,
// that subprocess can remain in a terminating state after every JS quit event,
// delaying the owned desktop process and locking its isolated profile.
app.disableHardwareAcceleration();
registerAudioPlayerScheme();

const isolatedUserData = process.env.STREAM_JAMS_DESKTOP_USER_DATA_PATH;
if (isolatedUserData !== undefined) {
  if (!isAbsolute(isolatedUserData) || isolatedUserData.trim() === "") throw new Error("STREAM_JAMS_DESKTOP_USER_DATA_PATH must be absolute.");
  app.setPath("userData", isolatedUserData);
}
let management: ManagementWindow | null = null;
const audio = new AudioHost(callbacks => new AudioWindow(callbacks));
let tray: ReturnType<typeof createTray> | null = null;
let exiting = false;
let quitPending: Promise<void> | null = null;
let failureVisible = false;
let firstHide = true;

const supervisor = new ServiceSupervisor(() => utilityProcess.fork(resolve(import.meta.dirname, "service-worker.js"), [], { serviceName: "Stream Jams local service", stdio: "ignore" }), () => {
  tray?.update(supervisor.snapshot);
  if (supervisor.state === "failed" && !exiting) void showFailure();
}, audio);

async function start(): Promise<void> {
  try {
    const ready = await supervisor.start();
    management?.window.destroy();
    management = new ManagementWindow(new URL(ready.url).origin);
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
    management.window.on("query-session-end", () => { exiting = true; audio.serviceLost(); void supervisor.stop().catch(() => undefined); });
    management.window.on("session-end", () => { exiting = true; audio.serviceLost(); void supervisor.stop().catch(() => undefined); });
    await management.load();
  } catch { await showFailure(); }
}

async function showFailure(): Promise<void> {
  if (failureVisible || exiting) return;
  failureVisible = true;
  const result = await dialog.showMessageBox({ type: "error", title: "Stream Jams service unavailable", message: supervisor.error ?? "Management could not be loaded.", buttons: ["Retry", "Quit"], defaultId: 0, cancelId: 1 });
  failureVisible = false;
  if (result.response === 0) {
    try { await supervisor.stop(); await start(); } catch { requestQuit(); }
  } else requestQuit();
}

function requestQuit(): void {
  if (quitPending !== null || exiting) return;
  quitPending = (async () => {
    if (management !== null && !management.window.isDestroyed() && !(await management.requestQuit())) return;
    exiting = true;
    try { await supervisor.stop(); }
    catch (error) { dialog.showErrorBox("Abnormal shutdown", error instanceof Error ? error.message : "The owned service did not stop normally."); }
    await audio.close();
    management?.window.destroy();
    tray?.tray.destroy();
    app.quit();
  })().finally(() => { quitPending = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => management?.show());
  app.on("window-all-closed", () => { /* The tray owns service lifetime. */ });
  app.on("before-quit", (event) => { if (!exiting) { event.preventDefault(); requestQuit(); } });
  void app.whenReady().then(async () => {
    tray = createTray({
      open: () => management?.show(),
      mute: (muted) => { void supervisor.setMuted(muted).catch((error: unknown) => dialog.showErrorBox("Mute was not changed", error instanceof Error ? error.message : "Check the operator controls and retry.")); },
      quit: requestQuit
    });
    tray.update(null);
    await start();
    if (supervisor.state === "running") await audio.listOutputDevices().catch(() => undefined);
  });
}
