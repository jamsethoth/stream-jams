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
  onUnavailable?: (failure: OverlayWindowFailure) => void;
}

export interface OverlayWindowFailure {
  readonly kind: "renderer-process-gone" | "renderer-load-failed" | "display-unavailable";
  readonly reason: string;
  readonly exitCode: number | null;
}

/** Native feasibility adapter. Production ownership and private transport are added by the configured host. */
export class OverlayWindow {
  readonly window: BrowserWindow;
  readonly #selectedId: string;
  #ready = false;
  #contentInterrupted = false;
  #loadGeneration = 0;
  #recoveryTimer: ReturnType<typeof setInterval> | undefined;
  readonly #shown = (): void => {
    this.ensureTopmost();
    if (!this.#ready || this.#contentInterrupted || this.window.isDestroyed() || !this.window.isVisible() || this.#recoveryTimer !== undefined) return;
    this.#recoveryTimer = setInterval(() => this.ensureTopmost(), 100);
    this.#recoveryTimer.unref();
  };
  readonly #onUnavailable: ((failure: OverlayWindowFailure) => void) | undefined;
  readonly #updateDisplay = (): void => {
    if (this.window.isDestroyed()) return;
    const selected = selectBoundDisplay(enumerateDesktopDisplays(), this.#selectedId);
    if (selected === null) {
      const firstInterruption = !this.#contentInterrupted;
      this.#contentInterrupted = true;
      this.#ready = false; // A reconnect must not replay interrupted content.
      this.#stopRecovery();
      this.window.hide();
      if (firstInterruption) this.#onUnavailable?.({ kind: "display-unavailable", reason: "selected-display-missing", exitCode: null });
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
    this.window.webContents.on("render-process-gone", (_event, details) => {
      this.#onUnavailable?.({ kind: "renderer-process-gone", reason: details.reason, exitCode: details.exitCode });
      this.destroy();
    });
    this.window.on("closed", () => {
      this.#ready = false;
      this.#stopRecovery();
      screen.removeListener("display-added", this.#updateDisplay);
      screen.removeListener("display-removed", this.#updateDisplay);
      screen.removeListener("display-metrics-changed", this.#updateDisplay);
    });
    this.window.on("hide", () => this.#stopRecovery());
    this.window.on("show", this.#shown);
    screen.on("display-added", this.#updateDisplay);
    screen.on("display-removed", this.#updateDisplay);
    screen.on("display-metrics-changed", this.#updateDisplay);
  }

  async load(url: string): Promise<void> {
    const generation = ++this.#loadGeneration;
    this.#stopRecovery();
    this.#ready = false;
    this.#contentInterrupted = false;
    try {
      await this.window.loadURL(url);
      if (generation !== this.#loadGeneration || this.window.isDestroyed() || this.#contentInterrupted) return;
      this.#ready = true;
      this.#updateDisplay();
      this.#shown();
    } catch (error) {
      if (generation !== this.#loadGeneration || this.window.isDestroyed()) throw error;
      this.#onUnavailable?.({ kind: "renderer-load-failed", reason: safeReason(error, "renderer-load-failed"), exitCode: null });
      this.destroy();
      throw error;
    }
  }

  destroy(): void {
    this.#ready = false;
    this.#stopRecovery();
    if (!this.window.isDestroyed()) this.window.destroy();
  }

  ensureTopmost(): void {
    if (!this.#ready || this.#contentInterrupted || this.window.isDestroyed() || !this.window.isVisible()) return;
    try { this.window.moveTop(); }
    // error-provenance: allow expected -- native failure becomes a bounded unavailable diagnostic and transparent teardown
    catch {
      this.#ready = false;
      this.#stopRecovery();
      try { this.#onUnavailable?.({ kind: "renderer-load-failed", reason: "topmost-restoration-failed", exitCode: null }); }
      // error-provenance: allow cleanup -- a host diagnostic exception must not escape the background recovery callback
      catch { /* Native teardown must still run. */ }
      finally { this.destroy(); }
    }
  }

  #stopRecovery(): void {
    if (this.#recoveryTimer !== undefined) clearInterval(this.#recoveryTimer);
    this.#recoveryTimer = undefined;
  }
}

function safeReason(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || error.message.trim() === "") return fallback;
  return `${error.name}:${error.message}`.slice(0, 256);
}
