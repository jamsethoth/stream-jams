import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron, expect, test, type Page } from "@playwright/test";
import type { AlertEditorDocument } from "../../packages/core/dist/index.js";
import { finishDesktop, windowByUrl, withCleanup } from "./audio-harness.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("@hardware hidden muted streaming survives slow preparation, recipient failure, skip, renderer loss and worker loss", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-native-recovery-"));
  const port = await unusedRecoveryPort();
  const base = `http://127.0.0.1:${port}`;
  const executablePath = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
  const packageSha256 = createHash("sha256").update(await readFile(resolve("apps/desktop/out/Stream Jams-win32-x64/resources/app.asar"))).digest("hex");
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") }, playback: { paused: false, muted: true, doNotDisturb: false } }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, { STREAM_JAMS_CONFIG_PATH: configPath, STREAM_JAMS_DESKTOP_USER_DATA_PATH: join(root, "electron"), STREAM_JAMS_SHUTDOWN_LOG: join(root, "shutdown.jsonl") });
  const desktop = await _electron.launch({ executablePath, env, cwd: root, chromiumSandbox: true, timeout: 30000 });
  const child = desktop.process();
  const pids = new Set<number>(child.pid === undefined ? [] : [child.pid]);
  const evidence: Record<string, unknown> = { packageSha256, physicalAudio: false, desktopVisuals: false };
  const evidenceDirectory = resolve("apps/desktop/out/streaming-automation-recovery");
  await mkdir(evidenceDirectory, { recursive: true });
  // Install before waiting for management startup: this also prevents a future
  // failure window from being shown after the intentional renderer crash.
  await desktop.evaluate(({ BrowserWindow, dialog }) => {
    BrowserWindow.prototype.show = function () { this.hide(); };
    BrowserWindow.prototype.showInactive = function () { this.hide(); };
    for (const window of BrowserWindow.getAllWindows()) window.hide();
    // Tests must never display an unexpected native modal, including a bounded
    // shutdown failure. Keep its evidence observable instead of blocking Quit.
    dialog.showErrorBox = (title, message) => {
      (globalThis as RecoveryMainGlobal).recoveryNativeErrors ??= [];
      (globalThis as RecoveryMainGlobal).recoveryNativeErrors!.push({ title, message });
    };
  });
  await withCleanup(async () => {
    try { await windowByUrl(desktop, `${base}/manage`); }
    catch (error) {
      const state = await desktop.evaluate(({ BrowserWindow, app }) => ({ ready: app.isReady(), windows: BrowserWindow.getAllWindows().map(window => ({ url: window.webContents.getURL().split("?")[0], visible: window.isVisible() })), metrics: app.getAppMetrics().map(metric => ({ pid: metric.pid, type: metric.type, name: metric.name })) })).catch((inspectionError: unknown) => ({ inspectionFailure: inspectionError instanceof Error ? inspectionError.message : "Unknown inspection failure", exitCode: child.exitCode, signalCode: child.signalCode }));
      evidence.startupFailure = state;
      await test.info().attach("recovery-startup-failure", { body: JSON.stringify(state), contentType: "application/json" });
      console.info("Recovery startup state", JSON.stringify(state));
      throw error;
    }
    const session = await (await fetch(`${base}/auth/management/sessions`, { method: "POST" })).json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, "content-type": "application/json" };
    async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
      const response = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
      expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
      return response.status === 204 ? undefined as T : response.json() as Promise<T>;
    }
    expect((await api<{ muted: boolean }>("/playback")).muted).toBe(true);
    let devices = await api<{ available: boolean; devices: { deviceId: string }[] }>("/audio/devices");
    if (!devices.available) { await api("/audio/retry", "POST", {}); devices = await api("/audio/devices"); }
    expect(devices.available).toBe(true);
    expect(devices.devices.length, "Requires two explicitly enumerated outputs; playback remains globally muted").toBeGreaterThanOrEqual(2);
    const selected = devices.devices.slice(0, 2);
    const routes = await Promise.all(selected.map((device, index) => api<{ id: string }>("/audio/routes", "POST", { name: `Silent recovery ${index}`, deviceId: device.deviceId })));
    const bytes = await readFile(resolve("tests/fixtures/media/neutral-with-audio.webm"));
    const imported = await fetch(`${base}/assets/import`, { method: "POST", headers: { ...headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": "recovery.webm", "x-stream-jams-mime-type": "video/webm" }, body: bytes });
    expect(imported.ok).toBe(true);
    const asset = await imported.json() as { id: string };
    const rule = (await api<{ id: string; eventType: string }[]>("/alerts/rules")).find(candidate => candidate.eventType === "follow")!;
    const document = await api<AlertEditorDocument>(`/management/alerts/${rule.id}/editor`);
    async function queue(durationMs = 1000, routeIds = routes.map(route => route.id)) {
      const draft = { ...document, durationMode: "custom", durationMs, outputs: { browserSource: false, deviceRouteIds: routeIds }, layers: [{ id: "recovery-video", type: "video", name: "Silent recovery", assetId: asset.id, visible: true, order: 0, playEmbeddedAudio: true, audioVolume: 0, animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 100, delayMs: 0, easing: "ease-out" } }] };
      expect((await api<{ status: string }>(`/management/alerts/${rule.id}/editor/test`, "POST", { document: draft, targetProfileId: null, includeAudio: true, includeTts: false, samplePayload: document.samplePayloads[0]!.payload })).status).toBe("queued");
    }
    let player = await windowByUrl(desktop, "stream-jams-audio://player/");
    await instrumentRecoveryPlayer(player, selected[1]!.deviceId, selected[0]!.deviceId);
    const queuedAt = Date.now();
    await queue();
    await expect.poll(() => recoverySamples(player)).toHaveLength(1);
    await expect(player.locator("audio")).toHaveCount(0, { timeout: 7000 });
    const samples = await recoverySamples(player);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.muted).toBe(true);
    expect(samples[0]!.privateSource).toBe(true);
    expect(samples[0]!.startedAt - queuedAt).toBeGreaterThanOrEqual(650);
    expect(samples[0]!.stoppedAt! - samples[0]!.startedAt).toBeGreaterThanOrEqual(850);
    expect(samples[0]!.stoppedAt! - samples[0]!.startedAt).toBeLessThan(2200);
    expect(samples[0]!.selectedHealthy).toBe(true);
    expect(await player.evaluate(() => (globalThis as RecoveryGlobal).recoveryRecipientFailures)).toBe(1);
    await expect.poll(async () => (await api<{ current: unknown }>("/playback")).current).toBeNull();
    evidence.slowPreparationAndRecipientIsolation = { failedRecipients: 1, healthyRecipients: samples.map(({ startedAt, stoppedAt, muted, privateSource, selectedHealthy }) => ({ preparationMs: startedAt - queuedAt, playbackMs: stoppedAt! - startedAt, muted, privateSource, selectedHealthy })) };

    // Skip while real sink negotiation is pending, repeatedly. Each discarded
    // source must remain silent even after the injected 700ms delay settles.
    const beforeSkip = (await recoverySamples(player)).length;
    for (let index = 0; index < 3; index++) {
      await queue(3000, [routes[0]!.id]);
      await expect.poll(async () => (await api<{ current: unknown }>("/playback")).current !== null).toBe(true);
      await api("/playback/skip", "POST", {});
      await expect(player.locator("audio")).toHaveCount(0);
    }
    await player.waitForTimeout(1000);
    expect((await recoverySamples(player)).length).toBe(beforeSkip);
    evidence.rapidSkippedOccurrences = 3;

    await queue(4000, [routes[0]!.id]);
    await expect.poll(() => recoverySamples(player)).toHaveLength(beforeSkip + 1);
    const oldRendererPid = await desktop.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL() === "stream-jams-audio://player/")!;
      const pid = window.webContents.getOSProcessId();
      window.webContents.forcefullyCrashRenderer();
      return pid;
    });
    pids.add(oldRendererPid);
    await expect.poll(async () => (await api<{ current: unknown }>("/playback")).current).toBeNull();
    await api("/audio/retry", "POST", {});
    const recoveredDevices = await api<{ available: boolean }>("/audio/devices");
    expect(recoveredDevices.available).toBe(true);
    player = await windowByUrl(desktop, "stream-jams-audio://player/");
    const recoveredRendererPid = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL() === "stream-jams-audio://player/")!.webContents.getOSProcessId());
    expect(recoveredRendererPid).not.toBe(oldRendererPid);
    await player.waitForTimeout(1000);
    expect(await player.locator("audio").count()).toBe(0);
    await instrumentRecoveryPlayer(player, selected[1]!.deviceId, selected[0]!.deviceId);
    await queue(1000, [routes[0]!.id]);
    await expect.poll(() => recoverySamples(player)).toHaveLength(1);
    await expect(player.locator("audio")).toHaveCount(0, { timeout: 7000 });
    const recovered = await recoverySamples(player);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.muted && recovered[0]!.selectedHealthy && recovered[0]!.privateSource).toBe(true);
    evidence.rendererRecovery = { oldRendererPid, recoveredRendererPid, replayedOccurrences: 0, freshCompletedOccurrences: recovered.length };

    // Exercise the actual worker's loss and the existing operator Retry path.
    // Only the isolated app's named utility-service PID may be terminated.
    const oldManagementId = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().includes("/manage"))!.webContents.id);
    const retryObserved = await desktop.evaluate(({ dialog }) => {
      let retries = 0;
      const original = dialog.showMessageBox.bind(dialog);
      dialog.showMessageBox = (async (options: Parameters<typeof dialog.showMessageBox>[0]) => {
        if (options.title === "Stream Jams service unavailable") {
          retries++;
          return { response: 0, checkboxChecked: false };
        }
        return original(options);
      }) as typeof dialog.showMessageBox;
      (globalThis as typeof globalThis & { recoveryServiceRetryCount?: () => number }).recoveryServiceRetryCount = () => retries;
      return retries;
    });
    expect(retryObserved).toBe(0);
    await queue(4000, [routes[0]!.id]);
    await expect.poll(() => recoverySamples(player)).toHaveLength(2);
    const oldWorkerPid = await desktop.evaluate(({ app }) => {
      const metrics = app.getAppMetrics();
      const service = metrics.filter(metric => metric.name === "Stream Jams local service" || metric.serviceName === "Stream Jams local service");
      if (service.length !== 1 || service[0]!.pid <= 0 || service[0]!.pid === process.pid) throw new Error(`Cannot identify exactly one owned local-service process: ${JSON.stringify(metrics.map(metric => ({ pid: metric.pid, type: metric.type, name: metric.name, serviceName: metric.serviceName })))}`);
      const pid = service[0]!.pid;
      process.kill(pid);
      return pid;
    });
    pids.add(oldWorkerPid);
    await expect.poll(() => player.isClosed(), { timeout: 10000 }).toBe(true);
    await expect.poll(() => desktop.evaluate(({ app }, oldWorkerPid) => app.getAppMetrics().filter(metric => metric.name === "Stream Jams local service" || metric.serviceName === "Stream Jams local service").map(metric => metric.pid).find(pid => pid !== oldWorkerPid) ?? null, oldWorkerPid), { timeout: 15000 }).not.toBeNull();
    await expect.poll(async () => {
      try {
        const response = await fetch(`${base}/auth/management/sessions`, { method: "POST", signal: AbortSignal.timeout(1000) });
        return response.ok;
      } catch { return false; }
    }, { timeout: 15000 }).toBe(true);
    const renewedSession = await (await fetch(`${base}/auth/management/sessions`, { method: "POST" })).json() as { id: string; csrfToken: string };
    headers.authorization = `Bearer ${renewedSession.id}`;
    headers["x-stream-jams-csrf"] = renewedSession.csrfToken;
    await expect.poll(() => desktop.evaluate(({ BrowserWindow }, oldManagementId) => BrowserWindow.getAllWindows().some(candidate => candidate.webContents.getURL().includes("/manage") && candidate.webContents.id !== oldManagementId), oldManagementId), { timeout: 15000 }).toBe(true);
    expect((await api<{ muted: boolean; current: unknown }>("/playback")).muted).toBe(true);
    expect((await api<{ current: unknown }>("/playback")).current).toBeNull();
    expect((await api<{ available: boolean }>("/audio/devices")).available).toBe(true);
    player = await windowByUrl(desktop, "stream-jams-audio://player/");
    await player.waitForTimeout(1000);
    expect(await player.locator("audio").count()).toBe(0);
    await instrumentRecoveryPlayer(player, selected[1]!.deviceId, selected[0]!.deviceId);
    await queue(1000, [routes[0]!.id]);
    await expect.poll(() => recoverySamples(player)).toHaveLength(1);
    await expect(player.locator("audio")).toHaveCount(0, { timeout: 7000 });
    const afterWorkerRecovery = await recoverySamples(player);
    expect(afterWorkerRecovery[0]!.muted && afterWorkerRecovery[0]!.selectedHealthy && afterWorkerRecovery[0]!.privateSource).toBe(true);
    const workerState = await desktop.evaluate(({ app }) => ({ workerPid: app.getAppMetrics().find(metric => metric.name === "Stream Jams local service" || metric.serviceName === "Stream Jams local service")!.pid, retries: (globalThis as typeof globalThis & { recoveryServiceRetryCount: () => number }).recoveryServiceRetryCount() }));
    expect(workerState.workerPid).not.toBe(oldWorkerPid);
    expect(workerState.retries).toBe(1);
    evidence.workerRecovery = { oldWorkerPid, newWorkerPid: workerState.workerPid, oldPlayerDestroyed: true, managementRecreated: true, operatorRetries: workerState.retries, replayedOccurrences: 0, freshCompletedOccurrences: afterWorkerRecovery.length };

    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible()))).toBe(true);
    expect(await desktop.evaluate(() => (globalThis as RecoveryMainGlobal).recoveryNativeErrors ?? [])).toEqual([]);
    (await desktop.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid))).forEach(pid => pids.add(pid));
    await test.info().attach("streaming-recovery", { body: JSON.stringify(evidence), contentType: "application/json" });
  }, async () => {
    await writeFile(join(evidenceDirectory, "native-recovery.json"), JSON.stringify(evidence, null, 2));
    await finishDesktop(desktop, root, [...pids], child);
  });
});

