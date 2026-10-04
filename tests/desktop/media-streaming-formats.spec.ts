import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { _electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { alertEditorDocumentSchema, surfaceSettingsViewSchema, type AlertEditorDocument } from "../../packages/core/dist/index.js";
import { windowByUrl } from "./audio-harness.js";
import { uploadMediaFixture, type MediaFixture } from "../../scripts/media-streaming-fixtures.mjs";

// Only disposable profiles. No physical audio, visible overlay or diagnostic
// serialization of credentials/capability URLs. Retained JSON survives test cleanup.
test.use({ trace: "off", screenshot: "off", video: "off" });
test.describe.configure({ mode: "serial" });
const evidenceRoot = resolve("apps/desktop/out/streaming-automation-formats");
let desktop: ElectronApplication, management: Page, player: Page, base: string, profile: string;
let headers: Record<string, string>, editor: AlertEditorDocument, routeId: string;
const evidence: Record<string, unknown> = { results: [] };
const results = evidence.results as unknown[];

test.beforeAll(async () => {
  await mkdir(evidenceRoot, { recursive: true });
  profile = await mkdtemp(join(tmpdir(), "stream-jams-streaming-formats-"));
  const listener = createServer(); await new Promise<void>(done => listener.listen(0, "127.0.0.1", done));
  const address = listener.address(); if (address === null || typeof address === "string") throw new Error("No disposable port");
  const port = address.port; await new Promise<void>(done => listener.close(() => done())); base = `http://127.0.0.1:${port}`;
  const configPath = join(profile, "config.json");
  await writeFile(configPath, JSON.stringify({ server: { host: "127.0.0.1", port }, storage: { dataDirectory: join(profile, "data"), assetDirectory: join(profile, "assets") }, playback: { paused: false, muted: true, moduleMutes: { alerts: true, "screen-effects": true }, doNotDisturb: false } }));
  const executablePath = resolve("apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe");
  evidence.packageSha256 = createHash("sha256").update(await readFile(join(dirname(executablePath), "resources/app.asar"))).digest("hex");
  evidence.profile = profile;
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, { STREAM_JAMS_CONFIG_PATH: configPath, STREAM_JAMS_DESKTOP_USER_DATA_PATH: join(profile, "electron"), STREAM_JAMS_SHUTDOWN_LOG: join(profile, "shutdown.jsonl") });
  desktop = await _electron.launch({ executablePath, env, cwd: profile, chromiumSandbox: true, timeout: 30_000 });
  // Install before creating any overlay. Existing management is immediately hidden.
  await desktop.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.hide();
    BrowserWindow.prototype.show = function () {};
    BrowserWindow.prototype.showInactive = function () {};
  });
  management = await windowByUrl(desktop, `${base}/manage`);
  await expect(management.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
  const response = await fetch(`${base}/auth/management/sessions`, { method: "POST" }); expect(response.ok).toBe(true);
  const session = await response.json() as { id: string; csrfToken: string };
  headers = { authorization: `Bearer ${session.id}`, "x-stream-jams-csrf": session.csrfToken };
  const set = await api<{ id: string }>("/management/alert-sets", "POST", { name: "Format probe alerts" });
  const rule = await api<{ id: string }>(`/management/alert-sets/${set.id}/alerts`, "POST", { eventType: "follow", name: "Format probe follow" });
  editor = alertEditorDocumentSchema.parse(await api(`/management/alerts/${rule.id}/editor`));
  const runtime = await desktop.evaluate(({ app }) => ({ packaged: app.isPackaged, asar: app.getAppPath().endsWith("app.asar"), versions: process.versions }));
  expect(runtime.packaged && runtime.asar).toBe(true); evidence.runtime = runtime;
});

