import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
const execute = promisify(execFile);

/** Copies binaries only. Vendor settings are observed fixture fields, not supported public APIs. */
export async function createVendorProvider(kind: "streamerbot" | "speakerbot", authentication?: { password: string; enforce: boolean }) {
  if (process.platform !== "win32") throw new Error("Vendor acceptance requires Windows and installed Streamer.bot/Speaker.bot binaries.");
  const variable = kind === "streamerbot" ? "STREAM_JAMS_TEST_STREAMERBOT_DIR" : "STREAM_JAMS_TEST_SPEAKERBOT_DIR";
  const source = process.env[variable];
  if (!source) throw new Error(`Set ${variable} to the installed vendor binary directory; live data is never copied.`);
  const executable = kind === "streamerbot" ? "Streamer.bot.exe" : "Speaker.bot.exe";
  const supportedVersion = kind === "streamerbot" ? "1.0.7" : "0.1.7";
  const version = await execute("powershell.exe", ["-NoProfile", "-Command", "(Get-Item -LiteralPath $env:STREAM_JAMS_VENDOR_VERSION_FILE).VersionInfo.ProductVersion"], { env: { ...process.env, STREAM_JAMS_VENDOR_VERSION_FILE: join(source, executable) }, windowsHide: true });
  if (!version.stdout.trim().startsWith(supportedVersion)) throw new Error(`Vendor fixture supports ${executable} ${supportedVersion}; found ${version.stdout.trim()}. Review the observed settings schema before accepting a new version.`);
  const root = await mkdtemp(join(tmpdir(), `stream-jams-vendor-${kind}-`));
  const resolvedRoot = relative(resolve(tmpdir()), resolve(root));
  if (!resolvedRoot || resolvedRoot.startsWith("..") || isAbsolute(resolvedRoot)) throw new Error("Vendor fixture is outside the temporary root");
  const listener = createServer();
  await new Promise<void>(resolveListening => listener.listen(0, "127.0.0.1", resolveListening));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("Could not reserve vendor TCP port");
  await new Promise<void>(resolveClose => listener.close(() => resolveClose()));
  const port = address.port;
  try {
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.isFile() && (entry.name === executable || entry.name === `${executable}.config` || /\.(?:dll|png)$/iu.test(entry.name))) await copyFile(join(source, entry.name), join(root, entry.name));
      if (entry.isDirectory() && entry.name === "dlls") {
        await mkdir(join(root, "dlls"));
        for (const file of await readdir(join(source, "dlls"), { withFileTypes: true })) {
          if (!file.isFile() || !/\.(?:dll|png)$/iu.test(file.name)) continue;
          await copyFile(join(source, "dlls", file.name), join(root, "dlls", file.name));
        }
      }
    }
    await mkdir(join(root, "data"));
    const audioFolder = join(root, "audio");
    await mkdir(audioFolder);
    const settings = kind === "streamerbot" ? {
      version: 34, instanceId: randomUUID(), instanceName: "Security acceptance", logLevel: 1,
      windowSettings: { closeConfirmation: false, minimizeToTray: false, minimizeToTrayOnClose: false },
      websockets: { autoStart: true, address: "127.0.0.1", port, endpoint: "/", enableAuth: authentication !== undefined, authEnforce: authentication?.enforce ?? false, authPassword: authentication?.password ?? null, connections: [], servers: [] },
      udp: { autoStart: false, port: 0 }, http: { autoStart: false, address: "127.0.0.1", port: 0 },
      streamDeckSettings: { autoStart: false }, polyPopServerSettings: { autoStart: false }
    } : {
      version: 8, instanceId: randomUUID(), instanceName: "Security acceptance", logLevel: 1,
      websockets: { autoStart: true, address: "127.0.0.1", port, endpoint: "/" },
      volume: 0, saveAudio: true, audioFolder, speakingEnabled: true, enabled: true,
      textToSpeech: { enabledEngines: ["sapi5"], engineConfig: {}, deviceGuid: "00000000-0000-0000-0000-000000000000" }, defaultVoice: null
    };
    await writeFile(join(root, "data", "settings.json"), JSON.stringify(settings));
    let voiceName: string | null = null;
    if (kind === "speakerbot") {
      const voices = await execute("powershell.exe", ["-NoProfile", "-Command", "Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $synth.GetInstalledVoices() | Where-Object Enabled | Select-Object -First 1 | ForEach-Object { $_.VoiceInfo.Name } } finally { $synth.Dispose() }"], { windowsHide: true });
      voiceName = voices.stdout.trim();
      if (!voiceName) throw new Error("Speaker.bot positive speech acceptance requires an installed enabled Windows SAPI5 voice.");
    }
    await writeFile(join(root, "data", "voicealiases.dat"), '\ufeff' + JSON.stringify({ version: 3, t: new Date().toISOString(), aliases: voiceName === null ? [] : [{ id: randomUUID(), audioDevice: null, name: "SecurityTestVoice", voices: [{ name: voiceName, rate: 0, volume: 0, pitch: 0 }] }] }));
    let child: ReturnType<typeof spawn> | null = null;
    const stop = async () => {
      if (child?.pid !== undefined && child.exitCode === null) {
        const exited = new Promise<void>(resolveExit => child!.once("exit", () => resolveExit()));
        await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
        await exited;
      }
      child = null;
      const listening = await new Promise<boolean>(resolveListening => {
        const socket = createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => { socket.destroy(); resolveListening(true); });
        socket.once("error", () => resolveListening(false));
      });
      if (listening) throw new Error("Owned vendor process stopped but its temporary listener remains active");
    };
    return {
      root, port, audioFolder, version: version.stdout.trim(), url: `ws://127.0.0.1:${port}/`,
      start() { child = spawn(join(root, executable), [], { cwd: root, windowsHide: true, stdio: "ignore" }); child.on("error", () => {}); return child; },
      stop,
      async close() {
        await stop();
        const within = relative(resolve(tmpdir()), resolve(root));
        if (!within || within.startsWith("..") || isAbsolute(within)) throw new Error("Refusing to remove a vendor fixture outside the temporary root");
        await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
