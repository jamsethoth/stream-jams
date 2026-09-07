import { contextBridge, ipcRenderer } from "electron";
import { AUDIO_COMMAND_CHANNEL, AUDIO_REPLY_CHANNEL, audioRendererReplySchema, audioRendererRequestSchema, type AudioRendererRequest } from "./audio-ipc.js";

if (process.isMainFrame && location.href === "stream-jams-audio://player/") {
  contextBridge.exposeInMainWorld("streamJamsAudioHost", Object.freeze({
    isolated: true,
    onCommand(callback: (request: AudioRendererRequest) => void) {
      const listener = (_event: unknown, candidate: unknown) => {
        const parsed = audioRendererRequestSchema.safeParse(candidate);
        if (parsed.success) callback(parsed.data);
      };
      ipcRenderer.on(AUDIO_COMMAND_CHANNEL, listener);
      return () => ipcRenderer.removeListener(AUDIO_COMMAND_CHANNEL, listener);
    },
    report(candidate: unknown) {
      const parsed = audioRendererReplySchema.safeParse(candidate);
      if (parsed.success) ipcRenderer.send(AUDIO_REPLY_CHANNEL, parsed.data);
    }
  }));
}
