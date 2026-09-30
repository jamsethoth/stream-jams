export function observeGuardReady({ ipcMain, BrowserWindow }: Pick<typeof import("electron"), "ipcMain" | "BrowserWindow">, input: string | { origin: string; afterNavigation: true }): void {
  const origin = typeof input === "string" ? input : input.origin;
  let navigated = typeof input === "string";
  const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith(`${origin}/manage`));
  if (window === undefined) throw new Error("Expected the management window");
  const observed = globalThis as typeof globalThis & { shutdownGuard?: { ready: boolean; dispose(): void } };
  const listener = (event: Electron.IpcMainEvent) => {
    if (!navigated || event.sender.id !== window.webContents.id || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== origin) return;
    observed.shutdownGuard!.ready = true;
    observed.shutdownGuard!.dispose();
  };
  const navigation = (_event: Electron.Event, url: string, inPlace: boolean, mainFrame: boolean) => {
    if (mainFrame && !inPlace && url.startsWith(`${origin}/manage`)) navigated = true;
  };
  observed.shutdownGuard = { ready: false, dispose: () => {
    ipcMain.removeListener("desktop:guard-ready", listener);
    window.webContents.removeListener("did-start-navigation", navigation);
  } };
  if (!navigated) window.webContents.on("did-start-navigation", navigation);
  ipcMain.on("desktop:guard-ready", listener);
}
