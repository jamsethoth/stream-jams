import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { _electron, expect, test, type Page } from "@playwright/test";
import { recordNeutralClip } from "../fixtures/create-media-fixtures.js";
import { windowByUrl } from "./audio-harness.js";

// Capability evidence only. Never capture management credentials or emit
// physical audio in this test.
test.use({ trace: "off", screenshot: "off", video: "off" });

for (const format of [
  { name: "WebM", mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
  { name: "MP4", mimeType: "video/mp4;codecs=avc1.42001E,mp4a.40.2", extension: "mp4" }
] as const) {
test(`packaged decoder silently plays and seeks ${format.name} soundtracks and trackless media`, async ({ playwright }, testInfo) => {
  const recorder = await playwright.chromium.launch();
  const clips: { withAudio: boolean; bytes: Uint8Array }[] = [];
  try {
    const page = await recorder.newPage();
    for (const withAudio of [true, false]) {
      const options = { width: 320, height: 180, durationMs: 10_000, withAudio, mimeType: format.mimeType };
      const bytes = await recordNeutralClip(page, options);
      if (format.name === "MP4") expect(new TextDecoder().decode(bytes.slice(4, 8))).toBe("ftyp");
      clips.push({ withAudio, bytes });
    }
  } finally { await recorder.close(); }

  const root = await mkdtemp(join(tmpdir(), "stream-jams-video-codec-"));
  const executablePath = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
  const packageSha256 = createHash("sha256").update(await readFile(join(dirname(executablePath), "resources/app.asar"))).digest("hex");
  const port = await unusedPort();
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({ server: { host: "127.0.0.1", port },
    storage: { dataDirectory: join(root, "data"), assetDirectory: join(root, "assets") },
    playback: { paused: false, muted: true, doNotDisturb: false } }));
  for (const clip of clips) await writeFile(join(root, `${clip.withAudio ? "markers" : "trackless"}.${format.extension}`), clip.bytes);
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, { STREAM_JAMS_CONFIG_PATH: configPath, STREAM_JAMS_DESKTOP_USER_DATA_PATH: join(root, "electron"), STREAM_JAMS_SHUTDOWN_LOG: join(root, "shutdown.jsonl") });
  const desktop = await _electron.launch({ executablePath, env, cwd: root, chromiumSandbox: true, timeout: 30_000 });
  const child = desktop.process();
  const pids = new Set<number>();
  if (child.pid !== undefined) pids.add(child.pid);
  const mainPid = await desktop.evaluate(() => process.pid); pids.add(mainPid);
  const results: unknown[] = [];
  const failures: unknown[] = [];
  try {
    const management = await windowByUrl(desktop, `http://127.0.0.1:${port}/manage`);
    await expect(management.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    const player = await windowByUrl(desktop, "stream-jams-audio://player/");
    await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith("http://127.0.0.1:"))!.hide());
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().startsWith("http://127.0.0.1:")).every(w => !w.isVisible()))).toBe(true);
    for (const clip of clips) {
      const result = await probeMedia(player, clip.bytes, format.mimeType);
      results.push({ withAudio: clip.withAudio, sha256: createHash("sha256").update(clip.bytes).digest("hex"), sizeBytes: clip.bytes.byteLength, ...result });
      expect(result.error).toBeNull();
      expect(result.samples.length).toBe(3);
      expect(result.samples.every(sample => sample.muted && sample.audioTime > 0 && sample.videoTime > 0)).toBe(true);
      expect(result.samples.every(sample => Math.abs(sample.audioTime - sample.videoTime) < 0.15)).toBe(true);
      expect(result.seekTime).toBeGreaterThanOrEqual(4.9);
      expect(result.seekTime).toBeLessThan(5.15);
      expect(result.ended).toBe(true);
      expect(result.videoWidth).toBe(320);
      expect(result.videoHeight).toBe(180);
    }
    const malformed = await player.evaluate(async () => {
      const url = URL.createObjectURL(new Blob([new Uint8Array([0, 1, 2, 3])], { type: "video/webm" }));
      const audio = new Audio(); audio.muted = true; audio.volume = 0;
      try {
        return await new Promise<boolean>(resolveResult => {
          const timer = setTimeout(() => resolveResult(false), 5000);
          audio.onerror = () => { clearTimeout(timer); resolveResult(true); };
          audio.src = url; audio.load();
        });
      } finally { audio.pause(); audio.removeAttribute("src"); audio.load(); URL.revokeObjectURL(url); }
    });
    expect(malformed).toBe(true);
    results.push({ malformedRejectedWithinMs: 5000 });
    results.push(await probeProductionSoundtrack(player, port, clips[0]!.bytes, format.extension));
    (await desktop.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid))).forEach(pid => pids.add(pid));
  } catch (error) { failures.push(error); }

  // Normal Quit only, independently verified against the captured native PIDs.
  try {
    await desktop.evaluate(({ app }) => app.quit()).catch(() => undefined);
    await expect.poll(() => child.exitCode, { timeout: 20_000 }).toBe(0);
    await expect.poll(() => [...pids].every(pid => {
      try { process.kill(pid, 0); return false; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return true; throw error; }
    }), { timeout: 20_000 }).toBe(true);
  } catch (error) { failures.push(error); }
  const evidence = { root, format, packageSha256, mainPid, launcherPid: child.pid, capturedPids: [...pids], exitCode: child.exitCode, signal: child.signalCode,
    results, failures: failures.map(failure => failure instanceof Error ? failure.message : "Unknown failure"),
    limitation: "Silent decoder plus production device-only soundtrack delivery; not physical marker timing or OBS acceptance." };
  await writeFile(join(root, "evidence.json"), JSON.stringify(evidence, null, 2));
  await testInfo.attach("silent-decoder-evidence", { body: JSON.stringify(evidence), contentType: "application/json" });
  console.info(`Silent video codec evidence retained: ${root}`);
  if (failures.length) throw new AggregateError(failures, "Silent video codec probe failed; profile retained");
});
}

