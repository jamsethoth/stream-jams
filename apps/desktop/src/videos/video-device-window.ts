import { resolve } from "node:path";
import { BrowserWindow, ipcMain, session, type IpcMainEvent } from "electron";
import { AUDIO_PARTITION_NAME, registerAudioCompanion } from "../audio/audio-window.js";
import { VIDEO_DEVICES_COMMAND_CHANNEL, VIDEO_DEVICES_REPORT_CHANNEL, VIDEO_DEVICES_URL, videoDevicesCommandSchema, type VideoDevicesCommand } from "./video-ipc.js";
import type { VideoDeviceOutputPort, VideoPortCallbacks } from "./video-player-host.js";

/**
 * Hidden receiver that plays the Videos mirror on selected devices (OpenSpec add-video-request-queue 5.5).
 * It is a companion of the audio player: same session and origin, so device ids match the
 * ones alert audio resolves. The audio player page must be loaded first; it serves this page.
 */
export class VideoDeviceWindow implements VideoDeviceOutputPort {
  readonly window: BrowserWindow;
  readonly #report: (event: IpcMainEvent, candidate: unknown) => void;
  readonly #unregister: () => void;
  #destroying = false;

  constructor(callbacks: VideoPortCallbacks, private readonly prepareAudioSession: () => Promise<void>) {
    this.window = new BrowserWindow({
      width: 320, height: 180, show: false, skipTaskbar: true, focusable: false, title: "Stream Jams video device output",
      webPreferences: {
        session: session.fromPartition(AUDIO_PARTITION_NAME, { cache: false }), sandbox: true, contextIsolation: true, nodeIntegration: false,
        preload: resolve(import.meta.dirname, "video-devices-preload.cjs"), backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required"
      }
    });
    this.window.removeMenu();
    this.#unregister = registerAudioCompanion(this.window.webContents.id, VIDEO_DEVICES_URL);
    this.#report = (event, candidate) => {
      if (!this.#destroying && !this.window.isDestroyed() && event.sender === this.window.webContents &&
        event.senderFrame === this.window.webContents.mainFrame && event.senderFrame?.url === VIDEO_DEVICES_URL) callbacks.onReport(candidate);
    };
    ipcMain.on(VIDEO_DEVICES_REPORT_CHANNEL, this.#report);
    const lost = () => { if (!this.#destroying) { this.destroy(); callbacks.onDestroyed(); } };
    this.window.webContents.on("render-process-gone", lost);
    this.window.on("closed", lost);
    this.window.webContents.on("will-navigate", event => event.preventDefault());
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-attach-webview", event => event.preventDefault());
  }

  async load(): Promise<void> {
    await this.prepareAudioSession();
    if (this.#destroying || this.window.isDestroyed()) throw new Error("The video device output was closed");
    await this.window.loadURL(VIDEO_DEVICES_URL);
    // Device AudioContexts need a running page; the main process supplies the activation.
    await this.window.webContents.executeJavaScript("undefined", true);
  }

  send(candidate: VideoDevicesCommand): void {
    const command = videoDevicesCommandSchema.parse(candidate);
    if (this.#destroying || this.window.isDestroyed()) throw new Error("The video device output is unavailable");
    this.window.webContents.send(VIDEO_DEVICES_COMMAND_CHANNEL, command);
  }

  destroy(): void {
    if (this.#destroying) return;
    this.#destroying = true;
    ipcMain.removeListener(VIDEO_DEVICES_REPORT_CHANNEL, this.#report);
    this.#unregister();
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