test.afterAll(async () => {
  const cleanupErrors: unknown[] = [];
  if (desktop !== undefined) {
    const child = desktop.process();
    const pids = new Set(child.pid === undefined ? [] : [child.pid]);
    try {
      (await desktop.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid))).forEach(pid => pids.add(pid));
      expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible()))).toBe(true);
    } catch (error) { cleanupErrors.push(error); }
    try {
      await desktop.evaluate(({ app }) => app.quit()).catch(() => undefined);
      await expect.poll(() => child.exitCode, { timeout: 20_000 }).toBe(0);
      await expect.poll(() => [...pids].every(pid => {
        try { process.kill(pid, 0); return false; }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return true; throw error; }
      }), { timeout: 20_000 }).toBe(true);
      evidence.quit = { exitCode: child.exitCode, capturedPidsExited: true };
    } catch (error) { cleanupErrors.push(error); }
  }
  evidence.cleanupFailures = cleanupErrors.map(error => error instanceof Error ? error.message : String(error));
  const evidenceName = test.info().config.configFile?.includes("hardware") ? "hardware-results.json" : "software-results.json";
  await writeFile(join(evidenceRoot, evidenceName), JSON.stringify(evidence, null, 2));
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, "Format probe cleanup failed; profile retained");
});

test("end-metadata progressive MP4 retains registered-preview seeking instead of requiring faststart", async () => {
  const bytes = await readFile(resolve("tests/fixtures/media/media-streaming-end-metadata.mp4"));
  expect(bytes.toString("ascii", 4, 8)).toBe("ftyp");
  const mdat = bytes.readUInt32BE(0); expect(bytes.toString("ascii", mdat + 4, mdat + 8)).toBe("mdat");
  const moov = mdat + bytes.readUInt32BE(mdat); expect(bytes.toString("ascii", moov + 4, moov + 8)).toBe("moov");
  expect(moov + bytes.readUInt32BE(moov)).toBe(bytes.length);
  await writeFile(join(evidenceRoot, "end-metadata.mp4"), bytes);
  const assetId = await importAsset(bytes, "end-metadata.mp4", "video/mp4", "media-streaming-end-metadata.mp4");
  const sample = await seekPreview(assetId);
  expect(sample.duration).toBeGreaterThan(9); expect(sample.duration).toBeLessThan(11);
  results.push({ case: "end-metadata-progressive-mp4", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), moovOffset: moov, ...sample });
});

test("valid Microsoft ADPCM WAVE produces a bounded codec error distinct from malformed bytes and CSP", async () => {
  const bytes = await readFile(resolve("tests/fixtures/media/media-streaming-unsupported-adpcm.wav"));
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF"); expect(bytes.readUInt16LE(20)).toBe(2);
  await writeFile(join(evidenceRoot, "unsupported-adpcm.wav"), bytes);
  const assetId = await importAsset(bytes, "unsupported-adpcm.wav", "audio/wav", "media-streaming-unsupported-adpcm.wav");
  const preview = await api<{ id: string; url: string }>(`/assets/${assetId}/preview`, "POST");
  try {
    // Valid registered bytes passed import and real authorized transport.
    const response = await fetch(`${base}${preview.url}`); expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);
    const decoded = await management.evaluate(async url => {
      const audio = new Audio(); audio.muted = true; audio.volume = 0;
      const violations: string[] = []; const violation = (event: SecurityPolicyViolationEvent) => violations.push(event.violatedDirective);
      document.addEventListener("securitypolicyviolation", violation);
      const started = performance.now();
      try {
        const code = await new Promise<number | null>((done, reject) => {
          const timer = setTimeout(() => reject(new Error("Unsupported codec did not settle within five seconds")), 5000);
          audio.onerror = () => { clearTimeout(timer); done(audio.error?.code ?? null); };
          audio.onloadeddata = () => { clearTimeout(timer); done(null); };
          audio.src = url; audio.load();
        });
        return { code, elapsedMs: performance.now() - started, violations };
      } finally { audio.pause(); audio.removeAttribute("src"); audio.load(); document.removeEventListener("securitypolicyviolation", violation); }
    }, `${base}${preview.url}`);
    expect(decoded.code).toBe(4); expect(decoded.violations).toEqual([]); expect(decoded.elapsedMs).toBeLessThan(5000);
    results.push({ case: "valid-unsupported-adpcm", ...decoded });
  } finally { await api(`/assets/previews/${preview.id}`, "DELETE"); }
});

