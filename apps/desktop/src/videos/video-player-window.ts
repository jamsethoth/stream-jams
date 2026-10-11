import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BrowserWindow, ipcMain, session, webFrameMain, type IpcMainEvent, type Session, type WebFrameMain } from "electron";
import { z } from "zod";
import type { OverlayPurpose } from "@stream-jams/core";
import { VIDEO_PLAYER_COMMAND_CHANNEL, VIDEO_PLAYER_REPORT_CHANNEL, videoPlayerCommandSchema, type VideoPlayerCommand } from "./video-ipc.js";
import { providerFrameCleanScript, twitchFrameScript } from "./twitch-frame-script.js";
import type { TwitchFrameOperation, TwitchFrameState, VideoPlayerPort, VideoPortCallbacks } from "./video-player-host.js";

/*
 * Hidden primary player window (OpenSpec add-video-request-queue 5.1-5.3).
 * The page is served from the local service origin so Twitch's `parent` and YouTube's
 * `origin` checks see the same host browser sources use. Its own session answers every
 * plain-HTTP request in place of the network: only the player page and script exist there.
 */

/** Persistent so provider player settings (Twitch volume and quality) survive restarts; the HTTP cache stays off. */
export const VIDEO_PLAYER_PARTITION = "persist:stream-jams-video-player";
export const videoPlayerBasePath = "/__stream-jams/video-player/";
const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'unsafe-inline'",
  "frame-src https://www.youtube-nocookie.com https://clips.twitch.tv https://player.twitch.tv",
  "media-src https:",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join("; ");
const twitchHosts = new Set(["clips.twitch.tv", "player.twitch.tv"]);

export function videoPlayerPageUrl(origin: string, purpose: OverlayPurpose): string {
  return `${origin}${videoPlayerBasePath}${purpose}`;
}

const youtubeHosts = new Set(["www.youtube-nocookie.com", "www.youtube.com"]);

/** Provider frames whose chrome is hidden in the captured player. */
export function isProviderFrame(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsed = new URL(url);
  return parsed.protocol === "https:" && (twitchHosts.has(parsed.hostname) || youtubeHosts.has(parsed.hostname));
}

/** The provider frames whose `<video>` the main process may read or steer. */
export function isTwitchProviderFrame(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsed = new URL(url);
  return parsed.protocol === "https:" && twitchHosts.has(parsed.hostname);
}

const twitchStateSchema = z.object({
  video: z.boolean(),
  paused: z.boolean().optional(),
  ended: z.boolean().optional(),
  positionMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
  durationMs: z.number().int().min(1).max(24 * 60 * 60 * 1000).nullable().optional()
}).strict();

interface SessionState {
  origin: string;
  readonly players: Map<number, VideoPlayerWindow>;
}
const sessions = new WeakMap<Session, SessionState>();

