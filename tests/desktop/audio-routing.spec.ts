import { access, mkdtemp, writeFile } from "node:fs/promises";
import { execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test } from "@playwright/test";
import { finishDesktop, windowByUrl, withCleanup } from "./audio-harness.js";

const executablePath = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
const audioPlayerUrl = "stream-jams-audio://player/";

test("packaged audio player is isolated, hidden, persistent, and lists only explicit outputs", async () => {
  await access(executablePath);
  const root = await mkdtemp(join(tmpdir(), "stream-jams-audio-capability-"));
  const port = await unusedPort();
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({
    server: { host: "127.0.0.1", port },
    storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") }
  }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = configPath;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  const desktop = await _electron.launch({ executablePath, cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
  const desktopProcess = desktop.process();

  const ownedPids: number[] = [];
  await withCleanup(async () => {
    const management = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    await expect(management).toHaveURL(`http://127.0.0.1:${port}/manage`);
    const pageErrors: string[] = [];
    management.on("pageerror", (error) => pageErrors.push(error.message));
    const player = await audioPlayer(desktop);
    ownedPids.push(...await desktop.evaluate(({ app }) => app.getAppMetrics().map((entry: { pid: number }) => entry.pid)));

    const boundary = await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) => candidate.webContents.getURL() === "stream-jams-audio://player/");
      if (window === undefined) return null;
      const preferences = window.webContents.getLastWebPreferences();
      return {
        visible: window.isVisible(),
        focusable: window.isFocusable(),
        nodeIntegration: preferences.nodeIntegration,
        contextIsolation: preferences.contextIsolation,
        sandbox: preferences.sandbox,
        backgroundThrottling: window.webContents.getBackgroundThrottling(),
        partition: window.webContents.session.storagePath
      };
    });
    expect(boundary).toMatchObject({
      visible: false,
      focusable: false,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false
    });
    expect(boundary?.partition).toContain("stream-jams-audio");
    expect(await player!.evaluate(() => ({
      requireType: typeof (globalThis as Record<string, unknown>).require,
      isolated: (globalThis as typeof globalThis & { streamJamsAudioHost?: { isolated?: boolean } }).streamJamsAudioHost?.isolated
    }))).toEqual({ requireType: "undefined", isolated: true });

    const devices = await player!.evaluate(async () => {
      const capability = (globalThis as typeof globalThis & {
        streamJamsAudioCapability?: { listOutputDevices(): Promise<readonly { deviceId: string; label: string }[]> };
      }).streamJamsAudioCapability;
      if (capability === undefined) throw new Error("Audio capability API did not load.");
      return capability.listOutputDevices();
    });
    expect(devices.every(({ deviceId }) => deviceId !== "default" && deviceId !== "communications" && deviceId.trim() !== "")).toBe(true);
    console.info(`Explicit audio outputs: ${devices.map(({ label }) => label || "Unlabelled output").join(" | ") || "none"}`);
    console.info(`selectAudioOutput API: ${await player!.evaluate(() => typeof (navigator.mediaDevices as MediaDevices & { selectAudioOutput?: unknown }).selectAudioOutput)}`);

    // Exercise worker -> main -> sandboxed preload -> player with real cloned
    // bytes, but force zero volume before native play. This is not audible acceptance.
    const nativeStarts = await player.evaluate(() => {
      const original = HTMLMediaElement.prototype.play;
      const starts: { sinkId: string; volume: number }[] = [];
      Object.assign(globalThis, { silentAudioStarts: starts });
      HTMLMediaElement.prototype.play = function () {
        this.volume = 0;
        starts.push({ sinkId: (this as HTMLAudioElement).sinkId, volume: this.volume });
        return original.call(this);
      };
      return starts.length;
    });
    expect(nativeStarts).toBe(0);
    const production = await management.evaluate(async () => {
      const sessionResponse = await fetch("/auth/management/sessions", { method: "POST" });
      if (!sessionResponse.ok) throw new Error("Could not create isolated smoke-test session");
      const session = await sessionResponse.json() as { id: string; csrfToken: string };
      const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, "content-type": "application/json" };
      const capabilityResponse = await fetch("/audio/devices", { headers });
      const capability = await capabilityResponse.json() as { available: boolean; devices: { deviceId: string; label: string }[] };
      if (!capabilityResponse.ok || !capability.available) throw new Error("Production audio transport is unavailable");
      if (capability.devices.length === 0) return { tested: false };
      const device = capability.devices[0]!;
      const created = await fetch("/audio/routes", { method: "POST", headers, body: JSON.stringify({ name: "Silent packaged smoke", deviceId: device.deviceId }) });
      if (!created.ok) throw new Error("Could not bind isolated smoke-test route");
      const route = await created.json() as { id: string };
      const tested = await fetch(`/audio/routes/${route.id}/test`, { method: "POST", headers, body: "{}" });
      if (!tested.ok) throw new Error(`Silent production transport test failed (${tested.status})`);
      return { tested: true };
    });
    if (production.tested) {
      expect(await player.evaluate(() => (globalThis as typeof globalThis & { silentAudioStarts: { sinkId: string; volume: number }[] }).silentAudioStarts))
        .toEqual([{ sinkId: expect.any(String), volume: 0 }]);
      expect(await player.locator("audio").count()).toBe(0);
      console.info("Silent production audio RPC and byte delivery completed; media elements cleaned up.");
    }

    // Verify the rebuilt Settings UI against the real packaged service. This
    // route stays unbound and no UI Test action is invoked.
    await management.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(management.getByRole("heading", { name: "Audio outputs", exact: true })).toBeVisible();
    await management.getByLabel("New output name").fill("Silent UI route");
    await management.getByRole("button", { name: "Create output", exact: true }).click();
    const uiRoute = management.getByRole("group", { name: "Silent UI route audio output" });
    await expect(uiRoute).toContainText("Needs binding");
    await expect(uiRoute.getByLabel("Output device")).toHaveValue("");
    await management.reload();
    await expect(uiRoute).toBeVisible();
    await expect(uiRoute.getByLabel("Output device")).toHaveValue("");
    expect(pageErrors).toEqual([]);
    console.info("Rebuilt Settings UI created and retained an unbound route without playback.");

    await closeManagementToTray(desktop);
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }) => {
      const playerWindow = BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string }; isDestroyed(): boolean }) => candidate.webContents.getURL() === "stream-jams-audio://player/");
      return playerWindow !== undefined && !playerWindow.isDestroyed();
    })).toBe(true);
  }, () => finishDesktop(desktop, root, ownedPids, desktopProcess));
});

