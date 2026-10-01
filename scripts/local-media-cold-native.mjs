/* global AbortSignal, fetch, setInterval, clearInterval, setTimeout, clearTimeout */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve, sep } from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';

export async function materializePlayableFixture(path, seed, sizeBytes, signal) {
  if (seed.length + 8 > sizeBytes) throw new Error('Native fixture is larger than target');
  const file = await open(path, 'wx');
  const hash = createHash('sha256');
  try {
    await file.writeFile(seed); hash.update(seed);
    const header = Buffer.alloc(8); header.writeUInt32BE(sizeBytes - seed.length); header.write('free', 4, 'ascii');
    await file.writeFile(header); hash.update(header);
    // Write every padding byte: no sparse truncate and no post-purge fixture read.
    for (let left = sizeBytes - seed.length - 8; left > 0;) {
      signal?.throwIfAborted();
      const bytes = Buffer.alloc(Math.min(left, 65536));
      await file.writeFile(bytes); hash.update(bytes); left -= bytes.length;
    }
    await file.sync();
  } finally { await file.close(); }
  return `sha256:${hash.digest('hex')}`;
}

const running = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
};

async function bounded(operation, milliseconds) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned packaged shutdown timed out')), milliseconds); })]);
  } finally { clearTimeout(timer); }
}

export async function closeOwnedNative(desktop, child, pids, terminate, timeoutMs = 20000) {
  try {
    (await bounded(desktop.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid)), timeoutMs)).forEach(pid => pids.add(pid));
    await bounded(desktop.evaluate(({ app }) => app.quit()), timeoutMs);
    await bounded(desktop.close(), timeoutMs);
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null && [...pids].every(pid => !running(pid))) return { capturedPids: [...pids], capturedPidsExited: true, exitCode: child.exitCode };
      await delay(100);
    }
    throw new Error('Owned packaged processes did not exit');
  } catch (error) {
    let terminationError, terminationAttempted = false, terminationCompleted = false;
    // Only the still-running child handle from our own launch can authorize a
    // tree termination; no process-name/global scan and no unrelated PID kill.
    if (child.exitCode === null && child.signalCode === null) {
      terminationAttempted = true;
      try { await terminate(child.pid); terminationCompleted = true; } catch (failure) { terminationError = failure.message; }
    }
    const failure = new Error(`${error.message}; owned shutdown failed and profile retained${terminationError ? `; cleanup termination failed: ${terminationError}` : ''}`);
    failure.cleanupEvidence = { capturedPids: [...pids], terminationAttempted, terminationCompleted, capturedPidsExited: [...pids].every(pid => !running(pid)) };
    throw failure;
  }
}

