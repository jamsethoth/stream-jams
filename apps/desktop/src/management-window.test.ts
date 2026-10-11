import { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi, type Mock } from "vitest";

interface MockContents extends EventEmitter { id: number; mainFrame: { url: string }; send: Mock }
const native = vi.hoisted(() => ({ windows: [] as Array<{ webContents: MockContents }>, ipcMain: null as EventEmitter | null }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  native.ipcMain = new EventEmitter();
  return {
    ipcMain: native.ipcMain,
    dialog: { showMessageBox: vi.fn(), showErrorBox: vi.fn() },
    shell: { openExternal: vi.fn() },
    BrowserWindow: class extends EventEmitter {
      webContents = Object.assign(new EventEmitter(), {
        id: 7, mainFrame: { url: "http://127.0.0.1:4321/manage" }, send: vi.fn(),
        setWindowOpenHandler: vi.fn(), isDestroyed: () => false, isCrashed: () => false
      });
      removeMenu = vi.fn(); show = vi.fn(); focus = vi.fn(); isMinimized = () => false;
      constructor() { super(); native.windows.push(this as unknown as { webContents: MockContents }); }
    }
  };
});
import { ManagementWindow } from "./management-window.js";

const origin = "http://127.0.0.1:4321";
beforeEach(() => { native.windows = []; native.ipcMain?.removeAllListeners(); });

function setup() {
  const management = new ManagementWindow(origin);
  const contents = native.windows[0]!.webContents;
  const frame = contents.mainFrame;
  const ipc = (channel: string, payload?: unknown) => native.ipcMain!.emit(channel, { sender: contents, senderFrame: frame }, payload);
  return { management, contents, ipc };
}

it("ignores a registration from the outgoing document after navigation starts", async () => {
  const { management, contents, ipc } = setup();
  ipc("desktop:guard-ready");
  contents.emit("did-start-navigation", {}, `${origin}/manage`, false, true);
  ipc("desktop:guard-ready"); // The previous document can still register before commit.
  contents.emit("did-navigate", {}, `${origin}/manage`, 200, "OK");
  const { dialog } = await import("electron");
  (dialog.showMessageBox as Mock).mockResolvedValue({ response: 1 });
  await expect(management.requestQuit()).resolves.toBe(true);
  expect(dialog.showMessageBox).toHaveBeenCalledOnce();
  expect(contents.send).not.toHaveBeenCalled();
});

it("asks a newly committed document again for a quit decision sent to its predecessor", async () => {
  const { management, contents, ipc } = setup();
  ipc("desktop:guard-ready");
  const decision = management.requestQuit();
  const requestId = contents.send.mock.calls[0]![1] as string;
  contents.emit("did-navigate", {}, `${origin}/manage`, 200, "OK");
  ipc("desktop:guard-ready");
  ipc("desktop:guard-ready"); // Re-registration within one document does not ask again.
  expect(contents.send.mock.calls).toEqual([["desktop:quit-requested", requestId], ["desktop:quit-requested", requestId]]);
  ipc("desktop:quit-reply", { requestId, allow: true });
  await expect(decision).resolves.toBe(true);
});
