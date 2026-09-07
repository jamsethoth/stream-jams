import { contextBridge, ipcRenderer } from "electron";

const origin = process.argv.find((argument) => argument.startsWith("--stream-jams-origin="))?.slice("--stream-jams-origin=".length);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (process.isMainFrame && location.origin === origin && (location.pathname === "/manage" || location.pathname.startsWith("/manage/") || location.pathname === "/operator")) {
  contextBridge.exposeInMainWorld("streamJamsDesktop", {
    onQuitRequested(listener: (requestId: string) => void) {
      const receive = (_event: unknown, id: unknown) => { if (typeof id === "string" && uuid.test(id)) listener(id); };
      ipcRenderer.on("desktop:quit-requested", receive);
      ipcRenderer.send("desktop:guard-ready");
      return () => { ipcRenderer.removeListener("desktop:quit-requested", receive); };
    },
    resolveQuit(requestId: string, allow: boolean) {
      if (typeof requestId === "string" && uuid.test(requestId) && typeof allow === "boolean") ipcRenderer.send("desktop:quit-reply", { requestId, allow });
    }
  });
}
