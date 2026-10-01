/* global performance, document, setTimeout, clearTimeout, TextEncoder, fetch, AbortSignal */
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { _electron, expect } from '@playwright/test';

// Run only against the self-contained Forge package, with an isolated config,
// muted production safety state and zero-gain layers. Private originals are
// read in place and imported only into this disposable OS temporary profile.
const evidenceRoot = resolve('apps/desktop/out/streaming-acceptance');
const formatsOnly = process.argv.includes('--formats');
await mkdir(evidenceRoot, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'stream-jams-forge-streaming-'));
const executablePath = resolve('apps/desktop/out/Stream Jams-win32-x64/Stream Jams.exe');
const packageSha256 = createHash('sha256').update(await readFile(join(dirname(executablePath), 'resources/app.asar'))).digest('hex');
const listener = createServer(); await new Promise(accept => listener.listen(0, '127.0.0.1', accept));
const port = listener.address().port; await new Promise(accept => listener.close(accept));
const base = `http://127.0.0.1:${port}`;
await writeFile(join(profile, 'config.json'), JSON.stringify({ server: { host: '127.0.0.1', port }, storage: { dataDirectory: join(profile, 'data'), assetDirectory: join(profile, 'assets') }, playback: { paused: false, muted: true, doNotDisturb: false } }));
const env = { ...process.env, STREAM_JAMS_CONFIG_PATH: join(profile, 'config.json'), STREAM_JAMS_DESKTOP_USER_DATA_PATH: join(profile, 'electron'), STREAM_JAMS_SHUTDOWN_LOG: join(profile, 'shutdown.jsonl') }; delete env.ELECTRON_RUN_AS_NODE;
const results = { packageSha256, profile, files: [], requests: [], samples: [], ipc: [], limitations: ['First use means first preparation in this process; OS cache was not flushed. Warm means repeated playback of the same registered asset.', 'Electron app metrics expose utility-process working set, not Node external memory. Renderer JS heap excludes native decoder buffers.', 'Muted native decoding does not establish audible routing, two physical devices, OBS coexistence or visible transparency.'] };
let desktop, child;
try {
  desktop = await _electron.launch({ executablePath, env, cwd: profile, chromiumSandbox: true, timeout: 30_000 }); child = desktop.process();
  await expect.poll(() => desktop.windows().some(page => page.url() === `${base}/manage`), { timeout: 30_000 }).toBe(true);
  await desktop.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.hide();
    // This isolated process never presents an overlay over the user's display.
    BrowserWindow.prototype.show = function() {};
    BrowserWindow.prototype.showInactive = function() {};
    const observed = globalThis; observed.acceptanceIpc = [];
    const prototype = Object.getPrototypeOf(BrowserWindow.getAllWindows()[0].webContents);
    const send = prototype.send;
    prototype.send = function(channel, ...args) {
      if (channel.includes('audio') || channel.includes('overlay')) {
        const json = JSON.stringify(args);
        observed.acceptanceIpc.push({ channel, sizeBytes: new TextEncoder().encode(json).byteLength, bodyField: /"bytes"\s*:/.test(json), trustedHandle: json.includes('med_') });
      }
      return send.call(this, channel, ...args);
    };
  });
  const sessionResponse = await fetch(`${base}/auth/management/sessions`, { method: 'POST' }); expect(sessionResponse.ok).toBe(true);
  const session = await sessionResponse.json();
  const headers = { authorization: `Bearer ${session.id}`, 'x-stream-jams-csrf': session.csrfToken, 'content-type': 'application/json' };
  async function api(path, method = 'GET', body) {
    const response = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }
  const devices = await api('/audio/devices'); expect(devices.available).toBe(true); expect(devices.devices.length).toBeGreaterThan(0);
  const route = await api('/audio/routes', 'POST', { name: 'Muted isolated streaming acceptance', deviceId: devices.devices[0].deviceId });
  await expect.poll(() => desktop.windows().some(page => page.url() === 'stream-jams-audio://player/')).toBe(true);
  const player = desktop.windows().find(page => page.url() === 'stream-jams-audio://player/');
  player.on('response', response => { if (response.url().includes('/media/private_')) results.requests.push({ status: response.status(), range: response.request().headers().range ?? null, contentRange: response.headers()['content-range'] ?? null }); });
  const rule = (await api('/alerts/rules')).find(item => item.eventType === 'follow');
  const editor = await api(`/management/alerts/${rule.id}/editor`);
  async function sample(label) {
    const host = await desktop.evaluate(({ app }) => ({ at: Date.now(), main: process.memoryUsage(), processes: app.getAppMetrics().map(metric => ({ pid: metric.pid, type: metric.type, serviceName: metric.serviceName, memory: metric.memory })) }));
    const renderer = await player.evaluate(() => { const memory = performance.memory; return memory ? { usedJSHeapSize: memory.usedJSHeapSize, totalJSHeapSize: memory.totalJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit } : null; });
    results.samples.push({ label, ...host, renderer });
  }
  const fixture = await readFile('tests/fixtures/media/neutral-with-audio.mp4');
  const candidates = [];
  for (const mib of formatsOnly ? [] : [1, 25, 100]) {
    const body = Buffer.alloc(mib * 1024 * 1024); fixture.copy(body); body.writeUInt32BE(body.length - fixture.length, fixture.length); body.write('free', fixture.length + 4, 'ascii');
    const path = join(profile, `neutral-${mib}MiB.mp4`); await writeFile(path, body); candidates.push({ name: `${mib}MiB MP4`, path, mimeType: 'video/mp4', passes: 2 });
  }
  if (!formatsOnly) candidates.push({ name: 'Original Clean Screen', path: 'F:/Streaming/Assets/Screen Effects/Screen Blocked/clean screen.webm', mimeType: 'video/webm', passes: 1 }, { name: 'Original Snowball', path: 'F:/Streaming/Assets/Screen Effects/Screen Blocked/snowball.webm', mimeType: 'video/webm', passes: 1 });
  else {
    const wav = Buffer.alloc(44 + 3 * 48000 * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    const wavPath = join(profile, 'neutral.wav'); await writeFile(wavPath, wav);
    candidates.push({ name: 'Generated silent PCM WAV', path: wavPath, mimeType: 'audio/wav', passes: 1 }, { name: 'WPT MP3', path: join(evidenceRoot, 'wpt/sound_5.mp3'), mimeType: 'audio/mpeg', passes: 1 }, { name: 'WPT Ogg Vorbis', path: join(evidenceRoot, 'wpt/sound_5.oga'), mimeType: 'audio/ogg', passes: 1 }, { name: 'WebM Opus soundtrack declared audio/webm (also contains VP9 video)', path: resolve('tests/fixtures/media/neutral-with-audio.webm'), mimeType: 'audio/webm', passes: 1 });
  }
  for (const candidate of candidates) {
    const sizeBytes = (await stat(candidate.path)).size;
    const hash = createHash('sha256'); for await (const chunk of createReadStream(candidate.path)) hash.update(chunk);
    const imported = await fetch(`${base}/assets/import`, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-stream-jams-file-name': candidate.path.split(/[\\/]/).at(-1), 'x-stream-jams-mime-type': candidate.mimeType, 'content-length': String(sizeBytes) }, body: createReadStream(candidate.path), duplex: 'half', signal: AbortSignal.timeout(40_000) });
    if (!imported.ok) throw new Error(`Import ${candidate.name}: ${imported.status} ${await imported.text()}`);
    const asset = await imported.json();
    for (let pass = 0; pass < candidate.passes; pass++) {
      await sample(`${candidate.name}:${pass}:before`);
      const layer = candidate.mimeType.startsWith('audio/') ? { id: 'silent-audio', type: 'audio', name: 'Silent streaming probe', assetId: asset.id, visible: true, order: 0, volume: 0, animation: { mode: 'preset', entrance: 'fade', exit: 'fade', durationMs: 300, delayMs: 0, easing: 'ease-out' } } : { id: 'silent-video', type: 'video', name: 'Silent streaming probe', assetId: asset.id, visible: true, order: 0, playEmbeddedAudio: true, audioVolume: 0, animation: { mode: 'preset', entrance: 'fade', exit: 'fade', durationMs: 300, delayMs: 0, easing: 'ease-out' } };
      const draft = { ...editor, durationMode: 'custom', durationMs: 15_000, outputs: { browserSource: false, deviceRouteIds: [route.id] }, layers: [layer] };
      const begin = Date.now(); await api(`/management/alerts/${rule.id}/editor/test`, 'POST', { document: draft, targetProfileId: null, includeAudio: true, includeTts: false, samplePayload: editor.samplePayloads[0].payload });
      await expect.poll(() => player.locator('audio').evaluateAll(elements => elements.some(element => element.currentTime > 0.05)), { timeout: 15_000 }).toBe(true);
      const onsetObservedMs = Date.now() - begin;
      const playback = await player.locator('audio').first().evaluate(async audio => {
        const before = { currentTime: audio.currentTime, duration: audio.duration, muted: audio.muted, volume: audio.volume, sinkId: audio.sinkId, privateUrl: audio.src.startsWith('stream-jams-audio://player/media/private_'), error: audio.error?.code ?? null };
        audio.pause();
        const seekStarted = Date.now();
        const seekTarget = Math.min(5, audio.duration / 2);
        await new Promise((accept, reject) => { const timeout = setTimeout(() => reject(new Error(`Native private seek timed out: ${JSON.stringify(before)}, target ${seekTarget}`)), 5000); audio.addEventListener('seeked', () => { clearTimeout(timeout); accept(); }, { once: true }); audio.currentTime = seekTarget; });
        return { ...before, seekTarget, seekTime: audio.currentTime, seekMs: Date.now() - seekStarted };
      });
      expect(playback.muted).toBe(true); expect(playback.volume).toBe(0); expect(playback.privateUrl).toBe(true); expect(playback.error).toBeNull(); expect(playback.seekTarget).toBeGreaterThan(0); expect(Math.abs(playback.seekTime - playback.seekTarget)).toBeLessThan(0.15);
      await sample(`${candidate.name}:${pass}:prepared-seek`);
      await api('/playback/skip', 'POST', {}); await expect(player.locator('audio')).toHaveCount(0); await delay(250);
      await sample(`${candidate.name}:${pass}:released`);
      results.files.push({ name: candidate.name, sizeBytes, sha256: hash.copy().digest('hex'), pass: pass === 0 ? 'first-process-use' : 'warm-repeat', onsetObservedMs, playback });
    }
  }
  if (formatsOnly) {
    const management = desktop.windows().find(page => page.url() === `${base}/manage`);
    const images = await management.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8; const context = canvas.getContext('2d'); context.fillStyle = '#40aa88'; context.fillRect(0, 0, 4, 8);
      return ['image/png', 'image/jpeg', 'image/webp'].map(mimeType => ({ mimeType, base64: canvas.toDataURL(mimeType).split(',')[1] }));
    });
    images.push({ mimeType: 'image/gif', base64: 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' });
    const surfaces = await api('/overlay-surfaces'); const surface = surfaces.surfaces.find(item => item.kind === 'desktop'); const display = surfaces.desktop.displays[0];
    await api(`/overlay-surfaces/${surface.id}`, 'PUT', { id: surface.id, kind: surface.kind, enabled: true, displayId: display.id, autoFollowDisplayName: surface.autoFollowDisplayName, opacity: surface.opacity, layers: surface.layers.map(layer => layer.moduleId === 'timers' ? { ...layer, visible: true } : layer) });
    const module = await api('/overlay-modules/timers/config'); await api('/overlay-modules/timers/config', 'PUT', { enabled: true, config: module.config });
    results.images = [];
    for (const image of images) {
      const bytes = Buffer.from(image.base64, 'base64'); const extension = image.mimeType.split('/')[1];
      const imported = await fetch(`${base}/assets/import`, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream', 'x-stream-jams-file-name': `neutral.${extension}`, 'x-stream-jams-mime-type': image.mimeType }, body: bytes }); expect(imported.ok).toBe(true); const asset = await imported.json();
      const timer = await api('/timers', 'POST', { label: `Silent ${extension} icon`, durationMs: 60_000, iconAssetId: asset.id, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: false, deviceRouteIds: [] } }); await api(`/timers/${timer.id}/start`, 'POST', {});
      await expect.poll(() => desktop.windows().some(page => page.url() === 'stream-jams-overlay://surface/')).toBe(true);
      const overlay = desktop.windows().find(page => page.url() === 'stream-jams-overlay://surface/');
      await expect.poll(() => overlay.locator('img').evaluateAll(elements => elements.some(element => element.complete && element.naturalWidth > 0))).toBe(true);
      const native = await overlay.locator('img').first().evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight, privateUrl: image.src.startsWith('stream-jams-overlay://surface/media/private_') })); expect(native.privateUrl).toBe(true);
      results.images.push({ mimeType: image.mimeType, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), native }); await api(`/timers/${timer.id}/stop`, 'POST', {}); await expect(overlay.locator('img')).toHaveCount(0);
    }
    expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.isVisible()))).toBe(true);
  }
  results.ipc = await desktop.evaluate(() => globalThis.acceptanceIpc);
  expect(results.ipc.length).toBeGreaterThan(0); expect(results.ipc.every(entry => !entry.bodyField && !entry.trustedHandle && entry.sizeBytes < 16_384)).toBe(true);
  results.packaged = await desktop.evaluate(({ app }) => ({ packaged: app.isPackaged, appPath: app.getAppPath(), versions: process.versions })); expect(results.packaged.packaged).toBe(true); expect(results.packaged.appPath.endsWith('app.asar')).toBe(true);
} catch (error) { results.error = error.stack ?? String(error); }
finally {
  if (desktop && child) {
    try {
      const pids = await desktop.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid));
      const quitStarted = Date.now(); await desktop.evaluate(({ app }) => app.quit()).catch(() => undefined);
      await expect.poll(() => child.exitCode, { timeout: 20_000 }).toBe(0);
      await expect.poll(() => pids.every(pid => { try { process.kill(pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } }), { timeout: 20_000 }).toBe(true);
      results.quit = { elapsedMs: Date.now() - quitStarted, exitCode: child.exitCode, capturedPidsExited: true };
    } catch (error) { results.quitError = error.stack ?? String(error); }
  }
  const logDirectory = join(profile, 'data/logs');
  const logFiles = (await readdir(logDirectory)).filter(file => file.endsWith('.jsonl'));
  results.nativeTiming = (await Promise.all(logFiles.map(async file => (await readFile(join(logDirectory, file), 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))))).flat().filter(entry => entry.event === 'desktop-audio.playback-timing').map(entry => ({ preparationDurationMs: entry.details.preparationDurationMs, scheduledStartEpochMs: entry.details.scheduledStartEpochMs, actualStartEpochMs: entry.details.actualStartEpochMs, terminalOutcome: entry.details.terminalOutcome }));
  const output = join(evidenceRoot, formatsOnly ? 'formats.json' : 'results.json');
  await writeFile(output, JSON.stringify(results, null, 2));
  console.info(`Full Forge acceptance evidence: ${output}`);
  if (results.error || results.quitError) process.exitCode = 1;
}