test("audio-only Opus WebM decodes and seeks through a registered preview without a video track", async () => {
  const bytes = await readFile(resolve("tests/fixtures/media/media-streaming-audio-only.webm"));
  const assetId = await importAsset(bytes, "audio-only.webm", "audio/webm", "media-streaming-audio-only.webm");
  const sample = await seekPreview(assetId, 1); expect(sample.videoWidth).toBe(0); expect(sample.videoHeight).toBe(0);
  results.push({ case: "audio-only-webm-registered-preview", ...sample });
});

test("private selected-device end-metadata MP4 and audio-only WebM retain native seeking @hardware", async () => {
  const devices = await api<{ available: boolean; devices: { deviceId: string }[] }>("/audio/devices");
  expect(devices.available).toBe(true); expect(devices.devices.length).toBeGreaterThan(0);
  routeId = (await api<{ id: string }>("/audio/routes", "POST", { name: "Muted format regression", deviceId: devices.devices[0]!.deviceId })).id;
  player = await windowByUrl(desktop, "stream-jams-audio://player/");
  for (const fixture of [
    { name: "media-streaming-end-metadata.mp4", mimeType: "video/mp4", type: "video" as const, target: undefined },
    { name: "media-streaming-audio-only.webm", mimeType: "audio/webm", type: "audio" as const, target: 1 }
  ]) {
    const assetId = await importAsset(await readFile(resolve("tests/fixtures/media", fixture.name)), fixture.name, fixture.mimeType, fixture.name);
    await sendAudio(assetId, fixture.type); results.push({ case: `private-${fixture.type}-seek`, ...await seekPrivateAudio(fixture.target) }); await skip();
  }
});

test("private Timer GIF continues changing frames and transparent PNG pixels composite after streaming", async () => {
  await enableDesktop();
  const config = await api<{ config: unknown }>("/overlay-modules/timers/config"); await api("/overlay-modules/timers/config", "PUT", { enabled: true, config: config.config });
  const gifId = await importAsset(await readFile(resolve("tests/fixtures/media/media-streaming-animated.gif")), "animated.gif", "image/gif", "media-streaming-animated.gif");
  const timerId = await startTimer(gifId);
  const overlay = await windowByUrl(desktop, "stream-jams-overlay://surface/");
  try {
    await expect.poll(() => overlay.locator("img").evaluateAll(images => images.map(element => element as HTMLImageElement).some(image => image.complete && image.naturalWidth === 2))).toBe(true);
    // Canvas drawImage(HTMLImageElement) uses the default GIF frame. Sample
    // actual compositor snapshots instead, without presenting the native window.
    const colors: string[] = [];
    const rectangle = await overlay.locator("img").first().boundingBox();
    if (rectangle === null) throw new Error("Private GIF has no compositor bounds");
    for (let index = 0; index < 12; index++) {
      colors.push(await desktop.evaluate(async ({ BrowserWindow }, rectangle) => {
        const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL() === "stream-jams-overlay://surface/");
        if (window === undefined) throw new Error("Private compositor disappeared");
        const image = await window.webContents.capturePage({ x: Math.floor(rectangle.x), y: Math.floor(rectangle.y), width: Math.ceil(rectangle.width), height: Math.ceil(rectangle.height) }, { stayHidden: true, stayAwake: true });
        const size = image.getSize(), bitmap = image.toBitmap();
        const offset = (Math.floor(size.height / 2) * size.width + Math.floor(size.width / 2)) * 4;
        return [bitmap[offset + 2], bitmap[offset + 1], bitmap[offset], bitmap[offset + 3]].join(",");
      }, rectangle));
      await delay(50);
    }
    const samples = { colors, privateUrl: await overlay.locator("img").first().evaluate(element => (element as HTMLImageElement).src.startsWith("stream-jams-overlay://surface/media/private_")) };
    // Native screenshots include the Windows display color profile. Require
    // opaque, strongly red/blue frames rather than assuming identity sRGB.
    const frames = colors.map(color => {
      const [red, green, blue, alpha] = color.split(",").map(Number);
      if (alpha !== 255 || green === undefined || green >= 40) return "unexpected";
      if (red !== undefined && blue !== undefined && red >= 240 && blue < 40) return "red";
      if (red !== undefined && blue !== undefined && blue >= 240 && red < 40) return "blue";
      return "unexpected";
    });
    expect(samples.privateUrl).toBe(true); expect(new Set(frames)).toEqual(new Set(["red", "blue"]));
    expect(frames.filter((frame, index) => index > 0 && frame !== frames[index - 1]).length).toBeGreaterThanOrEqual(4);
    results.push({ case: "private-animated-gif", ...samples });
  } finally { await api(`/timers/${timerId}/stop`, "POST", {}); await expect(overlay.locator("img")).toHaveCount(0); }
  const png = await management.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8; const context = canvas.getContext("2d")!;
    context.fillStyle = "#ff0000"; context.fillRect(0, 0, 4, 8); return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const pngId = await importAsset(Buffer.from(png, "base64"), "transparent.png", "image/png", { kind: "generated-png", width: 8, height: 8 });
  const pngTimerId = await startTimer(pngId);
  try {
    await expect.poll(() => overlay.locator("img").evaluateAll(images => images.map(element => element as HTMLImageElement).some(image => image.complete && image.naturalWidth === 8))).toBe(true);
    const pixels = await overlay.locator("img").first().evaluate(element => {
      const image = element as HTMLImageElement;
      const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8; const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0); const alpha = Array.from(context.getImageData(6, 4, 1, 1).data);
      context.globalCompositeOperation = "destination-over"; context.fillStyle = "#00ff00"; context.fillRect(0, 0, 8, 8);
      return { alpha, opaque: Array.from(context.getImageData(2, 4, 1, 1).data), through: Array.from(context.getImageData(6, 4, 1, 1).data), privateUrl: image.src.startsWith("stream-jams-overlay://surface/media/private_") };
    });
    expect(pixels.privateUrl).toBe(true); expect(pixels.alpha).toEqual([0, 0, 0, 0]); expect(pixels.opaque).toEqual([255, 0, 0, 255]); expect(pixels.through).toEqual([0, 255, 0, 255]);
    results.push({ case: "private-transparent-png-canvas-compositing", ...pixels });
  } finally { await api(`/timers/${pngTimerId}/stop`, "POST", {}); await expect(overlay.locator("img")).toHaveCount(0); }
});

