import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi, type Mock } from "vitest";

interface MockWindow { options: unknown; webContents: EventEmitter & { mainFrame: { url: string } }; destroyed: boolean }
interface MockSession extends EventEmitter {
  protocol: { handle: Mock; unhandle: Mock }; setPermissionCheckHandler: Mock; setPermissionRequestHandler: Mock;
}
const native = vi.hoisted(() => ({ windows: [] as MockWindow[], sessions: [] as MockSession[], available: true, reads: [] as string[] }));
vi.mock("node:fs/promises", () => ({ readFile: async (path: string) => { native.reads.push(path); return new Uint8Array([60, 62]); } }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  const overlaySession = Object.assign(new EventEmitter(), {
    protocol: { handle: vi.fn(), unhandle: vi.fn() }, setPermissionCheckHandler: vi.fn(), setPermissionRequestHandler: vi.fn()
  });
  native.sessions.push(overlaySession);
  return {
    ipcMain: new EventEmitter(), session: { fromPartition: vi.fn(() => overlaySession) },
    protocol: { registerSchemesAsPrivileged: vi.fn() },
    screen: Object.assign(new EventEmitter(), { getAllDisplays: () => native.available ? [{ id: 2, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] : [] }),
    BrowserWindow: class extends EventEmitter {
      webContents = Object.assign(new EventEmitter(), { mainFrame: { url: "stream-jams-overlay://surface/" }, setWindowOpenHandler: vi.fn(), send: vi.fn() });
      destroyed = false;
      setIgnoreMouseEvents = vi.fn(); setAlwaysOnTop = vi.fn(); setBounds = vi.fn(); setOpacity = vi.fn();
      showInactive = vi.fn(); hide = vi.fn(); removeMenu = vi.fn(); loadURL = vi.fn(async () => {});
      isDestroyed = () => this.destroyed;
      destroy = () => { if (!this.destroyed) { this.destroyed = true; this.emit("closed"); } };
      constructor(public options: unknown) { super(); native.windows.push(this); }
    }
  };
});
import { ipcMain, session, protocol } from "electron";
import { registerAudioPlayerScheme } from "../audio/audio-window.js";
import { overlayPlayerScheme } from "./overlay-player-policy.js";
import { PrivateOverlayWindow } from "./private-overlay-window.js";
import { OVERLAY_REPLY_CHANNEL } from "./overlay-ipc.js";

const config = { id: "desktop:primary" as const, kind: "desktop" as const, enabled: true, displayId: "2", opacity: 0.5, layers: [] };
beforeEach(() => { native.windows = []; native.available = true; native.reads = []; vi.clearAllMocks(); });

it("registers the audio and private overlay schemes in a single privileged registration", () => {
  registerAudioPlayerScheme([overlayPlayerScheme]);
  expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledOnce();
  expect(protocol.registerSchemesAsPrivileged).toHaveBeenCalledWith([
    expect.objectContaining({ scheme: "stream-jams-audio" }), overlayPlayerScheme
  ]);
});

it("destroys the native window when private session setup fails", () => {
  native.sessions[0]!.protocol.handle.mockImplementationOnce(() => { throw new Error("protocol setup failed"); });
  expect(() => PrivateOverlayWindow.create(config, { onReply() {}, onDestroyed() {}, onUnavailable() {} })).toThrow("protocol setup failed");
  expect(native.windows[0]!.destroyed).toBe(true);
});

it("releases a registered protocol when a later session setup step fails", () => {
  const s = native.sessions[0]!;
  s.setPermissionRequestHandler.mockImplementationOnce(() => { throw new Error("permission setup failed"); });
  expect(() => PrivateOverlayWindow.create(config, { onReply() {}, onDestroyed() {}, onUnavailable() {} })).toThrow("permission setup failed");
  expect(s.protocol.unhandle).toHaveBeenCalledOnce();
  expect(native.windows[0]!.destroyed).toBe(true);
  const replacement = PrivateOverlayWindow.create(config, { onReply() {}, onDestroyed() {}, onUnavailable() {} });
  expect(replacement).not.toBeNull(); replacement!.destroy();
});

it("creates no private renderer or protocol handler without a selected available display", () => {
  native.available = false;
  expect(PrivateOverlayWindow.create(config, { onReply() {}, onDestroyed() {}, onUnavailable() {} })).toBeNull();
  expect(native.windows).toHaveLength(0);
  expect(native.sessions[0]!.protocol.handle).not.toHaveBeenCalled();
});

it("serves only the three staged renderer resources and denies permissions and downloads", async () => {
  const port = PrivateOverlayWindow.create(config, { onReply() {}, onDestroyed() {}, onUnavailable() {} })!;
  try {
    expect(session.fromPartition).toHaveBeenCalledWith("stream-jams-overlay", { cache: false });
    const s = native.sessions[0]!;
    const handler = s.protocol.handle.mock.calls[0]![1];
    const response = await handler({ url: "stream-jams-overlay://surface/", method: "GET" });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src 'none'");
    expect(native.reads).toHaveLength(1);
    for (const url of ["file:///C:/secret", "http://127.0.0.1/", "stream-jams-overlay://surface/../secret", "stream-jams-overlay://surface/?key=secret", "stream-jams-overlay://surface/private.json"]) {
      expect((await handler({ url, method: "GET" })).status).toBe(404);
    }
    expect((await handler({ url: "stream-jams-overlay://surface/", method: "POST" })).status).toBe(404);
    expect(native.reads).toHaveLength(1);
    expect(s.setPermissionCheckHandler.mock.calls[0]![0]()).toBe(false);
    const permission = vi.fn(); s.setPermissionRequestHandler.mock.calls[0]![0](null, "media", permission, {});
    expect(permission).toHaveBeenCalledWith(false);
    const preventDefault = vi.fn(); s.emit("will-download", { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
  } finally { port.destroy(); }
});

it("accepts replies only from its owned top frame and releases its listeners", async () => {
  const replies: unknown[] = [];
  const before = (ipcMain as unknown as EventEmitter).listenerCount(OVERLAY_REPLY_CHANNEL);
  const port = PrivateOverlayWindow.create(config, { onReply: value => replies.push(value), onDestroyed() {}, onUnavailable() {} })!;
  const w = native.windows[0]!;
  expect(w.options).toMatchObject({ transparent: true, focusable: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await port.load();
  const payload = { generation: 1, requestId: "b6dab44a-2b8b-4b7d-85c6-428ce63c8757", result: { type: "ok" } };
  ipcMain.emit(OVERLAY_REPLY_CHANNEL, { sender: {}, senderFrame: w.webContents.mainFrame }, payload);
  ipcMain.emit(OVERLAY_REPLY_CHANNEL, { sender: w.webContents, senderFrame: { url: w.webContents.mainFrame.url } }, payload);
  expect(replies).toHaveLength(0);
  ipcMain.emit(OVERLAY_REPLY_CHANNEL, { sender: w.webContents, senderFrame: w.webContents.mainFrame }, payload);
  expect(replies).toEqual([payload]);
  port.destroy(); port.destroy();
  expect((ipcMain as unknown as EventEmitter).listenerCount(OVERLAY_REPLY_CHANNEL)).toBe(before);
  expect(native.sessions[0]!.protocol.unhandle).toHaveBeenCalledOnce();
  expect(w.destroyed).toBe(true);
});
