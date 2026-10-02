import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

interface NativeWindow extends EventEmitter {
  options: unknown; destroyed: boolean; visible: boolean; webContents: EventEmitter; moveTop: ReturnType<typeof vi.fn>;
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
      visible = false;
      moveTop = vi.fn(() => { order = "overlay"; });
      setIgnoreMouseEvents = vi.fn(); setAlwaysOnTop = vi.fn(); setBounds = vi.fn();
      showInactive = vi.fn(() => { this.visible = true; this.emit("show"); }); hide = vi.fn(() => { this.visible = false; this.emit("hide"); }); removeMenu = vi.fn(); setOpacity = vi.fn();
      isVisible = () => this.visible;
      loadURL = vi.fn(async () => {});
      isDestroyed = () => this.destroyed;
      destroy = () => { this.destroyed = true; this.emit("closed"); };
      constructor(public options: unknown) { super(); native.windows.push(this); }
    }
  };
});
import { screen } from "electron";
import { OverlayWindow } from "./overlay-window.js";
let order = "competitor";
afterEach(() => { for (const window of native.windows) if (!window.destroyed) window.emit("closed"); vi.useRealTimers(); });

it("recovers independently observed ordering while preserving native input policy", async () => {
  vi.useFakeTimers();
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2" })!;
  const window = native.windows[0]!;
  await overlay.load("data:text/html,neutral");
  expect(order).toBe("overlay");
  order = "competitor";
  vi.advanceTimersByTime(150);
  expect(order).toBe("overlay");
  expect(window.setAlwaysOnTop).toHaveBeenCalledTimes(1);
  expect(window.setIgnoreMouseEvents).toHaveBeenCalledTimes(1);
  overlay.destroy();
  const calls = window.moveTop.mock.calls.length;
  vi.advanceTimersByTime(500);
  overlay.ensureTopmost();
  expect(window.moveTop).toHaveBeenCalledTimes(calls);
});

it("guards pending, hidden and interrupted content and avoids duplicate recovery timers", async () => {
  vi.useFakeTimers();
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2" })!;
  const window = native.windows[0]!;
  overlay.ensureTopmost();
  expect(window.moveTop).not.toHaveBeenCalled();
  await overlay.load("data:text/html,neutral");
  window.hide();
  const hiddenCalls = window.moveTop.mock.calls.length;
  overlay.ensureTopmost(); vi.advanceTimersByTime(300);
  expect(window.moveTop).toHaveBeenCalledTimes(hiddenCalls);
  window.showInactive(); window.showInactive();
  await overlay.load("data:text/html,reloaded");
  const calls = window.moveTop.mock.calls.length;
  vi.advanceTimersByTime(100);
  expect(window.moveTop).toHaveBeenCalledTimes(calls + 1);
  expect(vi.getTimerCount()).toBe(1);
  native.displays = [];
  (screen as unknown as EventEmitter).emit("display-removed");
  overlay.ensureTopmost(); vi.advanceTimersByTime(300);
  expect(window.moveTop).toHaveBeenCalledTimes(calls + 1);
  expect(vi.getTimerCount()).toBe(0);
  native.displays = [{ id: 2, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }];
  (screen as unknown as EventEmitter).emit("display-added");
  overlay.ensureTopmost(); vi.advanceTimersByTime(300);
  expect(window.moveTop).toHaveBeenCalledTimes(calls + 1);
  expect(window.visible).toBe(false);
  overlay.destroy();
});

it("keeps recovery stopped across overlapping loads and ignores a queued callback after disposal", async () => {
  vi.useFakeTimers();
  const intervals = vi.spyOn(globalThis, "setInterval");
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2" })!;
  const window = native.windows[0]!;
  await overlay.load("data:text/html,ready");
  const queued = intervals.mock.calls[0]![0] as () => void;
  let finishFirst!: () => void;
  let finishSecond!: () => void;
  vi.mocked(window.loadURL).mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; }));
  const first = overlay.load("data:text/html,first");
  vi.mocked(window.loadURL).mockImplementationOnce(() => new Promise<void>(resolve => { finishSecond = resolve; }));
  const second = overlay.load("data:text/html,second");
  const calls = window.moveTop.mock.calls.length;
  finishFirst(); await first;
  queued(); vi.advanceTimersByTime(300);
  expect(window.moveTop).toHaveBeenCalledTimes(calls);
  expect(vi.getTimerCount()).toBe(0);
  finishSecond(); await second;
  expect(vi.getTimerCount()).toBe(1);
  overlay.destroy();
  const disposedCalls = window.moveTop.mock.calls.length;
  queued();
  expect(window.moveTop).toHaveBeenCalledTimes(disposedCalls);
  intervals.mockRestore();
});

it("tears down once after a background raise failure even when diagnostic delivery throws", async () => {
  vi.useFakeTimers();
  const unavailable = vi.fn(() => { throw new Error("host callback failed"); });
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2", onUnavailable: unavailable })!;
  const window = native.windows[0]!;
  await overlay.load("data:text/html,neutral");
  window.moveTop.mockImplementation(() => { throw new Error("native details should not escape"); });
  expect(() => vi.advanceTimersByTime(300)).not.toThrow();
  expect(unavailable).toHaveBeenCalledExactlyOnceWith({ kind: "renderer-load-failed", reason: "topmost-restoration-failed", exitCode: null });
  expect(window.destroyed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

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

it("reports renderer exit details before failing transparent", async () => {
  const unavailable = vi.fn();
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2", onUnavailable: unavailable })!;
  const window = native.windows[0]!;
  await overlay.load("data:text/html,neutral");
  native.displays[0]!.bounds = { x: 0, y: -1440, width: 2560, height: 1440 };
  (screen as unknown as EventEmitter).emit("display-metrics-changed");
  expect(window.setBounds).toHaveBeenLastCalledWith(native.displays[0]!.bounds);
  window.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: -1073741819 });
  expect(unavailable).toHaveBeenCalledWith({
    kind: "renderer-process-gone",
    reason: "crashed",
    exitCode: -1073741819
  });
  expect(window.destroyed).toBe(true);
});

it("destroys the window and removes display listeners when loading fails", async () => {
  vi.useFakeTimers();
  const emitter = screen as unknown as EventEmitter;
  const before = emitter.listenerCount("display-removed");
  const overlay = OverlayWindow.create({ enabled: true, selectedId: "2" })!;
  const window = native.windows[0]!;
  await overlay.load("data:text/html,ready");
  const calls = window.moveTop.mock.calls.length;
  vi.mocked(window.loadURL).mockRejectedValueOnce(new Error("Neutral load failed"));
  await expect(overlay.load("data:text/html,neutral")).rejects.toThrow("Neutral load failed");
  expect(window.destroyed).toBe(true);
  expect(emitter.listenerCount("display-removed")).toBe(before);
  overlay.ensureTopmost(); vi.advanceTimersByTime(300);
  expect(window.moveTop).toHaveBeenCalledTimes(calls);
  expect(vi.getTimerCount()).toBe(0);
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
  expect(window.moveTop).not.toHaveBeenCalled();
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
  expect(unavailable).toHaveBeenCalledWith({ kind: "display-unavailable", reason: "selected-display-missing", exitCode: null });
  overlay.destroy();
});
