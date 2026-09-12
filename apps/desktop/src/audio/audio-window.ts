import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  BrowserWindow,
  ipcMain,
  protocol,
  session,
  type PermissionCheckHandlerHandlerDetails,
  type PermissionRequest,
  type IpcMainEvent
} from "electron";
import {
  AUDIO_PLAYER_ORIGIN,
  AUDIO_PLAYER_URL,
  isAllowedAudioPlayerPermission
} from "./audio-player-policy.js";
import { AUDIO_COMMAND_CHANNEL, AUDIO_REPLY_CHANNEL, audioRendererRequestSchema, type AudioRendererRequest } from "./audio-ipc.js";
import type { AudioRendererCallbacks } from "./audio-host.js";

const AUDIO_SCHEME = "stream-jams-audio";
const AUDIO_PARTITION = "persist:stream-jams-audio";
const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "media-src data: blob:",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join("; ");

export function registerAudioPlayerScheme(additionalSchemes: Electron.CustomScheme[] = []): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: AUDIO_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }, ...additionalSchemes]);
}

function requestOrigin(requestingUrl: string): string {
  return requestingUrl === AUDIO_PLAYER_URL ? AUDIO_PLAYER_ORIGIN : "";
}

export class AudioWindow {
  readonly window: BrowserWindow;
  readonly #audioSession = session.fromPartition(AUDIO_PARTITION, { cache: false });
  #destroying = false;
  readonly #reply: (event: IpcMainEvent, candidate: unknown) => void;

  constructor(callbacks: AudioRendererCallbacks) {
    const resources = new Map<string, { readonly path: string; readonly contentType: string }>([
      [AUDIO_PLAYER_URL, { path: resolve(import.meta.dirname, "player.html"), contentType: "text/html; charset=utf-8" }],
      [`${AUDIO_PLAYER_ORIGIN}player.js`, { path: resolve(import.meta.dirname, "player.js"), contentType: "text/javascript; charset=utf-8" }],
      [`${AUDIO_PLAYER_ORIGIN}audio-player-policy.js`, { path: resolve(import.meta.dirname, "audio-player-policy.js"), contentType: "text/javascript; charset=utf-8" }],
      [`${AUDIO_PLAYER_ORIGIN}start-bound-audio.js`, { path: resolve(import.meta.dirname, "start-bound-audio.js"), contentType: "text/javascript; charset=utf-8" }]
    ]);
    this.#audioSession.protocol.handle(AUDIO_SCHEME, async (request) => {
      const resource = resources.get(request.url);
      if (resource === undefined || request.method !== "GET") {
        return new Response("Not found", { status: 404 });
      }
      return new Response(await readFile(resource.path), {
        headers: {
          "Content-Type": resource.contentType,
          "Content-Security-Policy": contentSecurityPolicy,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      });
    });

    this.window = new BrowserWindow({
      width: 320,
      height: 180,
      show: false,
      skipTaskbar: true,
      focusable: false,
      title: "Stream Jams audio player",
      webPreferences: {
        session: this.#audioSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload: resolve(import.meta.dirname, "audio-preload.cjs"),
        backgroundThrottling: false
      }
    });
    this.window.removeMenu();
    this.#reply = (event, candidate) => {
      if (!this.#destroying && !this.window.isDestroyed() && event.sender === this.window.webContents &&
        event.senderFrame === this.window.webContents.mainFrame && event.senderFrame.url === AUDIO_PLAYER_URL) callbacks.onReply(candidate);
    };
    ipcMain.on(AUDIO_REPLY_CHANNEL, this.#reply);
    this.window.webContents.on("render-process-gone", () => { if (!this.#destroying) callbacks.onDestroyed(); });
    this.window.on("closed", () => { if (!this.#destroying) callbacks.onDestroyed(); });
    this.window.webContents.on("will-navigate", (event, url) => {
      if (url !== AUDIO_PLAYER_URL) event.preventDefault();
    });
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-attach-webview", (event) => event.preventDefault());

    const expectedSenderId = this.window.webContents.id;
    this.#audioSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details: PermissionCheckHandlerHandlerDetails) =>
      isAllowedAudioPlayerPermission({
        permission,
        senderId: webContents?.id ?? null,
        expectedSenderId,
        requestingOrigin,
        requestingUrl: details.requestingUrl ?? "",
        isMainFrame: details.isMainFrame
      }));
    this.#audioSession.setPermissionRequestHandler((webContents, permission, callback, details: PermissionRequest) => {
      callback(isAllowedAudioPlayerPermission({
        permission,
        senderId: webContents.id,
        expectedSenderId,
        requestingOrigin: requestOrigin(details.requestingUrl),
        requestingUrl: details.requestingUrl,
        isMainFrame: details.isMainFrame
      }));
    });
  }

  async load(): Promise<void> {
    await this.window.loadURL(AUDIO_PLAYER_URL);
  }

  send(request: AudioRendererRequest): void {
    this.window.webContents.send(AUDIO_COMMAND_CHANNEL, audioRendererRequestSchema.parse(request));
  }

  destroy(): void {
    if (this.#destroying) return;
    this.#destroying = true;
    ipcMain.removeListener(AUDIO_REPLY_CHANNEL, this.#reply);
    this.#audioSession.setPermissionCheckHandler(null);
    this.#audioSession.setPermissionRequestHandler(null);
    if (this.#audioSession.protocol.isProtocolHandled(AUDIO_SCHEME)) {
      this.#audioSession.protocol.unhandle(AUDIO_SCHEME);
    }
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