async function probeProductionSoundtrack(player: Page, port: number, bytes: Uint8Array, extension: "webm" | "mp4") {
  const base = `http://127.0.0.1:${port}`;
  const sessionResponse = await fetch(`${base}/auth/management/sessions`, { method: "POST" });
  expect(sessionResponse.ok).toBe(true);
  const session = await sessionResponse.json() as { id: string; csrfToken: string };
  const headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken, "content-type": "application/json" };
  async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
    expect(response.ok, `${method} ${path}: HTTP ${response.status}`).toBe(true);
    return response.json() as Promise<T>;
  }
  expect((await api<{ muted: boolean }>("/playback")).muted).toBe(true);
  const devices = await api<{ available: boolean; devices: { deviceId: string }[] }>("/audio/devices");
  expect(devices.available).toBe(true);
  const device = devices.devices[0];
  expect(device, "An explicit connected device is required for this silent transport probe").toBeDefined();
  const route = await api<{ id: string }>("/audio/routes", "POST", { name: "Silent soundtrack probe", deviceId: device!.deviceId });
  const imported = await fetch(`${base}/assets/import`, { method: "POST", headers: {
    ...headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": `neutral.${extension}`, "x-stream-jams-mime-type": `video/${extension}`
  }, body: Buffer.from(bytes), signal: AbortSignal.timeout(5000) });
  expect(imported.ok).toBe(true);
  const asset = await imported.json() as { id: string };
  const rule = (await api<{ id: string; eventType: string }[]>("/alerts/rules")).find(item => item.eventType === "follow")!;
  const document = await api<import("../../packages/core/dist/index.js").AlertEditorDocument>(`/management/alerts/${rule.id}/editor`);
  const draft = { ...document, durationMs: 5000, outputs: { browserSource: false, deviceRouteIds: [route.id] },
    layers: [0, 1].map(index => ({ id: `probe-video-${index}`, type: "video", name: `Silent video ${index}`, assetId: asset.id,
      visible: true, order: index, playEmbeddedAudio: true, audioVolume: 0, animation: document.layers[0]!.animation })) };
  const response = await api<{ status: string }>(`/management/alerts/${rule.id}/editor/test`, "POST", {
    document: draft, targetProfileId: null, includeAudio: true, includeTts: false, samplePayload: document.samplePayloads[0]!.payload
  });
  expect(response.status).toBe("queued");
  await expect(player.locator("audio")).toHaveCount(2);
  await expect.poll(() => player.locator("audio").evaluateAll(elements => elements.every(element => (element as HTMLAudioElement).currentTime > 0.1))).toBe(true);
  const samples = await player.locator("audio").evaluateAll(elements => elements.map(element => {
    const audio = element as HTMLAudioElement;
    return { currentTime: audio.currentTime, muted: audio.muted, volume: audio.volume, sinkId: audio.sinkId, error: audio.error?.code ?? null };
  }));
  expect(samples.every(sample => sample.muted && sample.volume === 0 && sample.sinkId === device!.deviceId && sample.error === null)).toBe(true);
  expect(Math.abs(samples[0]!.currentTime - samples[1]!.currentTime)).toBeLessThan(0.15);
  await expect(player.locator("audio")).toHaveCount(0, { timeout: 7000 });
  await expect.poll(async () => (await api<{ current: unknown }>("/playback")).current).toBeNull();
  return { productionDeviceSoundtrack: true, distinctLayersSharingAsset: 2, samples };
}

