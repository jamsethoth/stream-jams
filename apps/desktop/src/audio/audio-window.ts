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
import type { PrivateMediaReference, TrustedMediaGrant } from "@stream-jams/core";
import { PrivateMediaProtocol, type PrivateMediaProtocolOptions } from "../private-media-protocol.js";

const AUDIO_SCHEME = "stream-jams-audio";
const AUDIO_PARTITION = "persist:stream-jams-audio";
type MediaOptions = Omit<PrivateMediaProtocolOptions, "scheme" | "host" | "recipientId">;
const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "media-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join("; ");

export function registerAudioPlayerScheme(additionalSchemes: Electron.CustomScheme[] = []): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: AUDIO_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }, ...additionalSchemes]);
}

/**
 * Hidden companion pages that play to selected devices in this session (the Videos device
 * output). They share the audio player's partition and origin so device ids resolve the same
 * way; each may ask only for speaker selection, only from its registered main-frame URL.
 */
const audioCompanions = new Map<number, string>();
export function registerAudioCompanion(webContentsId: number, url: string): () => void {
  if (!url.startsWith(AUDIO_PLAYER_ORIGIN) || url === AUDIO_PLAYER_URL) throw new Error("Audio companions must use their own audio-player page");
  audioCompanions.set(webContentsId, url);
  return () => { if (audioCompanions.get(webContentsId) === url) audioCompanions.delete(webContentsId); };
}

const videoDevicesHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Stream Jams video device output</title></head>
<body><script type="module" src="./video-devices.js"></script></body></html>`;

function requestOrigin(requestingUrl: string): string {
  return requestingUrl === AUDIO_PLAYER_URL || [...audioCompanions.values()].includes(requestingUrl) ? AUDIO_PLAYER_ORIGIN : "";
}

function isAllowedCompanionPermission(permission: string, senderId: number | null, requestingOrigin: string, requestingUrl: string, isMainFrame: boolean): boolean {
  if (senderId === null) return false;
  const url = audioCompanions.get(senderId);
  return url !== undefined && isAllowedAudioPlayerPermission({ permission, senderId, expectedSenderId: senderId, requestingOrigin,
    requestingUrl: requestingUrl === url ? AUDIO_PLAYER_URL : "", isMainFrame });
}

export const AUDIO_PARTITION_NAME = AUDIO_PARTITION;

export class AudioWindow {
  readonly window: BrowserWindow;
  readonly #audioSession = session.fromPartition(AUDIO_PARTITION, { cache: false });
  #destroying = false;
  readonly #reply: (event: IpcMainEvent, candidate: unknown) => void;
  #media: PrivateMediaProtocol | undefined;

  constructor(callbacks: AudioRendererCallbacks, private readonly mediaOptions?: MediaOptions | (() => MediaOptions)) {
    this.#media = mediaOptions === undefined || typeof mediaOptions === "function" ? undefined : new PrivateMediaProtocol({ ...mediaOptions,
      scheme: AUDIO_SCHEME, host: "player", recipientId: "selected-device-audio" });
    const resources = new Map<string, { readonly path: string; readonly contentType: string }>([
      [AUDIO_PLAYER_URL, { path: resolve(import.meta.dirname, "player.html"), contentType: "text/html; charset=utf-8" }],
      [`${AUDIO_PLAYER_ORIGIN}player.js`, { path: resolve(import.meta.dirname, "player.js"), contentType: "text/javascript; charset=utf-8" }],
      [`${AUDIO_PLAYER_ORIGIN}audio-player-policy.js`, { path: resolve(import.meta.dirname, "audio-player-policy.js"), contentType: "text/javascript; charset=utf-8" }]
      , [`${AUDIO_PLAYER_ORIGIN}tone.wav`, { path: resolve(import.meta.dirname, "tone.wav"), contentType: "audio/wav" }]
      , [`${AUDIO_PLAYER_ORIGIN}video-devices.js`, { path: resolve(import.meta.dirname, "../videos/video-devices.js"), contentType: "text/javascript; charset=utf-8" }]
    ]);
    this.#audioSession.protocol.handle(AUDIO_SCHEME, async (request) => {
      if (this.#destroying) return new Response(null, { status: 404 });
      if (request.url === `${AUDIO_PLAYER_ORIGIN}video-devices.html` && request.method === "GET") {
        return new Response(videoDevicesHtml, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": contentSecurityPolicy,
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      }
      const resource = resources.get(request.url);
      if (resource === undefined || request.method !== "GET") {
        return (await this.#media?.handle(request)) ?? new Response(null, { status: 404 });
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
    this.window.webContents.on("render-process-gone", () => { if (!this.#destroying) { this.destroy(); callbacks.onDestroyed(); } });
    this.window.on("closed", () => { if (!this.#destroying) { this.destroy(); callbacks.onDestroyed(); } });
    this.window.webContents.on("will-navigate", (event, url) => {
      if (url !== AUDIO_PLAYER_URL) event.preventDefault();
    });
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-attach-webview", (event) => event.preventDefault());

    const expectedSenderId = this.window.webContents.id;
    this.#audioSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details: PermissionCheckHandlerHandlerDetails) =>
      isAllowedCompanionPermission(permission, webContents?.id ?? null, requestingOrigin, details.requestingUrl ?? "", details.isMainFrame) ||
      isAllowedAudioPlayerPermission({
        permission,
        senderId: webContents?.id ?? null,
        expectedSenderId,
        requestingOrigin,
        requestingUrl: details.requestingUrl ?? "",
        isMainFrame: details.isMainFrame
      }));
    this.#audioSession.setPermissionRequestHandler((webContents, permission, callback, details: PermissionRequest) => {
      callback(isAllowedCompanionPermission(permission, webContents.id, requestOrigin(details.requestingUrl), details.requestingUrl, details.isMainFrame) || isAllowedAudioPlayerPermission({
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

  issueMedia(ownerId: string, grant: TrustedMediaGrant): PrivateMediaReference {
    if (this.#destroying) throw new Error("Private media ownership is unavailable");
    if (this.#media === undefined && typeof this.mediaOptions === "function") {
      this.#media = new PrivateMediaProtocol({ ...this.mediaOptions(), scheme: AUDIO_SCHEME, host: "player", recipientId: "selected-device-audio" });
    }
    if (this.#media === undefined) throw new Error("Private audio media is unavailable");
    return this.#media.issue(ownerId, grant);
  }
  revokeMediaOwner(ownerId: string): void { this.#media?.revokeOwner(ownerId); }

  destroy(): void {
    if (this.#destroying) return;
    this.#destroying = true;
    this.#media?.destroy();
    ipcMain.removeListener(AUDIO_REPLY_CHANNEL, this.#reply);
    this.#audioSession.setPermissionCheckHandler(null);
    this.#audioSession.setPermissionRequestHandler(null);
    if (this.#audioSession.protocol.isProtocolHandled(AUDIO_SCHEME)) {
      this.#audioSession.protocol.unhandle(AUDIO_SCHEME);
    }
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
