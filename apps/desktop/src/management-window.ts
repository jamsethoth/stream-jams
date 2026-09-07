import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainEvent } from "electron";
import { isManagementNavigation, isTrustedManagementSender } from "./close-policy.js";
import { quitReplySchema } from "./desktop-ipc.js";

const externalHosts = new Set(["www.twitch.tv", "id.twitch.tv", "dev.twitch.tv", "obsproject.com", "streamer.bot", "speaker.bot"]);
export class ManagementWindow {
  readonly window: BrowserWindow;
  #guardReady = false;
  #responsive = true;
  #unavailableConfirmation: Promise<boolean> | null = null;
  #pending: { id: string; resolve(allow: boolean): void } | null = null;

  constructor(readonly origin: string) {
    this.window = new BrowserWindow({
      width: 1280, height: 850, minWidth: 760, minHeight: 540, show: false, title: "Stream Jams",
      webPreferences: {
        sandbox: true, contextIsolation: true, nodeIntegration: false,
        preload: resolve(import.meta.dirname, "management-preload.cjs"),
        additionalArguments: [`--stream-jams-origin=${origin}`]
      }
    });
    this.window.removeMenu();
    const external = (candidate: string) => {
      try {
        const url = new URL(candidate);
        if (url.protocol === "https:" && externalHosts.has(url.hostname) && !url.username && !url.password) {
          void shell.openExternal(url.href).catch(() => dialog.showErrorBox("Link could not be opened", "Open the provider website in your browser and retry."));
        }
      } catch { /* Invalid and unapproved URLs are never opened. */ }
    };
    this.window.webContents.on("will-navigate", (event, url) => {
      if (!isManagementNavigation(url, origin)) { event.preventDefault(); external(url); }
    });
    this.window.webContents.on("will-redirect", (event, url) => {
      if (!isManagementNavigation(url, origin)) event.preventDefault();
    });
    this.window.webContents.setWindowOpenHandler(({ url }) => {
      if (isManagementNavigation(url, origin)) void this.window.loadURL(url); else external(url);
      return { action: "deny" };
    });
    const trusted = (event: IpcMainEvent) => isTrustedManagementSender({
      senderId: event.sender.id, expectedId: this.window.webContents.id,
      isMainFrame: event.senderFrame === this.window.webContents.mainFrame,
      url: event.senderFrame?.url ?? "", origin
    });
    const ready = (event: IpcMainEvent) => { if (trusted(event)) this.#guardReady = true; };
    const reply = (event: IpcMainEvent, candidate: unknown) => {
      if (!trusted(event)) return;
      const parsed = quitReplySchema.safeParse(candidate);
      if (!parsed.success || parsed.data.requestId !== this.#pending?.id) return;
      this.#pending.resolve(parsed.data.allow);
      this.#pending = null;
    };
    ipcMain.on("desktop:guard-ready", ready);
    ipcMain.on("desktop:quit-reply", reply);
    this.window.webContents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) this.#guardReady = false; });
    this.window.webContents.on("render-process-gone", () => {
      this.#guardReady = false;
      if (this.#pending !== null) void this.#confirmUnavailable();
    });
    this.window.on("unresponsive", () => { this.#responsive = false; if (this.#pending !== null) void this.#confirmUnavailable(); });
    this.window.on("responsive", () => { this.#responsive = true; });
    this.window.on("closed", () => {
      ipcMain.removeListener("desktop:guard-ready", ready);
      ipcMain.removeListener("desktop:quit-reply", reply);
      this.#pending?.resolve(false);
      this.#pending = null;
    });
  }

  async load(): Promise<void> { await this.window.loadURL(`${this.origin}/manage`); this.show(); }
  show(): void { if (this.window.isMinimized()) this.window.restore(); this.window.show(); this.window.focus(); }

  async requestQuit(): Promise<boolean> {
    this.show();
    if (!this.#guardReady || !this.#responsive || this.window.webContents.isDestroyed() || this.window.webContents.isCrashed()) return this.#confirmUnavailable();
    return new Promise<boolean>((resolve) => {
      const id = randomUUID();
      this.#pending = { id, resolve };
      this.window.webContents.send("desktop:quit-requested", id);
    });
  }

  #confirmUnavailable(): Promise<boolean> {
    this.#unavailableConfirmation ??= this.#showUnavailableConfirmation().finally(() => { this.#unavailableConfirmation = null; });
    return this.#unavailableConfirmation;
  }

  async #showUnavailableConfirmation(): Promise<boolean> {
    const result = await dialog.showMessageBox({
      type: "warning", title: "Quit Stream Jams?", buttons: ["Cancel", "Quit"], defaultId: 0, cancelId: 0,
      message: "Management cannot confirm whether your changes are saved.",
      detail: "Unsaved edits in an unavailable or crashed window cannot be recovered. Quit also stops the local service."
    });
    const allow = result.response === 1;
    this.#pending?.resolve(allow);
    this.#pending = null;
    return allow;
  }
}
