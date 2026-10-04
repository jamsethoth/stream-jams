import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { _electron, expect, test, type Page } from "@playwright/test";
import type { AlertEditorDocument, DeviceAudioResult } from "../../packages/core/dist/index.js";
import { finishDesktop, windowByUrl, withCleanup } from "./audio-harness.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

type StreamRecord = { bytes: number; closed: boolean; cancelled: boolean; aborted: boolean };
type StallMain = typeof globalThis & { stallFault: { held: boolean; streams: StreamRecord[]; replies: DeviceAudioResult[]; errors: { title: string; message: string }[]; cleanup(): Promise<void> } };
type NativeRecord = { element: HTMLMediaElement; duration: number; startedAt: number; stoppedAt: number | null; stoppedTime: number | null; lastProgressAt: number; lastTime: number };
type StallPlayer = typeof globalThis & { stallNative: NativeRecord[]; stallSampler: ReturnType<typeof setInterval> };

// Both PCM containers are authored below; no media, physical sound, visible
// output, production hooks, or installed-app/profile changes are involved.
test("@hardware native audio stalls after advancing onset, detaches only its layer and recovers without replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-native-stall-"));
  const listener = createServer();
  await new Promise<void>(done => listener.listen(0, "127.0.0.1", done));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("No isolated loopback address");
  await new Promise<void>((done, reject) => listener.close(error => error ? reject(error) : done()));
  const base = `http://127.0.0.1:${address.port}`;
  const executablePath = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
  const packageSha256 = createHash("sha256").update(await readFile(resolve("apps/desktop/out/Stream Jams-win32-x64/resources/app.asar"))).digest("hex");
  const stalledBytes = silentPcm(120), healthyBytes = silentPcm(30);
  const configPath = join(root, "config.json");
  const evidenceDirectory = resolve("apps/desktop/out/streaming-automation-stall");
  await mkdir(evidenceDirectory, { recursive: true });
  const shutdownLogPath = join(evidenceDirectory, `${basename(root)}-shutdown.jsonl`);
  await writeFile(configPath, JSON.stringify({ server: { host: "127.0.0.1", port: address.port }, storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") }, playback: { paused: false, muted: true, moduleMutes: { alerts: true, "screen-effects": true }, doNotDisturb: false } }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, { STREAM_JAMS_CONFIG_PATH: configPath, STREAM_JAMS_DESKTOP_USER_DATA_PATH: join(root, "electron"), STREAM_JAMS_SHUTDOWN_LOG: shutdownLogPath });
  const desktop = await _electron.launch({ executablePath, env, cwd: root, chromiumSandbox: true, timeout: 30000 });
  const child = desktop.process(), pids = new Set<number>(child.pid === undefined ? [] : [child.pid]);
  const evidence: Record<string, unknown> = { packageSha256, decoder: "native PCM WAV audio", fixtureBytes: stalledBytes.length, physicalAudio: false, desktopVisuals: false };
  let player: Page | undefined;
  await withCleanup(async () => {
    // Before AudioWindow captures fetch, wrap real upstream Responses. Preserve
    // HTTP status/headers and fault only the unique large PCM body's deliveries.
    await desktop.evaluate(({ BrowserWindow, dialog, ipcMain }, size) => {
      BrowserWindow.prototype.show = function () { this.hide(); };
      BrowserWindow.prototype.showInactive = function () { this.hide(); };
      for (const window of BrowserWindow.getAllWindows()) window.hide();
      const originalFetch = globalThis.fetch;
      const disposers = new Set<() => Promise<void>>();
      const waiters = new Set<() => void>();
      const state = { held: false, streams: [] as StreamRecord[], replies: [] as DeviceAudioResult[], errors: [] as { title: string; message: string }[], cleanup: async () => {
        globalThis.fetch = originalFetch;
        state.held = false;
        for (const wake of waiters) wake();
        await Promise.all([...disposers].map(dispose => dispose()));
        ipcMain.removeListener("stream-jams:audio-reply", reply);
      } };
      (globalThis as StallMain).stallFault = state;
      dialog.showErrorBox = (title, message) => { state.errors.push({ title, message }); };
      const reply = (_event: unknown, envelope: { result?: DeviceAudioResult & { type?: string } }) => {
        if (envelope.result?.type === "played") state.replies.push(envelope.result);
      };
      ipcMain.on("stream-jams:audio-reply", reply);
      globalThis.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const url = String(args[0]);
        const total = response.headers.get("content-range")?.split("/")[1] ?? response.headers.get("content-length");
        if (!url.includes("/media/med_") || total !== String(size) || response.body === null) return response;
        const reader = response.body.getReader();
        const record: StreamRecord = { bytes: 0, closed: false, cancelled: false, aborted: false };
        state.streams.push(record);
        const signal = args[1]?.signal;
        let pending: Uint8Array | undefined;
        const dispose = async () => {
          if (record.closed) return;
          record.closed = true;
          for (const wake of waiters) wake();
          signal?.removeEventListener("abort", abort);
          disposers.delete(dispose);
          await reader.cancel().catch(() => undefined);
        };
        const abort = () => { record.aborted = true; void dispose(); };
        signal?.addEventListener("abort", abort, { once: true });
        disposers.add(dispose);
        const body = new ReadableStream<Uint8Array>({
          async pull(output) {
            // Bounded transport pacing prevents Chromium from downloading the
            // whole file before we observe genuine advancing native playback.
            await new Promise<void>(done => {
              const wake = () => { clearTimeout(timer); waiters.delete(wake); done(); };
              const timer = setTimeout(wake, 40); waiters.add(wake);
            });
            if (state.held && !record.closed) await new Promise<void>(done => {
              const wake = () => { waiters.delete(wake); done(); }; waiters.add(wake);
            });
            if (record.closed) { output.close(); return; }
            try {
              if (pending === undefined) {
                const next = await reader.read();
                if (next.done) { await dispose(); output.close(); return; }
                pending = next.value;
              }
              const chunk = pending.subarray(0, 16384);
              pending = pending.length > chunk.length ? pending.subarray(chunk.length) : undefined;
              record.bytes += chunk.length; output.enqueue(chunk);
            } catch (error) { await dispose(); output.error(error); }
          },
          async cancel() { record.cancelled = true; await dispose(); }
        });
        return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      };
    }, stalledBytes.length);
    await windowByUrl(desktop, `${base}/manage`);
    const session = await (await fetch(`${base}/auth/management/sessions`, { method: "POST" })).json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, "content-type": "application/json" };
    async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
      const response = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
      expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true);
      return response.status === 204 ? undefined as T : response.json() as Promise<T>;
    }
    const devices = await api<{ available: boolean; devices: { deviceId: string }[] }>("/audio/devices");
    expect(devices.available).toBe(true); expect(devices.devices.length).toBeGreaterThan(0);
    const route = await api<{ id: string }>("/audio/routes", "POST", { name: "Silent native stall", deviceId: devices.devices[0]!.deviceId });
    player = await windowByUrl(desktop, "stream-jams-audio://player/");
    const nativePlayer = player;
    await instrumentNative(nativePlayer);
    async function importPcm(bytes: Buffer, name: string) {
      const response = await fetch(`${base}/assets/import`, { method: "POST", headers: { ...headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": name, "x-stream-jams-mime-type": "audio/wav" }, body: Buffer.from(bytes) });
      expect(response.ok).toBe(true); return (await response.json() as { id: string }).id;
    }
    const stalledAsset = await importPcm(stalledBytes, "silent-stall.wav"), healthyAsset = await importPcm(healthyBytes, "silent-healthy.wav");
    const rule = (await api<{ id: string; eventType: string }[]>("/alerts/rules")).find(candidate => candidate.eventType === "follow")!;
    const document = await api<AlertEditorDocument>(`/management/alerts/${rule.id}/editor`);
    async function queue(durationMs: number, includeStalled: boolean) {
      const layers = [ ...(includeStalled ? [{ id: "stalled", assetId: stalledAsset }] : []), { id: "healthy", assetId: healthyAsset } ].map((layer, order) => ({ ...layer, type: "audio", name: layer.id, visible: true, order, volume: 0, animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 0, delayMs: 0, easing: "ease-out" } }));
      const draft = { ...document, durationMode: "custom", durationMs, outputs: { browserSource: false, deviceRouteIds: [route.id] }, layers };
      expect((await api<{ status: string }>(`/management/alerts/${rule.id}/editor/test`, "POST", { document: draft, targetProfileId: null, includeAudio: true, includeTts: false, samplePayload: document.samplePayloads[0]!.payload })).status).toBe("queued");
    }
    await queue(15000, true);
    await expect.poll(() => nativeSamples(nativePlayer).then(samples => samples.length === 2 && samples.every(sample => sample.time > 0.1)), { timeout: 15000 }).toBe(true);
    const onset = await nativeSamples(nativePlayer);
    await nativePlayer.waitForTimeout(200);
    const advanced = await nativeSamples(nativePlayer);
    expect(advanced.every((sample, index) => sample.time > onset[index]!.time)).toBe(true);
    expect(advanced.every(sample => sample.muted && sample.volume === 0 && sample.privateSource && sample.explicitSink && sample.error === null)).toBe(true);
    const heldAt = Date.now();
    const atHold = await desktop.evaluate(() => {
      const state = (globalThis as StallMain).stallFault;
      state.held = true;
      return state.streams.map(record => ({ ...record }));
    });
    expect(atHold.length, "Real upstream body must be intercepted before native onset").toBeGreaterThan(0);
    const heldStreamIndexes = atHold.flatMap((record, index) => record.closed ? [] : [index]);
    expect(heldStreamIndexes.length).toBeGreaterThan(0);
    expect(atHold.reduce((total, record) => total + record.bytes, 0)).toBeLessThan(stalledBytes.length);
    await expect.poll(() => nativeSamples(nativePlayer).then(samples => samples.some(sample => sample.duration === 120 && sample.stoppedAt !== null)), { timeout: 10000 }).toBe(true);
    const afterStall = await nativeSamples(nativePlayer);
    const stalled = afterStall.find(sample => sample.duration === 120)!;
    const healthy = afterStall.find(sample => sample.duration === 30)!;
    expect(stalled.connected).toBe(false); expect(stalled.sourceCleared).toBe(true);
    expect(stalled.stoppedAt! - stalled.lastProgressAt).toBeGreaterThanOrEqual(1500);
    expect(stalled.stoppedAt! - stalled.lastProgressAt).toBeLessThan(4500);
    expect(stalled.stoppedAt! - heldAt).toBeLessThan(10000);
    expect(healthy.connected).toBe(true); expect(healthy.stoppedAt).toBeNull();
    await nativePlayer.waitForTimeout(400);
    expect((await nativeSamples(nativePlayer)).find(sample => sample.duration === 30)!.time).toBeGreaterThan(healthy.time);
    await expect.poll(() => desktop.evaluate((_electron, indexes) => {
      const streams = (globalThis as StallMain).stallFault.streams;
      return streams.every(record => record.closed) && indexes.every(index => streams[index]!.cancelled || streams[index]!.aborted);
    }, heldStreamIndexes)).toBe(true);
    await expect(nativePlayer.locator("audio")).toHaveCount(0, { timeout: 18000 });
    await expect.poll(() => desktop.evaluate(() => (globalThis as StallMain).stallFault.replies.length)).toBe(1);
    const result = await desktop.evaluate(() => (globalThis as StallMain).stallFault.replies[0]!);
    expect(result.failures).toEqual([expect.objectContaining({ layerId: "stalled", stage: "stall" })]);
    expect(result.outputDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ layerId: "stalled", diagnostics: expect.objectContaining({ terminalOutcome: "failed", completionReason: "stalled" }) }),
      expect.objectContaining({ layerId: "healthy", diagnostics: expect.objectContaining({ terminalOutcome: "completed", completionReason: "configured-duration" }) })
    ]));
    await expect.poll(async () => (await api<{ current: unknown }>("/playback")).current).toBeNull();
    await desktop.evaluate(() => { (globalThis as StallMain).stallFault.held = false; });
    await queue(1000, false);
    await expect.poll(() => nativeSamples(nativePlayer).then(samples => samples.length)).toBe(3);
    await expect(nativePlayer.locator("audio")).toHaveCount(0, { timeout: 5000 });
    await expect.poll(() => desktop.evaluate(() => (globalThis as StallMain).stallFault.replies.length)).toBe(2);
    const recovered = await desktop.evaluate(() => (globalThis as StallMain).stallFault.replies[1]!);
    expect(recovered.failures ?? []).toEqual([]);
    expect(recovered.diagnostics).toMatchObject({ terminalOutcome: "completed", completionReason: "configured-duration" });
    const finalSamples = await nativeSamples(nativePlayer);
    expect(finalSamples).toHaveLength(3); expect(finalSamples[2]!.duration).toBe(30);
    expect(finalSamples[2]!.stoppedTime).toBeGreaterThan(0.5);
    await expect.poll(async () => (await api<{ current: unknown }>("/playback")).current).toBeNull();
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible()))).toBe(true);
    expect(await desktop.evaluate(() => (globalThis as StallMain).stallFault.errors)).toEqual([]);
    evidence.onset = advanced; evidence.atHold = atHold; evidence.afterStall = afterStall;
    evidence.result = result; evidence.recovered = recovered; evidence.finalSamples = finalSamples;
    evidence.streams = await desktop.evaluate(() => (globalThis as StallMain).stallFault.streams);
    await test.info().attach("native-decoder-body-stall", { body: JSON.stringify(evidence), contentType: "application/json" });
  }, async () => {
    // Release/cancel every test-owned body before Quit, including failure paths.
    await withCleanup(async () => {
      if (player !== undefined && !player.isClosed()) await player.evaluate(() => clearInterval((globalThis as StallPlayer).stallSampler));
      await desktop.evaluate(async () => { await (globalThis as StallMain).stallFault?.cleanup(); });
    }, async () => {
      for (const pid of await desktop.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid))) pids.add(pid);
      const quitStartedAt = Date.now();
      try {
        await finishDesktop(desktop, root, [...pids], child);
        evidence.cleanup = { ownedPids: [...pids], capturedPidsExited: true, exitCode: child.exitCode, quitMs: Date.now() - quitStartedAt, profileRemoved: true };
        const shutdown = (await readFile(shutdownLogPath, "utf8")).trim().split("\n").map(line => JSON.parse(line) as { phase: string });
        evidence.shutdown = shutdown;
        expect(shutdown.some(entry => entry.phase === "service-stop-failed"), "Owned service must stop normally, even when native process exits zero").toBe(false);
        expect(shutdown.some(entry => entry.phase === "service-stop-completed")).toBe(true);
      } finally {
        await writeFile(join(evidenceDirectory, "native-stall.json"), JSON.stringify(evidence, null, 2));
      }
    });
  });
});

