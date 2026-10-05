import type { ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { SurfaceSettingsView, TimerDefinition, TimerRunState } from "../../packages/core/dist/index.js";
import { _electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { windowByUrl } from "./audio-harness.js";

const executablePath = resolve(process.env.STREAM_JAMS_TEST_EXECUTABLE ?? "apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
const overlayUrl = "stream-jams-overlay://surface/";
test.use({ trace: "off", screenshot: "off", video: "off", launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

test("@hardware packaged browser and hidden desktop agree through Timer transitions and renderer recovery, then Quit", async ({ page }) => {
  await access(executablePath);
  const packageSha256 = createHash("sha256").update(await readFile(join(dirname(executablePath), "resources", "app.asar"))).digest("hex");
  const root = await mkdtemp(join(tmpdir(), "stream-jams-desktop-timers-"));
  const port = await unusedPort();
  await writeFile(join(root, "config.json"), JSON.stringify({
    server: { host: "127.0.0.1", port },
    storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") },
    playback: { paused: false, muted: true, moduleMutes: { alerts: true, "screen-effects": true }, doNotDisturb: false }
  }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  env.STREAM_JAMS_CONFIG_PATH = join(root, "config.json");
  env.STREAM_JAMS_DESKTOP_USER_DATA_PATH = join(root, "electron");
  env.STREAM_JAMS_SHUTDOWN_LOG = join(root, "shutdown.jsonl");
  let desktop: ElectronApplication | undefined;
  let child: ChildProcess | undefined;
  const failures: unknown[] = [];
  const evidence: Record<string, unknown> = { packageSha256, physicalAudibility: false };
  try {
    desktop = await _electron.launch({ executablePath, cwd: root, env, chromiumSandbox: true, timeout: 30_000 });
    child = desktop.process();
    await desktop.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.prototype.show = function () { this.hide(); };
      BrowserWindow.prototype.showInactive = function () { this.hide(); };
      for (const window of BrowserWindow.getAllWindows()) window.hide();
      dialog.showErrorBox = (title, message) => {
        const state = globalThis as typeof globalThis & { timerNativeErrors?: { title: string; message: string }[] };
        state.timerNativeErrors ??= [];
        state.timerNativeErrors.push({ title, message });
      };
    });
    const management = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    await expect(management.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    const base = `http://127.0.0.1:${port}`;
    const sessionResponse = await fetch(`${base}/auth/management/sessions`, { method: "POST" });
    const session = await sessionResponse.json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
    async function api<T>(path: string, method = "GET", payload?: unknown): Promise<T> {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { ...headers, ...(payload === undefined ? {} : { "content-type": "application/json" }) },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(30_000)
      });
      expect(response.ok, `${method} ${path}: HTTP ${response.status}`).toBe(true);
      return response.status === 204 ? undefined as T : response.json() as Promise<T>;
    }
    const surfaces = await api<SurfaceSettingsView>("/overlay-surfaces");
    const display = surfaces.desktop.displays[0];
    expect(display).toBeDefined();
    const surface = surfaces.surfaces.find(candidate => candidate.kind === "desktop")!;
    await api(`/overlay-surfaces/${surface.id}`, "PUT", {
      id: surface.id,
      kind: surface.kind,
      enabled: true,
      displayId: display!.id,
      autoFollowDisplayName: surface.autoFollowDisplayName,
      opacity: surface.opacity,
      layers: surface.layers.map(layer => layer.moduleId === "timers" ? { ...layer, visible: true } : layer)
    });
    const moduleConfig = await api<{ enabled: boolean; config: unknown }>("/overlay-modules/timers/config");
    await api("/overlay-modules/timers/config", "PUT", { enabled: true, config: moduleConfig.config });
    const output = await api<{ url: string }>("/management/overlay-outputs/keys", "POST", {
      overlayId: "default", moduleId: null, purpose: "live", scope: "unified"
    });
    await page.goto(output.url);
    await expect(page.getByTestId("overlay-root")).toBeVisible();
    const define = (label: string, durationMs: number) => api<TimerDefinition>("/timers", "POST", {
      label, durationMs, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null,
      outputs: { browserSource: false, deviceRouteIds: [] }
    });
    const [longTimer, shortTimer] = await Promise.all([define("Long mitts timer", 120_000), define("Short reward timer", 3_000)]);
    await api(`/timers/${longTimer.id}/start`, "POST");
    await api(`/timers/${shortTimer.id}/start`, "POST");
    const running = await api<readonly TimerRunState[]>("/timers/state");
    expect(running.filter(state => state.status === "running")).toHaveLength(2);
    let overlay = await windowByUrl(desktop, overlayUrl);
    await expect(overlay.getByText("Long mitts timer", { exact: true })).toBeVisible();
    await expect(overlay.getByText("Short reward timer", { exact: true })).toBeVisible();
    await expect(page.getByText("Long mitts timer", { exact: true })).toBeVisible();
    const seconds = (value: string | null) => value!.split(":").reduce((total, part) => total * 60 + Number(part), 0);
    const agreement = async () => {
      await expect.poll(async () => Math.abs(seconds(await page.getByTestId(`timer-value-${longTimer.id}`).textContent())
        - seconds(await overlay.getByTestId(`timer-value-${longTimer.id}`).textContent()))).toBeLessThanOrEqual(1);
    };
    await agreement();
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible()))).toBe(true);
    const initialValue = seconds(await page.getByTestId(`timer-value-${longTimer.id}`).textContent());
    await expect.poll(async () => seconds(await page.getByTestId(`timer-value-${longTimer.id}`).textContent())).toBeLessThan(initialValue);
    await expect.poll(async () => seconds(await overlay.getByTestId(`timer-value-${longTimer.id}`).textContent())).toBeLessThan(initialValue);
    await agreement();

    await api(`/timers/${longTimer.id}/pause`, "POST");
    await expect(overlay.getByRole("listitem", { name: /Long mitts timer, paused/u })).toBeVisible();
    await expect(page.getByRole("listitem", { name: /Long mitts timer, paused/u })).toBeVisible();
    await expect.poll(async () => await page.getByTestId(`timer-value-${longTimer.id}`).textContent()
      === await overlay.getByTestId(`timer-value-${longTimer.id}`).textContent()).toBe(true);
    await expect(overlay.getByTestId(`timer-value-${shortTimer.id}`)).toHaveText("0:00", { timeout: 4_000 });
    await expect(overlay.getByText("Short reward timer", { exact: true })).toHaveCount(0, { timeout: 6_500 });
    await expect(page.getByText("Short reward timer", { exact: true })).toHaveCount(0);
    const pausedState = (await api<readonly TimerRunState[]>("/timers/state")).find(state => state.definitionId === longTimer.id)!;
    const oldPid = await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL() === "stream-jams-overlay://surface/")!;
      const pid = window.webContents.getOSProcessId();
      window.webContents.forcefullyCrashRenderer();
      return pid;
    });
    await expect.poll(() => overlay.isClosed()).toBe(true);
    await api("/overlay-surfaces/desktop/retry", "POST", {});
    overlay = await windowByUrl(desktop, overlayUrl);
    await expect(overlay.getByRole("listitem", { name: /Long mitts timer, paused/u })).toBeVisible();
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .find(candidate => candidate.webContents.getURL() === "stream-jams-overlay://surface/")!.webContents.getOSProcessId())).not.toBe(oldPid);
    expect((await api<readonly TimerRunState[]>("/timers/state")).find(state => state.definitionId === longTimer.id)).toEqual(pausedState);
    await agreement();
    await api(`/timers/${longTimer.id}/resume`, "POST");
    const restarted = await api<{ state: TimerRunState }>(`/timers/${longTimer.id}/restart`, "POST");
    expect(restarted.state.status).toBe("running");
    await expect(overlay.getByRole("listitem", { name: /Long mitts timer, running/u })).toBeVisible();
    await expect(page.getByRole("listitem", { name: /Long mitts timer, running/u })).toBeVisible();
    await agreement();

    const currentSurface = (await api<SurfaceSettingsView>("/overlay-surfaces")).surfaces.find(candidate => candidate.kind === "desktop")!;
    await api(`/overlay-surfaces/${currentSurface.id}`, "PUT", {
      id: currentSurface.id, kind: currentSurface.kind, enabled: currentSurface.enabled,
      displayId: currentSurface.displayId, autoFollowDisplayName: currentSurface.autoFollowDisplayName, opacity: currentSurface.opacity,
      layers: currentSurface.layers.map(layer => layer.moduleId === "timers" ? { ...layer, visible: false } : layer)
    });
    await expect(overlay.getByText("Long mitts timer", { exact: true })).toBeHidden();
    await api(`/overlay-surfaces/${currentSurface.id}`, "PUT", {
      id: currentSurface.id, kind: currentSurface.kind, enabled: currentSurface.enabled,
      displayId: currentSurface.displayId, autoFollowDisplayName: currentSurface.autoFollowDisplayName, opacity: currentSurface.opacity,
      layers: currentSurface.layers.map(layer => layer.moduleId === "timers" ? { ...layer, visible: true } : layer)
    });
    await expect(overlay.getByText("Long mitts timer", { exact: true })).toBeVisible();
    // Real device enumeration, private media protocol, preload and player are
    // exercised. Only the selected unavailable sink is fault-injected; PCM is silent.
    let devices = await api<{ available: boolean; devices: { deviceId: string }[] }>("/audio/devices");
    if (!devices.available) { await api("/audio/retry", "POST", {}); devices = await api("/audio/devices"); }
    expect(devices.available).toBe(true);
    expect(devices.devices.length, "Two enumerated outputs are required for recipient isolation").toBeGreaterThanOrEqual(2);
    const healthy = devices.devices[0]!.deviceId;
    const missing = devices.devices[1]!.deviceId;
    const routes = await Promise.all([healthy, missing].map((deviceId, index) =>
      api<{ id: string }>("/audio/routes", "POST", { name: `Silent Timer acceptance ${index}`, deviceId })));
    const imported = await fetch(`${base}/assets/import`, {
      method: "POST", headers: { ...headers, "content-type": "application/octet-stream",
        "x-stream-jams-file-name": "timer-silence.wav", "x-stream-jams-mime-type": "audio/wav" },
      body: new Uint8Array(silentWav(12)), signal: AbortSignal.timeout(15_000)
    });
    expect(imported.status).toBe(201);
    const asset = await imported.json() as { id: string };
    const player = await windowByUrl(desktop, "stream-jams-audio://player/");
    await player.evaluate(({ healthy, missing }) => {
      const state = globalThis as CueGlobal;
      state.timerCueSamples = []; state.timerCueFailures = 0;
      const setSink = HTMLMediaElement.prototype.setSinkId;
      HTMLMediaElement.prototype.setSinkId = async function (deviceId) {
        if (deviceId === missing) { state.timerCueFailures = (state.timerCueFailures ?? 0) + 1; throw new DOMException("Injected unavailable Timer output", "NotFoundError"); }
        return setSink.call(this, deviceId);
      };
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = async function () {
        await play.call(this);
        state.timerCueSamples!.push({ element: this, selectedHealthy: this.sinkId === healthy,
          privateSource: this.src.startsWith("stream-jams-audio://player/media/private_") });
      };
    }, { healthy, missing });
    const cueTimer = async (label: string, browserSource: boolean, deviceRouteIds: string[]) => api<TimerDefinition>("/timers", "POST", {
      label, durationMs: 60_000, iconAssetId: null, startAudioAssetId: asset.id, endAudioAssetId: asset.id,
      outputs: { browserSource, deviceRouteIds }
    });
    const cue = await cueTimer("Silent routed timer", true, routes.map(route => route.id));
    expect((await api<{ muted: boolean }>("/playback")).muted).toBe(true);
    const browserAudio = page.getByTestId("overlay-module-timers").locator("audio");
    // Native cue delivery settles at playback completion. Observe live media
    // before awaiting the command so current mute and recovery happen in flight.
    const startCue = api(`/timers/${cue.id}/start`, "POST").then(
      result => ({ result, error: null }), (error: unknown) => ({ result: undefined, error })
    );
    await expect(browserAudio).toHaveCount(1);
    await expect.poll(() => cueSamples(player)).toEqual([{ selectedHealthy: true, privateSource: true, muted: false, progressing: true }]);
    await expect.poll(() => player.evaluate(() => (globalThis as CueGlobal).timerCueFailures)).toBe(1);
    await expect.poll(() => browserAudio.evaluate((audio: HTMLAudioElement) => audio.currentTime > 0 && !audio.muted)).toBe(true);
    await api("/playback/unmute", "POST", {});
    expect((await api<{ muted: boolean }>("/playback")).muted).toBe(false);
    await expect.poll(() => cueSamples(player)).toEqual([{ selectedHealthy: true, privateSource: true, muted: false, progressing: true }]);
    await expect.poll(() => browserAudio.evaluate((audio: HTMLAudioElement) => !audio.muted && audio.currentTime > 0)).toBe(true);
    await api(`/timers/${cue.id}/pause`, "POST");
    await api(`/timers/${cue.id}/resume`, "POST");
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .find(candidate => candidate.webContents.getURL() === "stream-jams-overlay://surface/")!.webContents.forcefullyCrashRenderer());
    await expect.poll(() => overlay.isClosed()).toBe(true);
    await api("/overlay-surfaces/desktop/retry", "POST", {});
    overlay = await windowByUrl(desktop, overlayUrl);
    await expect(overlay.getByText(cue.label, { exact: true })).toBeVisible();
    expect((await cueSamples(player)).length).toBe(1);
    await api(`/timers/${cue.id}/adjust`, "POST", { action: "set", amountMs: 0 });
    await expect(page.getByTestId(`timer-value-${cue.id}`)).toHaveText("0:00");
    await expect(overlay.getByTestId(`timer-value-${cue.id}`)).toHaveText("0:00");
    await expect.poll(async () => (await cueSamples(player)).length).toBe(2);
    await expect.poll(() => player.evaluate(() => (globalThis as CueGlobal).timerCueFailures)).toBe(2);
    await expect(browserAudio).toHaveCount(2);
    expect((await startCue).error).toBeNull();
    await expect(page.getByText(cue.label, { exact: true })).toHaveCount(0, { timeout: 6_500 });
    await api(`/timers/${cue.id}/stop`, "POST");
    await expect(browserAudio).toHaveCount(0, { timeout: 15_000 });
    const browserOnly = await cueTimer("Browser cue only", true, []);
    await api(`/timers/${browserOnly.id}/start`, "POST");
    await expect(browserAudio).toHaveCount(1);
    await expect.poll(() => browserAudio.evaluate((audio: HTMLAudioElement) => audio.currentTime > 0)).toBe(true);
    expect((await cueSamples(player)).length).toBe(2);
    await api(`/timers/${browserOnly.id}/stop`, "POST");
    await expect(browserAudio).toHaveCount(0);
    expect(await desktop.evaluate(() => (globalThis as typeof globalThis & { timerNativeErrors?: unknown[] }).timerNativeErrors ?? [])).toEqual([]);
    const deviceOnly = await cueTimer("Device cue only", false, [routes[0]!.id]);
    await api("/playback/mute", "POST", {});
    expect((await api<{ muted: boolean }>("/playback")).muted).toBe(true);
    await api(`/timers/${deviceOnly.id}/start`, "POST");
    await expect.poll(async () => (await cueSamples(player)).length).toBe(3);
    await expect.poll(async () => (await cueSamples(player))[2]?.muted).toBe(false);
    await expect(browserAudio).toHaveCount(0);
    Object.assign(evidence, {
      packageSha256, countdownAgreement: true, managementHidden: true, overlayRendererRecreated: true,
      pausedGenerationPreserved: true, cueReplayOnResumeOrOverlayRecovery: 0,
      healthyDeviceCues: 3, failedSelectedRecipients: 2, explicitBrowserOnlyAndDeviceOnly: true,
      alertsEffectsMutePreservesCurrentAndFutureTimerCues: true, physicalAudibility: false
    });
  } catch (error) {
    failures.push(error);
  }

  if (desktop !== undefined && child !== undefined) {
    try {
      const quitStartedAt = Date.now();
      await desktop.evaluate(({ app }) => app.quit());
      const management = desktop.windows().find(page => page.url().startsWith(`http://127.0.0.1:${port}/manage`));
      await management?.getByRole("dialog", { name: "Leave with unsaved changes?" }).getByRole("button", { name: "Discard", exact: true }).click({ timeout: 1_500 }).catch(() => undefined);
      await expect.poll(() => child!.exitCode !== null || child!.signalCode !== null, { timeout: 20_000 }).toBe(true);
      expect(child.exitCode).toBe(0);
      expect(Date.now() - quitStartedAt).toBeLessThan(20_000);
      evidence.quitMs = Date.now() - quitStartedAt;
      evidence.exitCode = child.exitCode;
    } catch (error) {
      failures.push(error);
    }
  } else {
    failures.push(new Error("Packaged Timer process was not captured; bounded Quit is unconfirmed."));
  }
  console.info(`Packaged Timer evidence retained: ${root}; app.asar sha256 ${packageSha256}`);
  evidence.passed = failures.length === 0;
  await writeFile(join(root, "acceptance.json"), JSON.stringify(evidence, null, 2));
  if (failures.length > 0) throw new AggregateError(failures, `Packaged Timer acceptance failed; evidence retained at ${root}`);
});

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected isolated TCP port");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

type CueGlobal = typeof globalThis & {
  timerCueFailures?: number;
  timerCueSamples?: { element: HTMLMediaElement; selectedHealthy: boolean; privateSource: boolean }[];
};

async function cueSamples(player: Page) {
  return player.evaluate(() => (globalThis as CueGlobal).timerCueSamples?.map(({ element, selectedHealthy, privateSource }) => ({
    selectedHealthy, privateSource, muted: element.muted, progressing: element.currentTime > 0
  })) ?? []);
}

function silentWav(seconds: number): Buffer {
  const rate = 8000; const bytes = rate * seconds * 2; const result = Buffer.alloc(44 + bytes);
  result.write("RIFF", 0); result.writeUInt32LE(36 + bytes, 4); result.write("WAVEfmt ", 8); result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22); result.writeUInt32LE(rate, 24); result.writeUInt32LE(rate * 2, 28);
  result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34); result.write("data", 36); result.writeUInt32LE(bytes, 40);
  return result;
}
