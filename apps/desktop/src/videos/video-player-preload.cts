import { contextBridge, ipcRenderer } from "electron";
import { VIDEO_PLAYER_COMMAND_CHANNEL, VIDEO_PLAYER_REPORT_CHANNEL, videoPlayerCommandSchema, videoPlayerReportSchema, type VideoPlayerCommand } from "./video-ipc.js";

// Exposed only to the player page itself, never to a provider frame.
if (process.isMainFrame && location.protocol === "http:" && location.hostname === "127.0.0.1" &&
  /^\/__stream-jams\/video-player\/(?:live|test)$/u.test(location.pathname) && location.search === "") {
  contextBridge.exposeInMainWorld("streamJamsVideoPlayer", Object.freeze({
    onCommand(callback: (command: VideoPlayerCommand) => void) {
      const listener = (_event: unknown, candidate: unknown) => {
        const parsed = videoPlayerCommandSchema.safeParse(candidate);
        if (parsed.success) callback(parsed.data);
      };
      ipcRenderer.on(VIDEO_PLAYER_COMMAND_CHANNEL, listener);
      return () => ipcRenderer.removeListener(VIDEO_PLAYER_COMMAND_CHANNEL, listener);
    },
    report(candidate: unknown) {
      const parsed = videoPlayerReportSchema.safeParse(candidate);
      if (parsed.success) ipcRenderer.send(VIDEO_PLAYER_REPORT_CHANNEL, parsed.data);
    }
  }));
}