test("two transient private VP9-alpha videos preserve transparent pixels and detach on skip", async () => {
  await enableDesktop();
  const assetId = await importAsset(await readFile(resolve("tests/fixtures/media/media-streaming-transparent-vp9.webm")), "transparent.webm", "video/webm", "media-streaming-transparent-vp9.webm");
  const layers = [0, 1].map(index => ({ id: `format-video-${index}`, type: "video", name: `Silent visual ${index}`, assetId, visible: true, order: index, playEmbeddedAudio: false, audioVolume: 0, animation }));
  const document = alertEditorDocumentSchema.parse({ ...editor, durationMode: "custom", durationMs: 10_000, outputs: { browserSource: false, deviceRouteIds: [] }, layers,
    targetProfiles: editor.targetProfiles.map(profile => ({ ...profile, enabled: profile.id === "landscape", reviewState: "ready", layerLayouts: layers.map((layer, index) => ({ layerId: layer.id, x: index * 350, y: 0, width: 320, height: 240, zIndex: index })) })) });
  const response = await api<{ status: string }>(`/management/alerts/${editor.id}/editor/test`, "POST", { document, targetProfileId: "landscape", includeAudio: false, includeTts: false, samplePayload: editor.samplePayloads[0]!.payload });
  expect(response.status).toBe("queued");
  const overlay = await windowByUrl(desktop, "stream-jams-overlay://surface/");
  await expect.poll(() => overlay.locator("video").evaluateAll(elements => elements.length === 2 && elements.map(element => element as HTMLVideoElement).every(video => video.currentTime > 0.1)), { timeout: 15_000 }).toBe(true);
  const samples = await overlay.locator("video").evaluateAll(elements => elements.map(element => element as HTMLVideoElement).map(video => ({ time: video.currentTime, muted: video.muted, privateUrl: video.src.startsWith("stream-jams-overlay://surface/media/private_"), width: video.videoWidth, error: video.error?.code ?? null })));
  expect(samples.every(sample => sample.muted && sample.privateUrl && sample.width > 0 && sample.error === null)).toBe(true);
  expect(Math.abs(samples[0]!.time - samples[1]!.time)).toBeLessThan(0.15);
  const pixels = await overlay.locator("video").first().evaluate(element => {
    const video = element as HTMLVideoElement, canvas = globalThis.document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d")!; context.drawImage(video, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0, opaque = 0, transparentPixel = -1, minimumAlpha = 255, maximumAlpha = 0, partial = 0;
    for (let position = 3; position < data.length; position += 4) {
      if (data[position] === 0) { transparent++; transparentPixel = (position - 3) / 4; }
      if (data[position] === 255) opaque++;
      if (data[position]! > 0 && data[position]! < 255) partial++;
      if (data[position]! < minimumAlpha) { minimumAlpha = data[position]!; transparentPixel = (position - 3) / 4; }
      maximumAlpha = Math.max(maximumAlpha, data[position]!);
    }
    const original = transparentPixel < 0 ? [] : Array.from(context.getImageData(transparentPixel % canvas.width, Math.floor(transparentPixel / canvas.width), 1, 1).data);
    context.globalCompositeOperation = "destination-over"; context.fillStyle = "#00ff00"; context.fillRect(0, 0, canvas.width, canvas.height);
    const composited = transparentPixel < 0 ? [] : Array.from(context.getImageData(transparentPixel % canvas.width, Math.floor(transparentPixel / canvas.width), 1, 1).data);
    return { transparent, opaque, partial, minimumAlpha, maximumAlpha, original, composited };
  });
  results.push({ case: "two-transient-private-vp9-alpha-videos", samples, pixels });
  // Upstream clip contains partial alpha rather than binary cutout pixels.
  expect(pixels.minimumAlpha).toBeLessThan(255); expect(pixels.maximumAlpha).toBeGreaterThan(0);
  expect(pixels.original).toHaveLength(4); expect(pixels.composited[3]).toBe(255);
  const opacity = pixels.original[3]! / 255;
  for (let channel = 0; channel < 3; channel++) {
    const expected = Math.round(pixels.original[channel]! * opacity + (channel === 1 ? 255 : 0) * (1 - opacity));
    expect(Math.abs(pixels.composited[channel]! - expected)).toBeLessThanOrEqual(1);
  }
  await api("/playback/skip", "POST", {}); await expect(overlay.locator("video")).toHaveCount(0);
  results.push({ case: "transient-private-vp9-alpha-detached-after-skip", detachedAfterSkip: true });
});