function silentPcm(seconds: number): Buffer {
  const sampleRate = 48000, blockAlign = 4, dataLength = seconds * sampleRate * blockAlign;
  const bytes = Buffer.alloc(44 + dataLength);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(36 + dataLength, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * blockAlign, 28);
  bytes.writeUInt16LE(blockAlign, 32); bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36); bytes.writeUInt32LE(dataLength, 40); return bytes;
}

async function instrumentNative(player: Page): Promise<void> {
  await player.evaluate(() => {
    const state = globalThis as StallPlayer;
    state.stallNative = [];
    const play = HTMLMediaElement.prototype.play, pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play = async function () {
      this.muted = true; this.volume = 0;
      await play.call(this);
      state.stallNative.push({ element: this, duration: this.duration, startedAt: Date.now(), stoppedAt: null, stoppedTime: null, lastProgressAt: Date.now(), lastTime: this.currentTime });
    };
    HTMLMediaElement.prototype.pause = function () {
      const record = state.stallNative.find(record => record.element === this && record.stoppedAt === null);
      if (record) { record.stoppedAt = Date.now(); record.stoppedTime = this.currentTime; }
      pause.call(this);
    };
    state.stallSampler = setInterval(() => {
      for (const record of state.stallNative) if (record.stoppedAt === null && record.element.currentTime > record.lastTime + 0.001) {
        record.lastTime = record.element.currentTime; record.lastProgressAt = Date.now();
      }
    }, 50);
  });
}

async function nativeSamples(player: Page) {
  return player.evaluate(() => (globalThis as StallPlayer).stallNative.map(({ element, ...sample }) => ({ ...sample, time: element.currentTime, connected: element.isConnected, sourceCleared: !element.hasAttribute("src"), muted: element.muted, volume: element.volume, privateSource: element.src.startsWith("stream-jams-audio://player/media/private_"), explicitSink: element.sinkId !== "", error: element.error?.code ?? null })));
}