type RecoverySample = { startedAt: number; stoppedAt: number | null; muted: boolean; privateSource: boolean; selectedHealthy: boolean };
type RecoveryGlobal = typeof globalThis & { recoverySamples?: RecoverySample[]; recoveryRecipientFailures?: number };
type RecoveryMainGlobal = typeof globalThis & {
  recoveryNativeErrors?: { title: string; message: string }[];
};

async function recoverySamples(player: Page): Promise<RecoverySample[]> {
  return player.evaluate(() => (globalThis as RecoveryGlobal).recoverySamples ?? []);
}

async function instrumentRecoveryPlayer(player: Page, failedDeviceId: string, selectedHealthyDeviceId: string) {
  await player.evaluate(({ failedDeviceId, selectedHealthyDeviceId }) => {
    const samples: RecoverySample[] = [];
    (globalThis as RecoveryGlobal).recoverySamples = samples;
    (globalThis as RecoveryGlobal).recoveryRecipientFailures = 0;
    const originalSink = HTMLMediaElement.prototype.setSinkId;
    HTMLMediaElement.prototype.setSinkId = async function (deviceId) {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 700));
      if (deviceId === failedDeviceId) {
        (globalThis as RecoveryGlobal).recoveryRecipientFailures!++;
        throw new DOMException("Injected selected recipient loss", "NotFoundError");
      }
      return originalSink.call(this, deviceId);
    };
    const originalPlay = HTMLMediaElement.prototype.play;
    const originalPause = HTMLMediaElement.prototype.pause;
    const records = new WeakMap<HTMLMediaElement, RecoverySample>();
    HTMLMediaElement.prototype.play = async function () {
      // Defense in depth: the fixture already requests global mute and volume
      // zero, and all native playback is silenced before calling Electron.
      this.muted = true; this.volume = 0;
      await originalPlay.call(this);
      const sample = { startedAt: Date.now(), stoppedAt: null, muted: this.muted, privateSource: this.src.startsWith("stream-jams-audio://player/media/private_"), selectedHealthy: this.sinkId === selectedHealthyDeviceId };
      records.set(this, sample); samples.push(sample);
    };
    HTMLMediaElement.prototype.pause = function () {
      const sample = records.get(this);
      if (sample !== undefined && sample.stoppedAt === null) sample.stoppedAt = Date.now();
      originalPause.call(this);
    };
  }, { failedDeviceId, selectedHealthyDeviceId });
}

async function unusedRecoveryPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolveReady => server.listen(0, "127.0.0.1", resolveReady));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected isolated loopback port");
  await new Promise<void>((resolveClose, reject) => server.close(error => error === undefined ? resolveClose() : reject(error)));
  return address.port;
}