test("approved packaged capability check plays two explicit outputs independently, together, and after restart", async () => {
  test.skip(process.env.STREAM_JAMS_AUDIO_TEST !== "1", "Physical audio output requires explicit approval.");
  const labels = process.env.STREAM_JAMS_AUDIO_TEST_OUTPUTS?.split("|").map((label) => label.trim()).filter(Boolean) ?? [];
  expect(labels, "Set STREAM_JAMS_AUDIO_TEST_OUTPUTS to two exact labels separated by |").toHaveLength(2);

  const root = await mkdtemp(join(tmpdir(), "stream-jams-audio-playback-"));
  const port = await unusedPort();
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({
    server: { host: "127.0.0.1", port },
    storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") }
  }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = configPath;
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  let desktop: Awaited<ReturnType<typeof _electron.launch>> | undefined;
  let desktopProcess: ChildProcess | undefined;
  let diagnosticPids: number[] = [];

  await withCleanup(async () => {
   try {
    desktop = await _electron.launch({ executablePath, cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
    desktopProcess = desktop.process();
    desktop.on("console", (message) => { if (message.text().startsWith("Audio shutdown:")) console.info(message.text()); });
    await desktop.evaluate(({ app }) => {
      const started = Date.now();
      for (const event of ["before-quit", "will-quit", "quit", "window-all-closed"] as const) {
        app.on(event, () => console.info(`Audio shutdown: ${event} at ${Date.now() - started}ms`));
      }
    });
    const management = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    const player = await audioPlayer(desktop);
    diagnosticPids = await desktop.evaluate(({ app }) => app.getAppMetrics().map((item: {pid: number}) => item.pid));
    if (process.env.STREAM_JAMS_AUDIO_DIAGNOSTICS === "1") {
      console.info("Diagnostic windows:", JSON.stringify(await desktop.evaluate(({ BrowserWindow, app }) => ({
        native: BrowserWindow.getAllWindows().map((window: { id: number; webContents: { getURL(): string; getOSProcessId(): number } }) => ({id: window.id, url: window.webContents.getURL(), pid: window.webContents.getOSProcessId()})),
        metrics: app.getAppMetrics()
      }))), "management:", management.url());
    }
    const devices = await explicitDevices(player);
    const selected = labels.map((label) => {
      const device = devices.find((candidate) => candidate.label === label);
      if (device === undefined) throw new Error(`Approved output is unavailable: ${label}`);
      return device;
    });
    await expect(management).toHaveURL(`http://127.0.0.1:${port}/manage`);
    await closeManagementToTray(desktop);
    await expect.poll(() => desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .find((candidate: { webContents: { getURL(): string }; isVisible(): boolean }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))?.isVisible())).toBe(false);

    await playTone(player, [selected[0]!.deviceId], 600, `first output: ${selected[0]!.label}`);
    await playTone(player, [selected[1]!.deviceId], 900, `second output: ${selected[1]!.label}`);
    await playTone(player, selected.map(({ deviceId }) => deviceId), 750, "both outputs together");
    diagnosticPids = await desktop.evaluate(({ app }) => app.getAppMetrics().map((item: {pid: number}) => item.pid));
    if (process.env.STREAM_JAMS_AUDIO_DIAGNOSTICS === "1") {
      console.info("Diagnostic process identities:", JSON.stringify(await desktop.evaluate(({ app }) => app.getAppMetrics())));
    }

    const closed = desktop.waitForEvent("close", { timeout: 15_000 }).then(() => null, (error: unknown) => error);
    await desktop.evaluate(({ app }) => app.quit());
    await expect.poll(async () => fetch(`http://127.0.0.1:${port}/health`).then(() => true, () => false), { timeout: 10_000 }).toBe(false);
    console.info("Audio shutdown: service listener stopped");
    const shutdownError = await closed;
    if (shutdownError !== null) throw shutdownError;
    await desktop.close();
    desktop = undefined;
    desktopProcess = undefined;

    desktop = await _electron.launch({ executablePath, cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
    desktopProcess = desktop.process();
    const restartedManagement = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    const restartedPlayer = await audioPlayer(desktop);
    diagnosticPids = await desktop.evaluate(({ app }) => app.getAppMetrics().map((item: {pid: number}) => item.pid));
    const restartedDevices = await explicitDevices(restartedPlayer);
    const restartedIds = labels.map((label) => {
      const device = restartedDevices.find((candidate) => candidate.label === label);
      if (device === undefined) throw new Error(`Approved output is unavailable after restart: ${label}`);
      return device.deviceId;
    });
    await expect(restartedManagement).toHaveURL(`http://127.0.0.1:${port}/manage`);
    await closeManagementToTray(desktop);
    await expect.poll(() => desktop!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .find((candidate: { webContents: { getURL(): string }; isVisible(): boolean }) => candidate.webContents.getURL().startsWith("http://127.0.0.1:"))?.isVisible())).toBe(false);
    await playTone(restartedPlayer, restartedIds, 750, "both outputs together after restart");
  } catch (error) {
    if (process.env.STREAM_JAMS_AUDIO_DIAGNOSTICS === "1") {
      console.info("Original failure before cleanup:", error instanceof Error ? error.message : String(error));
      if (diagnosticPids.length) {
        const snapshot = await promisify(execFile)("powershell.exe", ["-NoProfile", "-File", resolve("tests/desktop/fixtures/capture-owned-waits.ps1"), "-ProcessIds", diagnosticPids.join(",")], { windowsHide: true, timeout: 20_000 }).catch((failure: unknown) => ({stdout: String(failure)}));
        console.info("Native wait snapshot:", snapshot.stdout);
      }
    }
    throw error;
   }
  }, () => finishDesktop(desktop, root, diagnosticPids, desktopProcess));
});

async function closeManagementToTray(desktop: Awaited<ReturnType<typeof _electron.launch>>): Promise<void> {
  await desktop.evaluate(({ BrowserWindow }) => {
    const management = BrowserWindow.getAllWindows().find((candidate: { webContents: { getURL(): string } }) =>
      candidate.webContents.getURL().startsWith("http://127.0.0.1:"));
    if (management === undefined) throw new Error("Management window is unavailable.");
    management.close();
    if (management.isDestroyed() || management.isVisible()) throw new Error("Native close did not hide management to tray.");
  });
}

async function audioPlayer(desktop: Awaited<ReturnType<typeof _electron.launch>>) {
  const player = await windowByUrl(desktop, audioPlayerUrl);
  await player.waitForFunction(() => {
    const capability = (globalThis as typeof globalThis & { streamJamsAudioCapability?: { listOutputDevices?: unknown; playFixture?: unknown } }).streamJamsAudioCapability;
    return typeof capability?.listOutputDevices === "function" && typeof capability.playFixture === "function";
  }, undefined, { timeout: 25_000 });
  return player;
}

async function explicitDevices(player: Awaited<ReturnType<typeof audioPlayer>>): Promise<readonly { deviceId: string; label: string }[]> {
  return player.evaluate(async () => {
    const capability = (globalThis as typeof globalThis & {
      streamJamsAudioCapability?: { listOutputDevices(): Promise<readonly { deviceId: string; label: string }[]> };
    }).streamJamsAudioCapability;
    if (capability === undefined) throw new Error("Audio capability API did not load.");
    return capability.listOutputDevices();
  });
}

async function playTone(
  player: Awaited<ReturnType<typeof audioPlayer>>,
  deviceIds: readonly string[],
  frequency: number,
  phase: string
): Promise<void> {
  console.info(`Audio capability phase: ${phase}`);
  await player.evaluate(async ({ source, deviceIds }) => {
    const capability = (globalThis as typeof globalThis & {
      streamJamsAudioCapability?: { playFixture(request: { source: string; deviceIds: readonly string[]; volume: number }): Promise<void> };
    }).streamJamsAudioCapability;
    if (capability === undefined) throw new Error("Audio capability API did not load.");
    await capability.playFixture({ source, deviceIds, volume: 0.12 });
  }, { source: toneDataUrl(frequency), deviceIds });
}

function toneDataUrl(frequency: number): string {
  const sampleRate = 16_000;
  const sampleCount = sampleRate;
  const bytes = Buffer.alloc(44 + sampleCount * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + sampleCount * 2, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    const edge = Math.min(1, index / 400, (sampleCount - index - 1) / 400);
    bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * index / sampleRate) * 3_500 * edge), 44 + index * 2);
  }
  return `data:audio/wav;base64,${bytes.toString("base64")}`;
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected a TCP address");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}
