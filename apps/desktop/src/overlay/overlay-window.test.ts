import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";

interface NativeWindow extends EventEmitter {
  options: unknown; destroyed: boolean; webContents: EventEmitter;
  setIgnoreMouseEvents: (ignore: boolean) => void; setAlwaysOnTop: (top: boolean, level: string) => void;
  setBounds: (bounds: unknown) => void; showInactive: () => void; hide: () => void;
  loadURL: (url: string) => Promise<void>;
}
const native = vi.hoisted(() => ({ displays: [{ id: 2, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }], windows: [] as NativeWindow[] }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    screen: Object.assign(new EventEmitter(), { getAllDisplays: () => native.displays }),
    BrowserWindow: class extends EventEmitter {
      webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn() });
      destroyed = false;
      setIgnoreMouseEvents = vi.fn(); setAlwaysOnTop = vi.fn(); setBounds = vi.fn();
      showInactive = vi.fn(); hide = vi.fn(); removeMenu = vi.fn(); setOpacity = vi.fn();
      loadURL = vi.fn(async () => {});
      isDestroyed = () => this.destroyed;
      destroy = () => { this.destroyed = true; this.emit("closed"); };
      constructor(public options: unknown) { super(); native.windows.push(this); }
    }
  };
});
import { screen } from "electron";
import { OverlayWindow } from "./overlay-window.js";

beforeEach(() => { native.windows = []; native.displays = [{ id: 2, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }]; });

it("creates nothing before opt-in or for an unavailable binding", () => {
  expect(OverlayWindow.create({ enabled: false, selectedId: "2" })).toBeNull();
  expect(OverlayWindow.create({ enabled: true, selectedId: null })).toBeNull();
  expect(OverlayWindow.create({ enabled: true, selectedId: "missing" })).toBeNull();
  expect(native.windows).toHaveLength(0);
});

it("shows only ready content without taking focus and releases display listeners", async () => {
  const emitter = screen as unknown as EventEmitter;
  const before = emitter.listenerCount("display-removed");
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2" })!;
  const window = native.windows[0]!;
  expect(window.options).toMatchObject({ x: -1920, width: 1920, transparent: true, focusable: false, skipTaskbar: true, show: false });
  expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
  expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, "screen-saver");
  expect(window.showInactive).not.toHaveBeenCalled();
  await overlay.load("data:text/html,neutral");
  expect(window.showInactive).toHaveBeenCalledOnce();
  native.displays = [];
  emitter.emit("display-removed");
  expect(window.hide).toHaveBeenCalledOnce();
  expect(window.setBounds).toHaveBeenCalledTimes(1);
  overlay.destroy();
  expect(emitter.listenerCount("display-removed")).toBe(before);
  expect(window.destroyed).toBe(true);
});

it("tracks only the bound display geometry and fails transparent on renderer loss", async () => {
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2" })!;
  const window = native.windows[0]!;
  await overlay.load("data:text/html,neutral");
  native.displays[0]!.bounds = { x: 0, y: -1440, width: 2560, height: 1440 };
  (screen as unknown as EventEmitter).emit("display-metrics-changed");
  expect(window.setBounds).toHaveBeenLastCalledWith(native.displays[0]!.bounds);
  window.webContents.emit("render-process-gone");
  expect(window.destroyed).toBe(true);
});

it("destroys the window and removes display listeners when loading fails", async () => {
  const emitter = screen as unknown as EventEmitter;
  const before = emitter.listenerCount("display-removed");
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2" })!;
  const window = native.windows[0]!;
  vi.mocked(window.loadURL).mockRejectedValueOnce(new Error("Neutral load failed"));
  await expect(overlay.load("data:text/html,neutral")).rejects.toThrow("Neutral load failed");
  expect(window.destroyed).toBe(true);
  expect(emitter.listenerCount("display-removed")).toBe(before);
  expect(window.showInactive).not.toHaveBeenCalled();
});

it("does not show interrupted pending content when the selected display returns before loading finishes", async () => {
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2" })!;
  const window = native.windows[0]!;
  let finishLoad!: () => void;
  vi.mocked(window.loadURL).mockImplementationOnce(() => new Promise<void>(resolveLoad => { finishLoad = resolveLoad; }));
  const loading = overlay.load("data:text/html,neutral");
  const selected = native.displays[0]!;
  native.displays = [];
  (screen as unknown as EventEmitter).emit("display-removed");
  native.displays = [selected];
  (screen as unknown as EventEmitter).emit("display-added");
  finishLoad();
  await loading;
  expect(window.showInactive).not.toHaveBeenCalled();
  overlay.destroy();
});

it("uses an owned preload and notifies the host once when the bound display disappears", async () => {
  const unavailable = vi.fn();
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2", preloadPath: "C:/owned/overlay-preload.cjs", onUnavailable: unavailable })!;
  expect(native.windows[0]!.options).toMatchObject({ webPreferences: { preload: "C:/owned/overlay-preload.cjs", sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await overlay.load("stream-jams-overlay://surface/");
  native.displays = [];
  (screen as unknown as EventEmitter).emit("display-removed");
  (screen as unknown as EventEmitter).emit("display-metrics-changed");
  expect(unavailable).toHaveBeenCalledOnce();
  overlay.destroy();
});
