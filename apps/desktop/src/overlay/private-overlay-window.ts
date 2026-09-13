import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ipcMain, session, type IpcMainEvent } from "electron";
import type { SurfaceConfiguration } from "@stream-jams/core";
import { OverlayWindow } from "./overlay-window.js";
import { OVERLAY_PLAYER_SCHEME, OVERLAY_PLAYER_URL } from "./overlay-player-policy.js";
import { OVERLAY_COMMAND_CHANNEL, OVERLAY_REPLY_CHANNEL, overlayRendererReplySchema, overlayRendererRequestSchema, type OverlayRendererRequest } from "./overlay-ipc.js";
import type { OverlayRendererCallbacks, OverlayRendererPort } from "./overlay-host.js";

const contentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src blob: data:; media-src blob:; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

/** The native surface can load only the privately staged visual renderer. */
export class PrivateOverlayWindow implements OverlayRendererPort {
  readonly #session = session.fromPartition("stream-jams-overlay", { cache: false });
  #destroying = false;
  readonly #reply: (event: IpcMainEvent, candidate: unknown) => void;
  readonly #download = (event: Electron.Event): void => event.preventDefault();

  static create(config: Extract<SurfaceConfiguration, { kind: "desktop" }>, callbacks: OverlayRendererCallbacks): PrivateOverlayWindow | null {
    const native = OverlayWindow.create({ enabled: config.enabled, selectedId: config.displayId,
      preloadPath: resolve(import.meta.dirname, "overlay-preload.cjs"), onUnavailable: callbacks.onUnavailable });
    if (native === null) return null;
    try { return new PrivateOverlayWindow(native, config, callbacks); }
    catch (error) { native.destroy(); throw error; }
  }

  private constructor(private readonly native: OverlayWindow, config: Extract<SurfaceConfiguration, { kind: "desktop" }>, callbacks: OverlayRendererCallbacks) {
    this.#reply = (event, candidate) => {
      if (this.#destroying || native.window.isDestroyed() || event.sender !== native.window.webContents ||
        event.senderFrame !== native.window.webContents.mainFrame || event.senderFrame.url !== OVERLAY_PLAYER_URL) return;
      const parsed = overlayRendererReplySchema.safeParse(candidate);
      if (parsed.success) callbacks.onReply(parsed.data);
    };
    try {
    native.window.setOpacity(config.opacity);
    const resources = new Map([
      [OVERLAY_PLAYER_URL, { name: "desktop-overlay.html", type: "text/html; charset=utf-8" }],
      [`${OVERLAY_PLAYER_URL}overlay.js`, { name: "overlay.js", type: "text/javascript; charset=utf-8" }],
      [`${OVERLAY_PLAYER_URL}overlay.css`, { name: "overlay.css", type: "text/css; charset=utf-8" }]
    ]);
    this.#session.protocol.handle(OVERLAY_PLAYER_SCHEME, async request => {
      const resource = resources.get(request.url);
      if (this.#destroying || request.method !== "GET" || resource === undefined) return new Response(null, { status: 404 });
      try {
        const bytes = await readFile(resolve(import.meta.dirname, "../../desktop-overlay", resource.name));
        if (this.#destroying) return new Response(null, { status: 404 });
        return new Response(bytes, { headers: { "Content-Type": resource.type, "Content-Security-Policy": contentSecurityPolicy,
          "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      } catch { return new Response(null, { status: 404 }); }
    });
    this.#session.setPermissionCheckHandler(() => false);
    this.#session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.#session.on("will-download", this.#download);
    ipcMain.on(OVERLAY_REPLY_CHANNEL, this.#reply);
    native.window.on("closed", () => {
      if (this.#destroying) return;
      this.destroy();
      callbacks.onDestroyed();
    });
    } catch (error) {
      // Setup may have registered the protocol before a later permission/IPC
      // step failed. Release it so explicit recovery can create a fresh host.
      try { this.destroy(); } catch { /* The factory still destroys the native window. */ }
      throw error;
    }
  }

  async load(): Promise<void> { await this.native.load(OVERLAY_PLAYER_URL); }
  send(candidate: OverlayRendererRequest): void {
    const request = overlayRendererRequestSchema.parse(candidate);
    if (this.#destroying || this.native.window.isDestroyed()) throw new Error("Desktop overlay is unavailable");
    if (request.command.type === "configure" && request.command.config.kind === "desktop") this.native.window.setOpacity(request.command.config.opacity);
    this.native.window.webContents.send(OVERLAY_COMMAND_CHANNEL, request);
  }
  destroy(): void {
    if (this.#destroying) return;
    this.#destroying = true;
    ipcMain.removeListener(OVERLAY_REPLY_CHANNEL, this.#reply);
    this.#session.removeListener("will-download", this.#download);
    this.#session.setPermissionCheckHandler(null);
    this.#session.setPermissionRequestHandler(null);
    this.#session.protocol.unhandle(OVERLAY_PLAYER_SCHEME);
    this.native.destroy();
  }
}