// Reuses the packaged resource acceptance route: private selected-device audio,
// authoritative mute, zero gain, disposable profile, sandbox enabled.
export function createNativeProbe(root, executablePath, terminate) {
  let desktop, player, api, editor, rule, route, child;
  const pids = new Set();
  const fixtures = [];
  let runtime;
  return {
    get fixtures() { return fixtures; },
    get runtime() { return runtime; },
    async prepare(signal) {
      const { _electron } = await import('@playwright/test');
      const listener = createServer(); await new Promise(done => listener.listen(0, '127.0.0.1', done));
      const port = listener.address().port; await new Promise((done, reject) => listener.close(error => error ? reject(error) : done()));
      const base = `http://127.0.0.1:${port}`, assetRoot = join(root, 'assets');
      const configPath = join(root, 'config.json');
      await writeFile(configPath, JSON.stringify({ server: { host: '127.0.0.1', port }, storage: { dataDirectory: join(root, 'data'), assetDirectory: assetRoot }, playback: { paused: false, muted: true, doNotDisturb: false } }));
      const env = { ...process.env, STREAM_JAMS_CONFIG_PATH: configPath, STREAM_JAMS_DESKTOP_USER_DATA_PATH: join(root, 'electron'), STREAM_JAMS_SHUTDOWN_LOG: join(root, 'shutdown.jsonl') };
      delete env.ELECTRON_RUN_AS_NODE;
      desktop = await _electron.launch({ executablePath, env, cwd: root, chromiumSandbox: true, timeout: 30000 });
      child = desktop.process(); if (!child.pid) throw new Error('Packaged process PID missing'); pids.add(child.pid);
      await desktop.evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.hide();
        BrowserWindow.prototype.show = function () {};
        BrowserWindow.prototype.showInactive = function () {};
      });
      runtime = await desktop.evaluate(({ app }) => ({ packaged: app.isPackaged, asar: app.getAppPath().endsWith('app.asar'), versions: process.versions, pids: app.getAppMetrics().map(metric => metric.pid) }));
      runtime.pids.forEach(pid => pids.add(pid));
      if (!runtime.packaged || !runtime.asar) throw new Error('Native probe requires actual packaged app');
      let healthy = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        signal?.throwIfAborted();
        try { healthy = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) })).ok; }
        catch { /* Owned service is still starting. */ }
        if (healthy) break;
        if (child.exitCode !== null) throw new Error('Packaged app exited before service health');
        await delay(100);
      }
      if (!healthy) throw new Error('Disposable packaged service did not become healthy');
      let management;
      for (let attempt = 0; attempt < 150 && !management; attempt++) {
        signal?.throwIfAborted(); management = desktop.windows().find(page => page.url() === `${base}/manage`); if (!management) await delay(100);
      }
      if (!management) throw new Error('Disposable management window unavailable');
      await management.getByRole('link', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 20000 });
      const sessionResponse = await fetch(`${base}/auth/management/sessions`, { method: 'POST', signal: AbortSignal.timeout(15000) });
      if (!sessionResponse.ok) throw new Error('Disposable management session unavailable');
      const session = await sessionResponse.json();
      const headers = { authorization: `Bearer ${session.id}`, 'x-stream-jams-csrf': session.csrfToken };
      api = async (path, method = 'GET', body, extra = {}) => {
        if (!extra.cleanup) signal?.throwIfAborted();
        const response = await fetch(`${base}${path}`, { method, headers: { ...headers, 'content-type': 'application/json', ...extra.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...extra,
          signal: signal && !extra.cleanup ? AbortSignal.any([signal, AbortSignal.timeout(40000)]) : AbortSignal.timeout(40000) });
        if (!response.ok) throw new Error(`Native probe HTTP ${response.status}`);
        return response.status === 204 ? null : response.json();
      };
      const devices = await api('/audio/devices');
      if (!devices.available || !devices.devices.length) throw new Error('Native audio probe requires an available local sink (always muted)');
      route = await api('/audio/routes', 'POST', { name: 'Muted disposable cold timing', deviceId: devices.devices[0].deviceId });
      for (let attempt = 0; attempt < 250 && !player; attempt++) {
        signal?.throwIfAborted(); player = desktop.windows().find(page => page.url() === 'stream-jams-audio://player/'); if (!player) await delay(100);
      }
      if (!player) throw new Error('Private native player unavailable');
      const set = await api('/management/alert-sets', 'POST', { name: 'Disposable native timing' });
      rule = await api(`/management/alert-sets/${set.id}/alerts`, 'POST', { eventType: 'follow', name: 'Muted native timing' });
      editor = await api(`/management/alerts/${rule.id}/editor`);
      const seed = await readFile(resolve('tests/fixtures/media/neutral-with-audio.mp4'));
      for (const sizeMiB of [1, 25, 100]) {
        const sizeBytes = sizeMiB * 1024 * 1024, name = `native-${sizeMiB}.mp4`, path = join(root, name);
        const checksum = await materializePlayableFixture(path, seed, sizeBytes, signal);
        const asset = await api('/assets/import', 'POST', undefined, { headers: { ...headers, 'content-type': 'application/octet-stream', 'x-stream-jams-file-name': name, 'x-stream-jams-mime-type': 'video/mp4', 'content-length': String(sizeBytes) }, body: Readable.toWeb(createReadStream(path)), duplex: 'half' });
        const actualPath = resolve(assetRoot, asset.storagePath);
        if (!actualPath.startsWith(resolve(assetRoot) + sep) || asset.checksum !== checksum || asset.sizeBytes !== sizeBytes || !(asset.durationMs > 0)) throw new Error('Imported native fixture identity/probe mismatch');
        const identity = await stat(actualPath);
        fixtures.push({ id: asset.id, sizeBytes, checksum, path: actualPath, identity: { dev: identity.dev, ino: identity.ino, size: identity.size, mtimeMs: identity.mtimeMs, ctimeMs: identity.ctimeMs }, durationMs: asset.durationMs });
      }
      // Decode/probe once before any purge; this is deliberately a warm control.
      for (const fixture of fixtures) await this.measureFixture(fixture, signal);
      runtime.pids = await desktop.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid)); runtime.pids.forEach(pid => pids.add(pid));
    },
    async measureFixture(fixture, signal) {
      signal?.throwIfAborted();
      // Arm before triggering verification/playback. Source URLs are never saved.
      await player.evaluate(() => {
        globalThis.coldTimingSample = null;
        const started = Date.now(); let initial;
        globalThis.coldTimingTimer = setInterval(() => {
          const audio = document.querySelector('audio');
          if (!audio) return;
          if (!audio.muted || audio.volume !== 0) { globalThis.coldTimingSample = { error: 'Native probe is not muted at zero gain' }; return; }
          if (audio.error) { globalThis.coldTimingSample = { error: `Native decoder error ${audio.error.code}` }; return; }
          if (initial === undefined) initial = audio.currentTime;
          if (!audio.paused && audio.currentTime - initial >= 0.05) {
            globalThis.coldTimingSample = { observedAt: Date.now(), armedAt: started, initialTime: initial, currentTime: audio.currentTime, muted: audio.muted, volume: audio.volume, explicitSink: audio.sinkId !== '', privateTransport: audio.src.startsWith('stream-jams-audio://player/media/private_') };
            clearInterval(globalThis.coldTimingTimer);
          }
        }, 5);
      });
      const requestedAt = new Date().toISOString(), start = Date.now();
      const document = { ...editor, durationMode: 'custom', durationMs: 15000, outputs: { browserSource: false, deviceRouteIds: [route.id] }, layers: [{ id: 'native-cold-audio', type: 'video', name: 'Muted native timing', assetId: fixture.id, visible: true, order: 0, playEmbeddedAudio: true, audioVolume: 0, animation: { mode: 'preset', entrance: 'fade', exit: 'fade', durationMs: 0, delayMs: 0, easing: 'ease-out' } }] };
      try {
        const queued = await api(`/management/alerts/${rule.id}/editor/test`, 'POST', { document, targetProfileId: null, includeAudio: true, includeTts: false, samplePayload: editor.samplePayloads[0].payload });
        if (queued.status !== 'queued') throw new Error('Native playback not queued');
        await player.waitForFunction(() => globalThis.coldTimingSample !== null, null, { timeout: 20000, polling: 20 });
        const onset = await player.evaluate(() => globalThis.coldTimingSample);
        if (onset.error || !onset.explicitSink || !onset.privateTransport) throw new Error(onset.error ?? 'Native transport/sink evidence missing');
        return { fixtureId: fixture.id, sizeBytes: fixture.sizeBytes, checksum: fixture.checksum, requestedAt, onsetUtc: new Date(onset.observedAt).toISOString(), onsetKind: 'audio-current-time-advancement', verificationAndNativeOnsetMs: onset.observedAt - start, clockAdvancementSeconds: onset.currentTime - onset.initialTime, onset,
          preparationMs: null, observationPrecision: 'Wall clock millisecond upper bound: requires 50 ms media advancement; renderer polls every 5 ms.', preparationBoundary: 'Packaged DesktopAudioSink verifyGroup precedes native transport; individual integrity duration is not exposed.' };
      } finally {
        await player.evaluate(() => { clearInterval(globalThis.coldTimingTimer); delete globalThis.coldTimingTimer; delete globalThis.coldTimingSample; });
        await api('/playback/skip', 'POST', {}, { cleanup: true });
        await player.waitForFunction(() => document.querySelectorAll('audio').length === 0, null, { timeout: 15000 });
      }
    },
    async measure(pass, signal) {
      const measurements = [];
      for (const fixture of fixtures) measurements.push(await this.measureFixture(fixture, signal));
      return { pass, measurements, cleanup: { nativeElements: 0, packagedInternalCounters: 'unavailable via production IPC' } };
    },
    async close() {
      if (!desktop) return { capturedPids: [], capturedPidsExited: true };
      return closeOwnedNative(desktop, child, pids, terminate);
    }
  };
}
