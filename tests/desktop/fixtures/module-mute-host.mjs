import { app } from "electron";
import process from "node:process";
import console from "node:console";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const build = process.argv.at(-1);
const { AudioHost } = await import(pathToFileURL(resolve(build, "audio/audio-host.js")).href);
const { AudioWindow, registerAudioPlayerScheme } = await import(pathToFileURL(resolve(build, "audio/audio-window.js")).href);
app.disableHardwareAcceleration();
app.setPath("userData", process.env.STREAM_JAMS_DESKTOP_USER_DATA_PATH);
registerAudioPlayerScheme();
app.on("window-all-closed", () => {});
void app.whenReady().then(async () => {
  globalThis.muteResults = [];
  globalThis.muteDiagnostics = [];
  const host = new AudioHost(callbacks => {
    const window = new AudioWindow(callbacks);
    const load = window.load.bind(window);
    window.load = async () => {
      await load();
      // Instrument only the unavailable hardware boundary. The production player,
      // media loading/decoding, preload, IPC, host and lifecycle remain real.
      await window.window.webContents.executeJavaScript(`
        navigator.mediaDevices.enumerateDevices = async () => [{ kind: "audiooutput", deviceId: "acceptance-output", label: "Silent acceptance" }];
        HTMLMediaElement.prototype.setSinkId = async function () {};
        globalThis.muteNativeStarts = [];
        const nativePlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          if (this.volume !== 0) throw new Error("Acceptance sound must remain silent");
          this.playbackRate = 0.25;
          globalThis.muteNativeStarts.push({ muted: this.muted, volume: this.volume });
          return nativePlay.call(this);
        };
        undefined;
      `);
    };
    // Fixed bundled tone, no caller-selected URL or live service grant.
    window.issueMedia = (_owner, grant) => ({ protocolVersion: 1, handle: "private_" + "T".repeat(43), snapshot: grant.snapshot });
    return window;
  }, diagnostic => globalThis.muteDiagnostics.push(diagnostic));
  globalThis.moduleMuteHost = host;
  globalThis.queueMuteSound = (moduleId, playbackId) => {
    const durationMs = 5000;
    const snapshot = { assetId: "tone", version: "0".repeat(64), mimeType: "audio/wav", sizeBytes: 48044, durationMs: 1000 };
    const payload = {
      batch: { moduleId, playbackId, documentId: playbackId, durationMs, muted: false,
        layers: [{ sourceKind: "audio", layerId: "tone", assetId: "tone", volume: 0 }],
        destinations: [{ deviceId: "acceptance-output", routeIds: ["silent-route"] }] },
      assets: [{ assetId: "tone", grant: { handle: "med_" + "A".repeat(43), expiresAt: Date.now() + 60000, snapshot } }],
      startDeadlineMs: Date.now() + 5000, deadlineMs: Date.now() + durationMs
    };
    void host.play(payload).then(result => globalThis.muteResults.push({ playbackId, result }), error => globalThis.muteResults.push({ playbackId, error: error.message }));
  };
  host.beginOwnership();
  await host.setModuleMutes({ alerts: false, "screen-effects": false });
  await host.listOutputDevices();
  globalThis.muteReady = true;
  app.on("before-quit", () => host.serviceLost());

}).catch(error => { globalThis.muteFixtureError = `${error.stack} CAUSE: ${error.cause?.stack} DIAGNOSTICS: ${globalThis.muteDiagnostics?.map(item => item.exception?.stack ?? item.message).join("\n")}`; console.error(error); });
