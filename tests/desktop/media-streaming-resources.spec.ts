import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { _electron, expect, test } from "@playwright/test";
import { serializeMediaStreamingEvidence } from "../../scripts/media-streaming-evidence.mjs";
import { windowByUrl } from "./audio-harness.js";
import { finishUtilityResources, installUtilityResourceObserver, startUtilityResources, type UtilityResources } from "./utility-resource-observer.js";

// Capabilities and memory observations only: disposable profile, zero gain,
// authoritative mute, hidden windows, no screenshots containing media handles.
test.use({ trace: "off", screenshot: "off", video: "off" });

interface Observation {
  ipc: { channel: string; sizeBytes: number; bodyField: boolean; trustedHandle: boolean }[];
  samples: unknown[];
  sampler: ReturnType<typeof setInterval>;
}
type ObservedGlobal = typeof globalThis & { resourceObservation: Observation };

test("@hardware Forge streaming uses bounded reference IPC across 1/25/100 MiB repeats and detaches native media on skip", async () => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-packaged-resources-"));
  const outputRoot = resolve("apps/desktop/out/streaming-automation-resources");
  await mkdir(outputRoot, { recursive: true });
  const executablePath = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
  const packageSha256 = createHash("sha256").update(await readFile(join(dirname(executablePath), "resources/app.asar"))).digest("hex");
  const listener = createServer();
  await new Promise<void>(accept => listener.listen(0, "127.0.0.1", accept));
  const address = listener.address();
  if (address === null || typeof address === "string") throw new Error("No disposable listener address");
  const port = address.port;
  await new Promise<void>((accept, reject) => listener.close(error => error ? reject(error) : accept()));
  const base = `http://127.0.0.1:${port}`;
  await writeFile(join(root, "config.json"), JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") }, playback: { paused: false, muted: true, moduleMutes: { alerts: true, "screen-effects": true }, doNotDisturb: false } }));
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, { STREAM_JAMS_CONFIG_PATH: join(root, "config.json"), STREAM_JAMS_DESKTOP_USER_DATA_PATH: join(root, "electron"), STREAM_JAMS_SHUTDOWN_LOG: join(root, "shutdown.jsonl") });
  const desktop = await _electron.launch({ executablePath, env, cwd: root, chromiumSandbox: true, timeout: 30_000 });
  const child = desktop.process(), pids = new Set<number>(), results: unknown[] = [], failures: unknown[] = [];
  const ranges: { status: number; contentRange: string | null }[] = [];
  const utilityResources: UtilityResources[] = [];
  const failureCodes: ("PLAYBACK_FAILED" | "OBSERVATION_FAILED" | "QUIT_FAILED")[] = [];
  let observation: { ipc: Observation["ipc"]; samples: unknown[] } | undefined;
  let quitMs: number | undefined;
  let capturedPidsExited = false;
  try {
    await windowByUrl(desktop, `${base}/manage`);
    await desktop.evaluate(({ BrowserWindow, app }) => {
      for (const window of BrowserWindow.getAllWindows()) window.hide();
      BrowserWindow.prototype.show = function() {};
      BrowserWindow.prototype.showInactive = function() {};
      const observed = globalThis as ObservedGlobal;
      const ipc: Observation["ipc"] = [], samples: unknown[] = [];
      const prototype = Object.getPrototypeOf(BrowserWindow.getAllWindows()[0]!.webContents) as { send: (channel: string, ...args: unknown[]) => void };
      const send = prototype.send;
      prototype.send = function(channel, ...args) {
        if (channel.includes("audio") || channel.includes("overlay")) {
          const json = JSON.stringify(args);
          ipc.push({ channel, sizeBytes: Buffer.byteLength(json), bodyField: /"(?:bytes|base64|body)"\s*:/.test(json), trustedHandle: json.includes("med_") });
        }
        return send.call(this, channel, ...args);
      };
      const sample = () => samples.push({ at: Date.now(), main: process.memoryUsage(), processes: app.getAppMetrics().map(metric => ({ pid: metric.pid, type: metric.type, memory: metric.memory })) });
      sample();
      observed.resourceObservation = { ipc, samples, sampler: setInterval(sample, 100) };
    });
    pids.add(await installUtilityResourceObserver(desktop, root));
    await expect.poll(async () => {
      try { return (await fetch(`${base}/auth/management/sessions`, { method: "POST", signal: AbortSignal.timeout(1000) })).ok; }
      catch { return false; }
    }, { timeout: 20000 }).toBe(true);
    await windowByUrl(desktop, `${base}/manage`);
    const sessionResponse = await fetch(`${base}/auth/management/sessions`, { method: "POST" });
    expect(sessionResponse.ok).toBe(true);
    const session = await sessionResponse.json() as { id: string; csrfToken: string };
    const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, "content-type": "application/json" };
    async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
      const response = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
      return (response.status === 204 ? null : await response.json()) as T;
    }
    const devices = await api<{ available: boolean; devices: { deviceId: string }[] }>("/audio/devices");
    expect(devices.available).toBe(true); expect(devices.devices.length).toBeGreaterThan(0);
    const route = await api<{ id: string }>("/audio/routes", "POST", { name: "Muted streaming resource regression", deviceId: devices.devices[0]!.deviceId });
    const player = await windowByUrl(desktop, "stream-jams-audio://player/");
    player.on("response", response => { if (response.url().includes("/media/private_")) ranges.push({ status: response.status(), contentRange: response.headers()["content-range"] ?? null }); });
    const rule = (await api<{ id: string; eventType: string }[]>("/alerts/rules")).find(rule => rule.eventType === "follow");
    expect(rule).toBeDefined();
    const editor = await api<Record<string, unknown> & { samplePayloads: { payload: unknown }[] }>(`/management/alerts/${rule!.id}/editor`);
    const fixture = await readFile(resolve("tests/fixtures/media/neutral-with-audio.mp4"));
    for (const sizeMiB of [1, 25, 100]) {
      const sizeBytes = sizeMiB * 1024 * 1024, fileName = `neutral-${sizeMiB}.mp4`, path = join(root, fileName);
      const file = await open(path, "w");
      try {
        await file.write(fixture);
        const padding = Buffer.alloc(8); padding.writeUInt32BE(sizeBytes - fixture.length, 0); padding.write("free", 4, "ascii");
        await file.write(padding, 0, padding.length, fixture.length);
        await file.truncate(sizeBytes);
      } finally { await file.close(); }
      const importRequest: RequestInit & { duplex: "half" } = { method: "POST", headers: { ...headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": fileName, "x-stream-jams-mime-type": "video/mp4", "content-length": String(sizeBytes) }, body: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>, duplex: "half", signal: AbortSignal.timeout(40_000) };
      const imported = await fetch(`${base}/assets/import`, importRequest);
      expect(imported.ok).toBe(true);
      const asset = await imported.json() as { id: string };
      for (let pass = 0; pass < 2; pass++) {
        const resourceLabel = `${sizeMiB}MiB:${pass}`;
        await startUtilityResources(desktop, resourceLabel);
        const started = Date.now(), rangeStart = ranges.length;
        const document = { ...editor, durationMode: "custom", durationMs: 15000, outputs: { browserSource: false, deviceRouteIds: [route.id] }, layers: [{ id: "muted-video", type: "video", name: "Muted streaming resource probe", assetId: asset.id, visible: true, order: 0, playEmbeddedAudio: true, audioVolume: 0, animation: { mode: "preset", entrance: "fade", exit: "fade", durationMs: 300, delayMs: 0, easing: "ease-out" } }] };
        await api(`/management/alerts/${rule!.id}/editor/test`, "POST", { document, targetProfileId: null, includeAudio: true, includeTts: false, samplePayload: editor.samplePayloads[0]!.payload });
        await expect.poll(() => player.locator("audio").evaluateAll((elements: HTMLAudioElement[]) => elements.some(element => element.currentTime > 0.05)), { timeout: 15000 }).toBe(true);
        const onsetObservedMs = Date.now() - started;
        const native = await player.locator("audio").first().evaluate(async (audio: HTMLAudioElement) => {
          const safety = { muted: audio.muted, volume: audio.volume, privateUrl: audio.src.startsWith("stream-jams-audio://player/media/private_"), error: audio.error?.code ?? null };
          audio.pause(); const target = Math.min(5, audio.duration / 2);
          await new Promise<void>((accept, reject) => {
            const timeout = setTimeout(() => reject(new Error("Private media seek deadline exceeded")), 5000);
            audio.addEventListener("seeked", () => { clearTimeout(timeout); accept(); }, { once: true }); audio.currentTime = target;
          });
          return { ...safety, target, actual: audio.currentTime };
        });
        expect(native).toMatchObject({ muted: true, volume: 0, privateUrl: true, error: null });
        expect(native.target).toBeGreaterThan(0); expect(Math.abs(native.target - native.actual)).toBeLessThan(0.15);
        expect(ranges.slice(rangeStart).some(range => range.status === 206 && range.contentRange !== null)).toBe(true);
        await api("/playback/skip", "POST", {});
        await expect(player.locator("audio")).toHaveCount(0);
        await player.waitForTimeout(250);
        const utility = await finishUtilityResources(desktop, resourceLabel);
        utilityResources.push(utility);
        pids.add(utility.pid);
        expect(utility.cleanup).toEqual({ owners: 0, grants: 0, readers: 0, storeReaders: 0 });
        expect(utility.reads.some(read => read.expectedSizeBytes === sizeBytes && read.readBytes === sizeBytes && read.highWaterMark === 65536)).toBe(true);
        expect(utility.reads.every(read => read.maximumChunkBytes <= 65536)).toBe(true);
        expect(utility.peak.external - utility.before.external).toBeLessThan(80 * 1024 * 1024);
        expect(utility.afterGC.external - utility.before.external).toBeLessThan(8 * 1024 * 1024);
        expect(utility.afterGC.arrayBuffers - utility.before.arrayBuffers).toBeLessThan(8 * 1024 * 1024);
        results.push({ sizeMiB, sizeBytes, pass, onsetObservedMs, native, rendererHeap: await player.evaluate(() => {
          const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
          return memory ? { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize } : null;
        }) });
      }
    }
    const packaged = await desktop.evaluate(({ app }) => ({ packaged: app.isPackaged, appPath: app.getAppPath() }));
    expect(packaged.packaged).toBe(true); expect(packaged.appPath.endsWith("app.asar")).toBe(true);
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible()))).toBe(true);
  } catch (error) { failures.push(error); failureCodes.push("PLAYBACK_FAILED"); }
  finally {
    try {
      observation = await desktop.evaluate(({ app }) => {
        const observed = (globalThis as ObservedGlobal).resourceObservation;
        clearInterval(observed.sampler);
        return { ipc: observed.ipc, samples: [...observed.samples, { at: Date.now(), main: process.memoryUsage(), processes: app.getAppMetrics().map(metric => ({ pid: metric.pid, type: metric.type, memory: metric.memory })) }] };
      });
      expect(observation.ipc.length).toBeGreaterThan(0);
      expect(observation.ipc.every(entry => !entry.bodyField && !entry.trustedHandle && entry.sizeBytes < 16384)).toBe(true);
      expect(observation.samples.length).toBeGreaterThan(5);
      (await desktop.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid))).forEach(pid => pids.add(pid));
      if (child.pid !== undefined) pids.add(child.pid);
    } catch (error) { failures.push(error); failureCodes.push("OBSERVATION_FAILED"); }
    try {
      const started = Date.now(); await desktop.evaluate(({ app }) => app.quit()).catch(() => undefined);
      await expect.poll(() => child.exitCode, { timeout: 20000 }).toBe(0);
      await expect.poll(() => [...pids].every(pid => { try { process.kill(pid, 0); return false; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return true; throw error; } }), { timeout: 20000 }).toBe(true);
      capturedPidsExited = true;
      quitMs = Date.now() - started;
    } catch (error) { failures.push(error); failureCodes.push("QUIT_FAILED"); }
    const evidence = { profile: root, packageSha256, results, ranges, observation, utilityResources, utilityScope: "Instrumented packaged Electron utility process imports unchanged ASAR service worker/classes; test-only loader samples Node memory and existing counters, observes file stream push sizes, and enables GC. No production diagnostic API.", quitMs, exitCode: child.exitCode, capturedPidsExited, failures: failureCodes,
      limitations: ["Main/utility/renderer working sets are sampled every 100 ms; utility external peaks every 1 ms can miss transient allocations. Decoder and RSS totals have no constant-memory guarantee.", "Direct utility measurements use a test-only loader and GC; they do not describe the untouched shipping entrypoint's GC schedule. Existing production counter getters and streams are unchanged.", "First use is not OS-cache cold; no cache flushing occurred. Padding controls transport size while retaining one decoder workload.", "Muted explicit-sink playback and hidden windows do not establish physical sound, OBS coexistence or visible compositing."] };
    let serialized: string;
    try { serialized = serializeMediaStreamingEvidence("resources", evidence); }
    catch (error) {
      failures.push(error);
      serialized = serializeMediaStreamingEvidence("failure", { status: "invalid-evidence", failures: ["EVIDENCE_VALIDATION_FAILED", ...failureCodes] });
    }
    await writeFile(join(outputRoot, "packaged-resources.json"), serialized);
    await test.info().attach("packaged-streaming-resources", { body: serialized, contentType: "application/json" });
  }
  if (failures.length) throw new AggregateError(failures, "Packaged resource acceptance failed; evidence retained");
});
