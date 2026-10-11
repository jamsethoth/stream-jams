import { app, BrowserWindow, session } from "electron";
import process from "node:process";
import { setInterval } from "node:timers";
import console from "node:console";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Production Videos player host, player window, device receiver and audio session.
// Only the network is replaced: the direct video "host" is answered from a local fixture,
// and no real local service runs (the player session never reaches plain HTTP anyway).
const build = process.argv.at(-2);
const clipPath = process.argv.at(-1);
const load = path => import(pathToFileURL(resolve(build, path)).href);
const { AudioHost } = await load("audio/audio-host.js");
const { AudioWindow, registerAudioPlayerScheme } = await load("audio/audio-window.js");
const { VideoPlayerHost } = await load("videos/video-player-host.js");
const { VideoPlayerWindow, VIDEO_PLAYER_PARTITION } = await load("videos/video-player-window.js");
const { VideoDeviceWindow } = await load("videos/video-device-window.js");
app.disableHardwareAcceleration();
app.setPath("userData", process.env.STREAM_JAMS_DESKTOP_USER_DATA_PATH);
registerAudioPlayerScheme();
app.on("window-all-closed", () => {});
const origin = "http://127.0.0.1:39999";
void app.whenReady().then(async () => {
  globalThis.videoEvents = [];
  globalThis.videoDiagnostics = [];
  const clip = await readFile(clipPath);
  globalThis.clipRequests = 0;
  session.fromPartition(VIDEO_PLAYER_PARTITION, { cache: false }).protocol.handle("https", request => {
    if (request.url !== "https://videos.example.test/neutral.webm") return new globalThis.Response(null, { status: 404 });
    globalThis.clipRequests += 1;
    return new globalThis.Response(clip, { headers: { "Content-Type": "video/webm", "Content-Length": String(clip.byteLength) } });
  });
  const diagnose = diagnostic => globalThis.videoDiagnostics.push({ source: diagnostic.source, message: diagnostic.message, exception: String(diagnostic.exception?.stack ?? diagnostic.exception ?? "") });
  const audio = new AudioHost(callbacks => new AudioWindow(callbacks), diagnose);
  audio.beginOwnership();
  setInterval(() => audio.refreshLease(), 2000);
  const host = new VideoPlayerHost({
    createPlayer: (purpose, callbacks) => new VideoPlayerWindow(purpose, origin, callbacks),
    createDeviceOutput: (_purpose, callbacks) => new VideoDeviceWindow(callbacks, async () => { await audio.listOutputDevices(); }),
    playerOrigin: () => origin,
    diagnose
  });
  host.onEvent(event => globalThis.videoEvents.push(event));
  host.beginOwnership();
  setInterval(() => host.refreshLease(), 2000);
  globalThis.videoHost = host;
  // A desktop receiver that is not a browser source: it records what it is sent.
  globalThis.desktopSignals = [];
  globalThis.desktopReceiver = host.attachDesktopReceiver("desktop:probe", "live", signal => globalThis.desktopSignals.push(signal));
  globalThis.windowTitles = () => BrowserWindow.getAllWindows().map(window => ({ title: window.getTitle(), visible: window.isVisible(), url: window.webContents.getURL() }));
  globalThis.videoReady = true;
  app.on("before-quit", () => { void host.close(); audio.serviceLost(); });
}).catch(error => { globalThis.videoFixtureError = String(error.stack); console.error(error); });