async function probeMedia(page: Page, bytes: Uint8Array, mimeType: string) {
  return page.evaluate(async ({ values, mimeType }) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(values)], { type: mimeType }));
    const audio = new Audio(), video = document.createElement("video");
    const elements = [audio, video];
    const samples: { audioTime: number; videoTime: number; muted: boolean }[] = [];
    let error: string | null = null;
    let seekTime = 0;
    let ended = false;
    let videoWidth = 0, videoHeight = 0;
    const ready = (element: HTMLMediaElement) => new Promise<void>((resolveReady, reject) => {
      const done = () => { clearTimeout(timer); element.removeEventListener("loadeddata", loaded); element.removeEventListener("error", failed); };
      const loaded = () => { done(); resolveReady(); };
      const failed = () => { done(); reject(new Error("Candidate decoder failed")); };
      const timer = setTimeout(failed, 5000);
      element.addEventListener("loadeddata", loaded); element.addEventListener("error", failed);
      element.muted = true; element.volume = 0; element.preload = "auto"; element.src = url; element.load();
    });
    try {
      await Promise.all(elements.map(ready));
      videoWidth = video.videoWidth; videoHeight = video.videoHeight;
      await Promise.all(elements.map(element => element.play()));
      for (const delay of [1000, 4000]) {
        await new Promise(resolveWait => setTimeout(resolveWait, delay));
        samples.push({ audioTime: audio.currentTime, videoTime: video.currentTime, muted: elements.every(element => element.muted && element.volume === 0) });
      }
      await Promise.all(elements.map(element => new Promise<void>((resolveEnded, reject) => {
        if (element.ended) { resolveEnded(); return; }
        const done = () => { clearTimeout(timer); element.removeEventListener("ended", done); resolveEnded(); };
        const timer = setTimeout(() => { element.removeEventListener("ended", done); reject(new Error("Candidate did not end within its bound")); }, 6000);
        element.addEventListener("ended", done);
      })));
      ended = elements.every(element => element.ended);
      samples.push({ audioTime: audio.currentTime, videoTime: video.currentTime, muted: elements.every(element => element.muted && element.volume === 0) });
      audio.pause();
      await new Promise<void>((resolveSeek, reject) => {
        const timeout = setTimeout(() => { audio.onseeked = null; reject(new Error("Candidate seek timed out")); }, 5000);
        audio.onseeked = () => { clearTimeout(timeout); audio.onseeked = null; resolveSeek(); };
        audio.currentTime = 5;
      });
      seekTime = audio.currentTime;
    } catch (failure) { error = failure instanceof Error ? failure.message : "Unknown decoder failure"; }
    finally { for (const element of elements) { element.pause(); element.removeAttribute("src"); element.load(); } URL.revokeObjectURL(url); }
    return { samples, error, seekTime, ended, videoWidth, videoHeight };
  }, { values: Array.from(bytes), mimeType });
}

async function unusedPort(): Promise<number> {
  const server = createServer(); await new Promise<void>(resolveReady => server.listen(0, "127.0.0.1", resolveReady));
  const address = server.address(); if (address === null || typeof address === "string") throw new Error("Expected isolated port");
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return address.port;
}
