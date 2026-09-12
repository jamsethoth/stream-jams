import { contextBridge, ipcRenderer } from "electron";
import { OVERLAY_COMMAND_CHANNEL, OVERLAY_REPLY_CHANNEL, overlayRendererReplySchema, overlayRendererRequestSchema, type OverlayRendererRequest } from "./overlay-ipc.js";
import { OVERLAY_PLAYER_URL } from "./overlay-player-policy.js";

if (process.isMainFrame && location.href === OVERLAY_PLAYER_URL) {
  contextBridge.exposeInMainWorld("streamJamsOverlayHost", Object.freeze({
    onCommand(callback: (request: OverlayRendererRequest) => void) {
      const listener = (_event: unknown, candidate: unknown) => {
        const parsed = overlayRendererRequestSchema.safeParse(candidate);
        if (parsed.success) callback(parsed.data);
      };
      ipcRenderer.on(OVERLAY_COMMAND_CHANNEL, listener);
      return () => ipcRenderer.removeListener(OVERLAY_COMMAND_CHANNEL, listener);
    },
    report(candidate: unknown) {
      const parsed = overlayRendererReplySchema.safeParse(candidate);
      if (parsed.success) ipcRenderer.send(OVERLAY_REPLY_CHANNEL, parsed.data);
    }
  }));
}