/** Installs the session-wide handlers once. Each window registers itself; nothing else may capture or ask for permissions. */
function prepareSession(target: Session, origin: string): SessionState {
  const existing = sessions.get(target);
  if (existing !== undefined) { existing.origin = origin; return existing; }
  const state: SessionState = { origin, players: new Map() };
  sessions.set(target, state);
  const files = new Map([
    ["player.js", { path: resolve(import.meta.dirname, "player.js"), type: "text/javascript; charset=utf-8" }]
  ]);
  target.protocol.handle("http", async request => {
    const url = URL.canParse(request.url) ? new URL(request.url) : null;
    if (url === null || request.method !== "GET" || url.origin !== state.origin || url.search !== "" || !url.pathname.startsWith(videoPlayerBasePath)) {
      return new Response(null, { status: 404 });
    }
    const name = url.pathname.slice(videoPlayerBasePath.length);
    const headers = { "Content-Security-Policy": contentSecurityPolicy, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "origin" };
    if (name === "live" || name === "test") return new Response(playerHtml, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
    const file = files.get(name);
    if (file === undefined) return new Response(null, { status: 404 });
    try { return new Response(await readFile(file.path), { headers: { ...headers, "Content-Type": file.type } }); }
    // error-provenance: allow expected -- a missing build output fails the page load, which the host reports
    catch { return new Response(null, { status: 404 }); }
  });
  const playerFor = (frame: WebFrameMain | null | undefined): VideoPlayerWindow | undefined => {
    if (frame === null || frame === undefined) return undefined;
    for (const player of state.players.values()) if (player.isMainFrame(frame)) return player;
    return undefined;
  };
  target.setDisplayMediaRequestHandler((request, callback) => {
    const frame = request.frame;
    // Only a player's own main frame may capture, and only itself: never a screen, window or system audio.
    if (frame === null || playerFor(frame) === undefined) { callback({}); return; }
    callback({ video: frame, audio: frame, enableLocalEcho: false });
  });
  target.setPermissionCheckHandler((contents, permission, _origin, details) =>
    (permission === "media" || permission === "display-capture") && details.isMainFrame === true &&
    contents !== null && state.players.has(contents.id) && state.players.get(contents.id)!.isPageUrl(details.requestingUrl ?? ""));
  target.setPermissionRequestHandler((contents, permission, callback, details) => {
    const player = state.players.get(contents.id);
    callback((permission === "media" || permission === "display-capture") && details.isMainFrame && player !== undefined && player.isPageUrl(details.requestingUrl));
  });
  target.on("will-download", event => event.preventDefault());
  return state;
}

const playerHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Stream Jams video player</title>
<style>html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#000}#stage>*{position:absolute;inset:0;width:1920px;height:1080px;border:0;background:#000}</style>
</head><body><div id="stage"></div><script type="module" src="player.js"></script></body></html>`;

/** One long-lived hidden player per purpose. It never navigates; providers are swapped inside its page. */
export class VideoPlayerWindow implements VideoPlayerPort {
  readonly window: BrowserWindow;
  readonly #session = session.fromPartition(VIDEO_PLAYER_PARTITION, { cache: false });
  readonly #state: SessionState;
  readonly #url: string;
  readonly #report: (event: IpcMainEvent, candidate: unknown) => void;
  #destroying = false;

  constructor(purpose: OverlayPurpose, origin: string, callbacks: VideoPortCallbacks) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.origin !== origin) throw new Error("The video player needs the local service origin");
    this.#url = videoPlayerPageUrl(origin, purpose);
    this.#state = prepareSession(this.#session, origin);
    this.window = new BrowserWindow({
      width: 1920, height: 1080, useContentSize: true, show: false, skipTaskbar: true, focusable: false,
      title: `Stream Jams video player (${purpose})`,
      webPreferences: {
        session: this.#session, sandbox: true, contextIsolation: true, nodeIntegration: false,
        preload: resolve(import.meta.dirname, "video-player-preload.cjs"),
        backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required", spellcheck: false
      }
    });
    this.window.removeMenu();
    this.#state.players.set(this.window.webContents.id, this);
    this.#report = (event, candidate) => {
      if (!this.#destroying && !this.window.isDestroyed() && event.sender === this.window.webContents &&
        event.senderFrame === this.window.webContents.mainFrame && this.isPageUrl(event.senderFrame?.url ?? "")) callbacks.onReport(candidate);
    };
    ipcMain.on(VIDEO_PLAYER_REPORT_CHANNEL, this.#report);
    const lost = () => { if (!this.#destroying) { this.destroy(); callbacks.onDestroyed(); } };
    this.window.webContents.on("render-process-gone", lost);
    this.window.on("closed", lost);
    // Navigation lock: the page itself never leaves; provider frames navigate only inside their iframe.
    this.window.webContents.on("will-navigate", event => event.preventDefault());
    this.window.webContents.on("will-redirect", event => { if (event.isMainFrame) event.preventDefault(); });
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-attach-webview", event => event.preventDefault());
    // Hide provider chrome as soon as each provider document is ready, and again after it loads.
    this.window.webContents.on("frame-created", (_event, { frame }) => { frame?.on("dom-ready", () => this.#clean(frame)); });
    this.window.webContents.on("did-frame-finish-load", (_event, isMainFrame, processId, routingId) => {
      if (!isMainFrame) this.#clean(webFrameMain.fromId(processId, routingId));
    });
  }

  #clean(frame: WebFrameMain | null | undefined): void {
    if (frame === null || frame === undefined || frame.isDestroyed() || !isProviderFrame(frame.url)) return;
    void frame.executeJavaScript(providerFrameCleanScript, true).catch(
      // error-provenance: allow expected -- a frame that navigated away or closed has nothing to clean
      () => undefined);
  }

  isMainFrame(frame: WebFrameMain): boolean {
    return !this.#destroying && !this.window.isDestroyed() && frame === this.window.webContents.mainFrame && this.isPageUrl(frame.url);
  }

  isPageUrl(url: string): boolean { return url === this.#url; }

  async load(): Promise<void> { await this.window.loadURL(this.#url); }

  async startCapture(): Promise<boolean> {
    if (this.#destroying || this.window.isDestroyed()) return false;
    // getDisplayMedia needs a user gesture; the main process supplies one.
    const result: unknown = await this.window.webContents.mainFrame.executeJavaScript("window.streamJamsStartCapture()", true);
    return result === true;
  }

  send(candidate: VideoPlayerCommand): void {
    const command = videoPlayerCommandSchema.parse(candidate);
    if (this.#destroying || this.window.isDestroyed()) throw new Error("The video player is unavailable");
    this.window.webContents.send(VIDEO_PLAYER_COMMAND_CHANNEL, command);
  }

  async twitch(operation: TwitchFrameOperation): Promise<TwitchFrameState | null> {
    if (this.#destroying || this.window.isDestroyed()) return null;
    const frame = this.window.webContents.mainFrame.framesInSubtree.find(candidate => candidate !== this.window.webContents.mainFrame && isTwitchProviderFrame(candidate.url));
    if (frame === undefined) return null;
    this.#clean(frame);
    const parsed = twitchStateSchema.safeParse(await frame.executeJavaScript(twitchFrameScript(operation), true));
    if (!parsed.success) return { video: false };
    return parsed.data;
  }

  destroy(): void {
    if (this.#destroying) return;
    this.#destroying = true;
    ipcMain.removeListener(VIDEO_PLAYER_REPORT_CHANNEL, this.#report);
    for (const [id, player] of this.#state.players) if (player === this) this.#state.players.delete(id);
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
