import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi, type Mock } from "vitest";

interface MockWindow { options: unknown; webContents: EventEmitter & { mainFrame: { url: string }; send: Mock }; destroyed: boolean; loadURL: Mock; moveTop: Mock }
interface MockSession extends EventEmitter {
  protocol: { handle: Mock; unhandle: Mock; isProtocolHandled: Mock }; setPermissionCheckHandler: Mock; setPermissionRequestHandler: Mock;
}
const native = vi.hoisted(() => ({ windows: [] as MockWindow[], sessions: [] as MockSession[], available: true, reads: [] as string[], loadError: null as Error | null }));
vi.mock("node:fs/promises", () => ({ readFile: async (path: string) => { native.reads.push(path); return new Uint8Array([60, 62]); } }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  const overlaySession = Object.assign(new EventEmitter(), {
    protocol: { handle: vi.fn(), unhandle: vi.fn(), isProtocolHandled: vi.fn(() => true) }, setPermissionCheckHandler: vi.fn(), setPermissionRequestHandler: vi.fn()
  });
  native.sessions.push(overlaySession);
  return {
    ipcMain: new EventEmitter(), session: { fromPartition: vi.fn(() => overlaySession) },
    protocol: { registerSchemesAsPrivileged: vi.fn() },
    screen: Object.assign(new EventEmitter(), { getAllDisplays: () => native.available ? [{ id: 2, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] : [] }),
    BrowserWindow: class extends EventEmitter {
      webContents = Object.assign(new EventEmitter(), { mainFrame: { url: "stream-jams-overlay://surface/" }, setWindowOpenHandler: vi.fn(), send: vi.fn() });
      destroyed = false;
      visible = false;
      moveTop = vi.fn(); isVisible = () => this.visible;
      setIgnoreMouseEvents = vi.fn(); setAlwaysOnTop = vi.fn(); setBounds = vi.fn(); setOpacity = vi.fn();
      showInactive = vi.fn(() => { this.visible = true; this.emit("show"); }); hide = vi.fn(() => { this.visible = false; this.emit("hide"); }); removeMenu = vi.fn(); loadURL = vi.fn(async () => { if (native.loadError !== null) throw native.loadError; });
      isDestroyed = () => this.destroyed;
      destroy = () => { if (!this.destroyed) { this.destroyed = true; this.emit("closed"); } };
      constructor(public options: unknown) { super(); native.windows.push(this); }
    }
  };
});
import { ipcMain, session, protocol } from "electron";
import { AudioWindow, registerAudioPlayerScheme } from "../audio/audio-window.js";
import { overlayPlayerScheme } from "./overlay-player-policy.js";
import { OverlayHost } from "./overlay-host.js";
import { PrivateOverlayWindow } from "./private-overlay-window.js";
import { OVERLAY_REPLY_CHANNEL } from "./overlay-ipc.js";

const config = { id: "desktop:primary" as const, kind: "desktop" as const, enabled: true, displayId: "2", displayLabel: "Secondary", autoFollowDisplayName: false, opacity: 0.5, layers: [] };
beforeEach(() => { native.windows = []; native.available = true; native.reads = []; native.loadError = null; vi.clearAllMocks(); });

it("raises immediately before a validated start and suppresses dispatch if raising fails", async () => {
  const unavailable = vi.fn();
  const port = PrivateOverlayWindow.create(config, { onReply() {}, onDestroyed() {}, onUnavailable: unavailable })!;
  try {
    await port.load();
    const window = native.windows[0]!;
    const start = { protocolVersion: 1 as const, generation: 1, requestId: "b6dab44a-2b8b-4b7d-85c6-428ce63c8757",
      command: { type: "start" as const, key: { surfaceId: "desktop:primary" as const, moduleId: "alerts" as const, occurrenceId: "ordering", generation: 1 } } };
    window.moveTop.mockClear();
    window.webContents.send.mockImplementation(() => { expect(window.moveTop).toHaveBeenCalledOnce(); });
    expect(() => port.send({ ...start, generation: 0 })).toThrow();
    expect(window.moveTop).not.toHaveBeenCalled();
    port.send(start);
    expect(window.webContents.send).toHaveBeenCalledOnce();
    window.moveTop.mockImplementation(() => { throw new Error("raise failed"); });
    expect(() => port.send(start)).toThrow("Desktop overlay is unavailable");
    expect(window.webContents.send).toHaveBeenCalledOnce();
    expect(unavailable).toHaveBeenCalledExactlyOnceWith({ kind: "renderer-load-failed", reason: "topmost-restoration-failed", exitCode: null });
  } finally { port.destroy(); }
});

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
    expect(response.headers.get("Content-Security-Policy")).toContain("connect-src stream-jams-overlay://surface/media/;");
    expect(response.headers.get("Content-Security-Policy")).toContain("font-src 'self';");
    expect(response.headers.get("Content-Security-Policy")).not.toMatch(/https?:|wss?:|data:|blob:|unsafe-eval/);
    expect(response.headers.get("Content-Security-Policy")).toContain("media-src 'self'");
    expect(response.headers.get("Content-Security-Policy")).toContain("img-src 'self'");
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

const mediaGrant = () => ({ handle: `med_${"g".repeat(43)}`, expiresAt: Date.now() + 60_000,
  snapshot: { assetId: "media", version: "a".repeat(64), mimeType: "audio/wav" as const, sizeBytes: 100_000_000, durationMs: 1000 } });

it.each(["audio", "overlay"] as const)("installs media on the actual %s session and aborts owner reads before native teardown", async kind => {
  const signals: AbortSignal[] = [];
  const upstream = vi.fn(async (_url: unknown, init?: RequestInit) => {
    signals.push(init!.signal as AbortSignal);
    return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); } }), {
      headers: { "Content-Type": "audio/wav", "Content-Length": "100000000" }
    });
  });
  const options = { trustedServiceOrigin: "http://127.0.0.1:1234", generation: 7, fetch: upstream as typeof fetch };
  let ready = false;
  const getOptions = vi.fn(() => { if (!ready) throw new Error("The owned service is starting"); return options; });
  const port = kind === "audio" ? new AudioWindow({ onReply() {}, onDestroyed() {} }, getOptions) :
    PrivateOverlayWindow.create(config, { onReply() {}, onDestroyed() {}, onUnavailable() {} }, getOptions)!;
  try {
    // Device enumeration/configuration can create a renderer before the service reports its HTTP origin.
    expect(getOptions).not.toHaveBeenCalled();
    expect(() => port.issueMedia("owner", mediaGrant())).toThrow("The owned service is starting");
    ready = true;
    const handler = native.sessions[0]!.protocol.handle.mock.calls[0]![1] as (request: Request) => Promise<Response>;
    const schemeOrigin = kind === "audio" ? "stream-jams-audio://player" : "stream-jams-overlay://surface";
    const reference = port.issueMedia("owner", mediaGrant());
    const originalOrigin = options.trustedServiceOrigin;
    options.trustedServiceOrigin = "http://127.0.0.1:4321";
    expect(reference).not.toHaveProperty("expiresAt");
    expect(reference.handle).not.toContain("med_");
    const url = `${schemeOrigin}/media/${reference.handle}`;
    const response = await handler(new Request(url));
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0]![0]).toBe(`${originalOrigin}/media/${mediaGrant().handle}`);
    expect(signals[0]!.aborted).toBe(false);
    port.revokeMediaOwner("owner");
    expect(signals[0]!.aborted).toBe(true);
    expect((await handler(new Request(url))).status).toBe(404);
    const replacement = port.issueMedia("second-owner", mediaGrant());
    expect(getOptions).toHaveBeenCalledTimes(2);
    const replacementUrl = `${schemeOrigin}/media/${replacement.handle}`;
    await handler(new Request(replacementUrl));
    port.destroy();
    expect(signals[1]!.aborted).toBe(true);
    expect((await handler(new Request(replacementUrl))).status).toBe(404);
    expect(() => port.issueMedia("later", mediaGrant())).toThrow("Private media ownership is unavailable");
  } finally { port.destroy(); }
});

