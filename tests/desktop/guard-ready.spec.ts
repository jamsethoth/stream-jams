import { EventEmitter } from "node:events";
import { expect, test } from "@playwright/test";
import { observeGuardReady } from "./guard-ready.js";

test("guard readiness waits for the management main frame and detaches", () => {
  const ipcMain = new EventEmitter();
  const frame = { url: "http://127.0.0.1:4321/manage/settings" };
  const sender = Object.assign(new EventEmitter(), { id: 7, mainFrame: frame, getURL: () => frame.url });
  const electron = { ipcMain, BrowserWindow: { getAllWindows: () => [{ webContents: sender }] } } as unknown as Parameters<typeof observeGuardReady>[0];
  const observed = globalThis as typeof globalThis & { shutdownGuard?: { ready: boolean; dispose(): void } };
  try {
    observeGuardReady(electron, "http://127.0.0.1:4321");
    expect(observed.shutdownGuard?.ready).toBe(false);
    ipcMain.emit("desktop:guard-ready", { sender: { id: 8 }, senderFrame: frame });
    ipcMain.emit("desktop:guard-ready", { sender, senderFrame: { ...frame } });
    frame.url = "http://127.0.0.1:4322/manage";
    ipcMain.emit("desktop:guard-ready", { sender, senderFrame: frame });
    frame.url = "http://127.0.0.1:4321/manage/settings";
    expect(observed.shutdownGuard?.ready).toBe(false);
    expect(ipcMain.listenerCount("desktop:guard-ready")).toBe(1);
    ipcMain.emit("desktop:guard-ready", { sender, senderFrame: frame });
    expect(observed.shutdownGuard?.ready).toBe(true);
    expect(ipcMain.listenerCount("desktop:guard-ready")).toBe(0);
    observeGuardReady(electron, "http://127.0.0.1:4321");
    observed.shutdownGuard?.dispose();
    expect(ipcMain.listenerCount("desktop:guard-ready")).toBe(0);
  } finally {
    observed.shutdownGuard?.dispose();
    delete observed.shutdownGuard;
  }
});

test("reload readiness ignores stale registration until main-frame navigation starts", () => {
  const ipcMain = new EventEmitter();
  const origin = "http://127.0.0.1:4321";
  const frame = { url: `${origin}/manage` };
  const sender = Object.assign(new EventEmitter(), { id: 7, mainFrame: frame, getURL: () => frame.url });
  const electron = { ipcMain, BrowserWindow: { getAllWindows: () => [{ webContents: sender }] } } as unknown as Parameters<typeof observeGuardReady>[0];
  const observed = globalThis as typeof globalThis & { shutdownGuard?: { ready: boolean; dispose(): void } };
  const ready = () => ipcMain.emit("desktop:guard-ready", { sender, senderFrame: frame });
  try {
    observeGuardReady(electron, { origin, afterNavigation: true });
    ready();
    expect(observed.shutdownGuard?.ready).toBe(false);
    sender.emit("did-start-navigation", {}, frame.url, true, true);
    sender.emit("did-start-navigation", {}, frame.url, false, false);
    ready();
    expect(observed.shutdownGuard?.ready).toBe(false);
    sender.emit("did-start-navigation", {}, frame.url, false, true);
    ready();
    expect(observed.shutdownGuard?.ready).toBe(true);
    expect(ipcMain.listenerCount("desktop:guard-ready")).toBe(0);
    expect(sender.listenerCount("did-start-navigation")).toBe(0);
  } finally {
    observed.shutdownGuard?.dispose();
    delete observed.shutdownGuard;
  }
});
