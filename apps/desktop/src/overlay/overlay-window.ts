import { BrowserWindow, screen } from "electron";
import type { SelectedDesktopDisplay } from "@stream-jams/core";
import { overlayWindowPolicy, selectBoundDisplay, type SelectedDisplay } from "./overlay-window-policy.js";

export function enumerateDesktopDisplays(): SelectedDesktopDisplay[] {
  return screen.getAllDisplays().map(display => ({ id: String(display.id), label: display.label?.trim() || `Display ${display.id}`, bounds: { ...display.bounds }, scaleFactor: display.scaleFactor }));
}

interface OverlayWindowOptions {
  enabled: boolean;
  selectedId: string | null;
  preloadPath?: string;
  onUnavailable?: () => void;
}

/** Native feasibility adapter. Production ownership and private transport are added by the configured host. */
export class OverlayWindow {
  readonly window: BrowserWindow;
  readonly #selectedId: string;
  #ready = false;
  #contentInterrupted = false;
  readonly #onUnavailable: (() => void) | undefined;
  readonly #updateDisplay = (): void => {
    if (this.window.isDestroyed()) return;
    const selected = selectBoundDisplay(enumerateDesktopDisplays(), this.#selectedId);
    if (selected === null) {
      const firstInterruption = !this.#contentInterrupted;
      this.#contentInterrupted = true;
      this.#ready = false; // A reconnect must not replay interrupted content.
      this.window.hide();
      if (firstInterruption) this.#onUnavailable?.();
      return;
    }
    this.window.setBounds(selected.bounds);
    if (this.#ready) this.window.showInactive();
  };

  static create(options: OverlayWindowOptions): OverlayWindow | null {
    if (!options.enabled) return null;
    const selected = selectBoundDisplay(enumerateDesktopDisplays(), options.selectedId);
    return selected === null ? null : new OverlayWindow(selected, options);
  }

  private constructor(selected: SelectedDisplay, options: OverlayWindowOptions) {
    this.#selectedId = selected.id;
    this.#onUnavailable = options.onUnavailable;
    this.window = new BrowserWindow({
      ...overlayWindowPolicy, ...selected.bounds, backgroundColor: "#00000000",
      resizable: false, movable: false, title: "Stream Jams desktop overlay",
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, partition: "stream-jams-overlay",
        ...(options.preloadPath === undefined ? {} : { preload: options.preloadPath }) }
    });
    this.window.removeMenu();
    this.window.setIgnoreMouseEvents(true);
    this.window.setAlwaysOnTop(true, "screen-saver");
    this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.window.webContents.on("will-navigate", event => event.preventDefault());
    this.window.webContents.on("will-attach-webview", event => event.preventDefault());
    this.window.webContents.on("render-process-gone", () => this.destroy());
    this.window.on("closed", () => {
      screen.removeListener("display-added", this.#updateDisplay);
      screen.removeListener("display-removed", this.#updateDisplay);
      screen.removeListener("display-metrics-changed", this.#updateDisplay);
    });
    screen.on("display-added", this.#updateDisplay);
    screen.on("display-removed", this.#updateDisplay);
    screen.on("display-metrics-changed", this.#updateDisplay);
  }

  async load(url: string): Promise<void> {
    this.#ready = false;
    this.#contentInterrupted = false;
    try {
      await this.window.loadURL(url);
      if (this.window.isDestroyed() || this.#contentInterrupted) return;
      this.#ready = true;
      this.#updateDisplay();
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  destroy(): void {
    if (!this.window.isDestroyed()) this.window.destroy();
  }
}