it("accepts replies only from its owned top frame and releases its listeners", async () => {
  const replies: unknown[] = [];
  const before = (ipcMain as unknown as EventEmitter).listenerCount(OVERLAY_REPLY_CHANNEL);
  const port = PrivateOverlayWindow.create(config, { onReply: value => replies.push(value), onDestroyed() {}, onUnavailable() {} })!;
  const w = native.windows[0]!;
  expect(w.options).toMatchObject({ transparent: true, focusable: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await port.load();
  const payload = { protocolVersion: 1, generation: 1, requestId: "b6dab44a-2b8b-4b7d-85c6-428ce63c8757", result: { type: "ok" } };
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

it("preserves a native load rejection as renderer-load-failed through the private adapter", async () => {
  native.loadError = new TypeError("private renderer load failed");
  const host = new OverlayHost(
    (candidate, callbacks) => PrivateOverlayWindow.create(candidate, callbacks),
    () => ({ available: true, displays: [{ id: "2", label: "Secondary", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] })
  );
  host.beginOwnership();
  await host.configure(config);

  await expect(host.prepare({
    key: { surfaceId: "desktop:primary", moduleId: "alerts", occurrenceId: "load-failure", generation: 1 },
    timing: { startsAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 1000 },
    instructions: [],
    assets: []
  })).resolves.toBe("unavailable");
  await expect(host.getStatus()).resolves.toMatchObject({
    diagnostic: {
      kind: "renderer-load-failed",
      operation: null,
      reason: "TypeError:private renderer load failed",
      exitCode: null,
      consecutiveFailures: 1
    }
  });
  await host.close();
});
