import { contextBridge, ipcRenderer } from "electron";
import { VIDEO_DEVICES_COMMAND_CHANNEL, VIDEO_DEVICES_REPORT_CHANNEL, VIDEO_DEVICES_URL, videoDevicesCommandSchema, videoDevicesReportSchema, type VideoDevicesCommand } from "./video-ipc.js";

if (process.isMainFrame && location.href === VIDEO_DEVICES_URL) {
  contextBridge.exposeInMainWorld("streamJamsVideoDevices", Object.freeze({
    onCommand(callback: (command: VideoDevicesCommand) => void) {
      const listener = (_event: unknown, candidate: unknown) => {
        const parsed = videoDevicesCommandSchema.safeParse(candidate);
        if (parsed.success) callback(parsed.data);
      };
      ipcRenderer.on(VIDEO_DEVICES_COMMAND_CHANNEL, listener);
      return () => ipcRenderer.removeListener(VIDEO_DEVICES_COMMAND_CHANNEL, listener);
    },
    report(candidate: unknown) {
      const parsed = videoDevicesReportSchema.safeParse(candidate);
      if (parsed.success) ipcRenderer.send(VIDEO_DEVICES_REPORT_CHANNEL, parsed.data);
    }
  }));
}