const animation = { mode: "preset", entrance: "fade", exit: "fade", durationMs: 0, delayMs: 0, easing: "ease-out" };
async function enableDesktop(): Promise<void> {
  const settings = surfaceSettingsViewSchema.parse(await api("/overlay-surfaces"));
  const surface = settings.surfaces.find(item => item.kind === "desktop")!;
  if (surface.kind !== "desktop") throw new Error("No desktop surface");
  expect(settings.desktop.displays.length).toBeGreaterThan(0);
  await api(`/overlay-surfaces/${surface.id}`, "PUT", { id: surface.id, kind: surface.kind, enabled: true, displayId: settings.desktop.displays[0]!.id, autoFollowDisplayName: false, opacity: 1,
    layers: surface.layers.map(layer => ({ ...layer, visible: ["timers", "alerts"].includes(layer.moduleId) })) });
}
async function api<T = unknown>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
  expect(response.ok, `${method} ${path}: HTTP ${response.status}`).toBe(true);
  return response.status === 204 ? null as T : response.json() as Promise<T>;
}
async function importAsset(bytes: Buffer, name: string, mimeType: string, fixture: MediaFixture): Promise<string> {
  const response = await uploadMediaFixture({ ownedBase: base, headers, bytes, name, mimeType, fixture });
  expect(response.ok, `Import ${name}: HTTP ${response.status}`).toBe(true);
  return (await response.json() as { id: string }).id;
}
async function sendAudio(assetId: string, type: "audio" | "video"): Promise<void> {
  const document = alertEditorDocumentSchema.parse({ ...editor, durationMode: "custom", durationMs: 15_000, outputs: { browserSource: false, deviceRouteIds: [routeId] }, layers: [{
    id: "format-audio", type, name: "Muted native format", assetId, visible: true, order: 0, animation,
    ...(type === "audio" ? { volume: 0 } : { playEmbeddedAudio: true, audioVolume: 0 })
  }] });
  const response = await api<{ status: string }>(`/management/alerts/${editor.id}/editor/test`, "POST", { document, targetProfileId: null, includeAudio: true, includeTts: false, samplePayload: editor.samplePayloads[0]!.payload });
  expect(response.status).toBe("queued");
  await expect.poll(() => player.locator("audio").evaluateAll(elements => elements.map(element => element as HTMLAudioElement).some(audio => audio.currentTime > 0.05)), { timeout: 15_000 }).toBe(true);
}
async function seekPrivateAudio(interiorTarget?: number) {
  const sample = await player.locator("audio").first().evaluate(async (element, interiorTarget) => {
    const audio = element as HTMLAudioElement;
    const before = { duration: audio.duration, muted: audio.muted, volume: audio.volume, explicitSink: audio.sinkId !== "", privateUrl: audio.src.startsWith("stream-jams-audio://player/media/private_"), error: audio.error?.code ?? null };
    audio.pause(); const target = interiorTarget ?? Math.min(5, audio.duration / 2);
    await new Promise<void>((done, reject) => { const timer = setTimeout(() => reject(new Error("Private native seek timed out")), 5000); audio.addEventListener("seeked", () => { clearTimeout(timer); done(); }, { once: true }); audio.currentTime = target; });
    return { ...before, target, seekTime: audio.currentTime };
  }, interiorTarget);
  expect(sample.muted && sample.explicitSink && sample.privateUrl).toBe(true); expect(sample.volume).toBe(0); expect(sample.error).toBeNull();
  expect(sample.target).toBeGreaterThan(0); expect(Math.abs(sample.seekTime - sample.target)).toBeLessThan(0.15);
  return sample;
}
async function seekPreview(assetId: string, interiorTarget?: number) {
  const preview = await api<{ id: string; url: string }>(`/assets/${assetId}/preview`, "POST");
  try {
    const sample = await management.evaluate(async ({ url, interiorTarget }) => {
      const video = document.createElement("video"); video.muted = true; video.volume = 0;
      try {
        await new Promise<void>((done, reject) => {
          const timer = setTimeout(() => reject(new Error("Registered preview did not decode")), 5000);
          video.onloadeddata = () => { clearTimeout(timer); done(); };
          video.onerror = () => { clearTimeout(timer); reject(new Error("Registered preview decoder error")); };
          video.src = url; video.load();
        });
        await video.play(); await new Promise(done => setTimeout(done, 100)); video.pause();
        const target = interiorTarget ?? Math.min(5, video.duration / 2);
        await new Promise<void>((done, reject) => {
          const timer = setTimeout(() => reject(new Error("Registered preview seek timed out")), 5000);
          video.onseeked = () => { clearTimeout(timer); done(); }; video.currentTime = target;
        });
        return { duration: video.duration, videoWidth: video.videoWidth, videoHeight: video.videoHeight, target, seekTime: video.currentTime, error: video.error?.code ?? null, muted: video.muted, volume: video.volume };
      } finally { video.pause(); video.removeAttribute("src"); video.load(); }
    }, { url: `${base}${preview.url}`, interiorTarget });
    expect(sample.error).toBeNull(); expect(sample.muted).toBe(true); expect(sample.volume).toBe(0); expect(sample.target).toBeGreaterThan(0); expect(Math.abs(sample.seekTime - sample.target)).toBeLessThan(0.15);
    return sample;
  } finally { await api(`/assets/previews/${preview.id}`, "DELETE"); }
}
async function skip(): Promise<void> { await api("/playback/skip", "POST", {}); await expect(player.locator("audio")).toHaveCount(0); }
async function startTimer(iconAssetId: string): Promise<string> {
  const timer = await api<{ id: string }>("/timers", "POST", { label: "Silent format icon", durationMs: 60_000, iconAssetId, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] } });
  await api(`/timers/${timer.id}/start`, "POST", {}); return timer.id;
}
