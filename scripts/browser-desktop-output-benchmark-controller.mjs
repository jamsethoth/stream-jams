/* global window, requestAnimationFrame */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers';
import { URL } from 'node:url';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, totalmem, platform, release } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
const moduleAt = p => import(pathToFileURL(resolve(p)).href);
const { InMemorySecretStore, startPearProtocolFixture } = await moduleAt('packages/test-support/dist/index.js');
const { createDefaultAppConfig } = await moduleAt('apps/server/dist/config/default-config.js');
const { FileConfigStore } = await moduleAt('apps/server/dist/config/file-config-store.js');
const { startLocalRuntime } = await moduleAt('apps/server/dist/runtime/start-local-runtime.js');
const output = resolve(process.argv[2] ?? '.superpowers/sdd/2026-10-10-browser-desktop-output-layouts/baseline/run-01');
await mkdir(output, { recursive: true });
const delay = ms => new Promise(done => setTimeout(done, ms));
const root = await mkdtemp(join(tmpdir(), 'stream-jams-output-baseline-'));
const reservation = createServer();
await new Promise(done => reservation.listen(0, '127.0.0.1', done));
const port = reservation.address().port;
await new Promise(done => reservation.close(done));
const pear = await startPearProtocolFixture();
let runtime, browser;
const result = { environment: { sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), trackedDiff: execFileSync('git', ['diff', '--stat'], { encoding: 'utf8' }).trim(), node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0].model, logicalCpus: cpus().length, physicalMemoryBytes: totalmem(), browser: null }, recipe: { windowsMs: 10000, outputCount: 3, outputs: ['timers landscape 1920x1080', 'timers vertical 1080x1920', 'music landscape 1920x1080'], timerCount: 14, visibleCapacity: 12, durationMs: 600000, eventCount: 20, eventIntervalMs: 100, songChangeCount: 5, songChangeIntervalMs: 3200, browserMode: 'headless Chromium', audio: 'disabled/no assets/no selected device', videoMetadata: 'offline fail-fast' }, phases: [], admission: {}, limitations: ['Node CPU includes runtime plus benchmark controller, not Chromium processes.', 'CDP TaskDuration is main-thread task time; JSHeapUsedSize is JS heap, not process RSS or GPU memory.', 'No native OBS, GPU, audio audibility or physical desktop compositor measurement.', 'Video decoding/frame pacing not measured; admission uses offline metadata only.', 'Desktop transport rendering is not measured.'] };
try {
  result.network = { blockedBrowserRequests: 0, offlineVideoMetadataCalls: 0 };
  const config = { ...createDefaultAppConfig(root), server: { host: '127.0.0.1', port } };
  runtime = await startLocalRuntime({ homeDirectory: root, environment: {}, secretStore: new InMemorySecretStore(), configStore: new FileConfigStore({ configFilePath: join(root, 'config.json'), defaultConfig: config }), webBuildDirectory: resolve('apps/web/dist'), videoMetadataFetch: async () => { result.network.offlineVideoMetadataCalls++; throw new TypeError('Offline baseline metadata'); } });
  const session = await (await globalThis.fetch(`${runtime.url}/auth/management/sessions`, { method: 'POST' })).json();
  const headers = { authorization: `Bearer ${session.id}`, 'x-stream-jams-csrf': session.csrfToken, 'content-type': 'application/json' };
  const request = async (path, method = 'GET', body) => {
    const response = await globalThis.fetch(`${runtime.url}${path}`, { method, headers, signal: globalThis.AbortSignal.timeout(10000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  };
  const musicConfig = await request('/overlay-modules/music/config');
  await request('/overlay-modules/music/config', 'PUT', { enabled: true, config: musicConfig.config });
  const timerConfig = await request('/overlay-modules/timers/config');
  timerConfig.config.profiles.landscape.maxVisible = 12;
  timerConfig.config.profiles.vertical.maxVisible = 12;
  await request('/overlay-modules/timers/config', 'PUT', { enabled: true, config: timerConfig.config });
  const videoConfig = await request('/overlay-modules/videos/config');
  await request('/overlay-modules/videos/config', 'PUT', { enabled: true, config: videoConfig.config });
  await writeFile(join(output, 'saved-configs.json'), JSON.stringify({ timers: timerConfig.config, music: musicConfig.config, videos: videoConfig.config }, null, 2));
  pear.setSong({ status: 200, body: { videoId: 'fixture-song', title: 'Baseline long track title', artist: 'Synthetic artist', album: 'Synthetic album', songDuration: 180, elapsedSeconds: 12, isPaused: false } });
  const configuration = { baseUrl: pear.baseUrl, transport: 'poll' };
  const pairing = await request('/management/music/pairing', 'POST', configuration);
  let pairingState;
  for (let i = 0; i < 40; i++) { pairingState = await request(`/management/music/pairing/${pairing.attemptId}`); if (pairingState.status !== 'pending') break; await delay(50); }
  if (pairingState.status !== 'approved') throw new Error('Pear pairing not approved');
  await request('/management/providers', 'POST', { kind: 'pear-desktop', name: 'Baseline local Pear', configuration, pairingAttemptId: pairing.attemptId });
  browser = await chromium.launch({ headless: true });
  result.environment.browser = browser.version();
  const pages = [];
  for (const [moduleId, targetProfileId, width, height] of [['timers', 'landscape', 1920, 1080], ['timers', 'vertical', 1080, 1920], ['music', 'landscape', 1920, 1080]]) {
    const key = await request('/management/overlay-outputs/keys', 'POST', { overlayId: 'default', moduleId, targetProfileId, purpose: 'live', scope: 'module' });
    const page = await browser.newPage({ viewport: { width, height } });
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === runtime.url) return route.continue();
      result.network.blockedBrowserRequests++; return route.abort();
    });
    await page.addInitScript(() => {
      window.__baselineRaf = [];
      let prior;
      const frame = at => { if (prior !== undefined) window.__baselineRaf.push(at - prior); prior = at; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    });
    const messages = [];
    page.on('websocket', socket => socket.on('framereceived', event => { let type = 'unparsed'; try { type = JSON.parse(String(event.payload)).type; } catch { /* Keep the original unparsed label for malformed frames. */ } messages.push({ at: Date.now(), bytes: Buffer.byteLength(String(event.payload)), type }); }));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(key.url); await page.waitForLoadState('networkidle');
    pages.push({ page, cdp, messages, name: `${moduleId}-${targetProfileId}` });
  }
  const sample = async (name, work) => {
    const beforeCpu = process.cpuUsage(); const at = performance.now();
    await Promise.all(pages.map(item => item.page.evaluate(() => { window.__baselineRaf = []; })));
    const starts = await Promise.all(pages.map(async item => ({ count: item.messages.length, metrics: Object.fromEntries((await item.cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value])) })));
    if (work) await work();
    const elapsedWork = performance.now() - at;
    if (elapsedWork < 10000) await delay(10000 - elapsedWork);
    const wallMs = performance.now() - at; const cpu = process.cpuUsage(beforeCpu);
    const outputs = await Promise.all(pages.map(async (item, i) => {
      const metrics = Object.fromEntries((await item.cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
      const frames = item.messages.slice(starts[i].count); const types = {};
      for (const frame of frames) types[frame.type] = (types[frame.type] ?? 0) + 1;
      const cadence = frames.filter(f => f.type.includes('timer')).map(f => f.at);
      const raf = await item.page.evaluate(() => window.__baselineRaf);
      const sortedRaf = [...raf].sort((a, b) => a - b);
      await item.page.screenshot({ path: join(output, `${name}-${item.name}.png`) });
      const bounds = await item.page.locator('.timer-stack, .timer-stack__card, [data-testid="music-widget"]').evaluateAll(elements => elements.map(element => { const b = element.getBoundingClientRect(); return { className: element.className, x: b.x, y: b.y, width: b.width, height: b.height, text: element.textContent }; }));
      return { name: item.name, receivedMessages: frames.length, receivedBytes: frames.reduce((s, f) => s + f.bytes, 0), messageRatePerSecond: frames.length / (wallMs / 1000), messageTypes: types, timerMessageIntervalsMs: cadence.slice(1).map((t, j) => t - cadence[j]), chromiumMainThreadTaskMs: (metrics.TaskDuration - starts[i].metrics.TaskDuration) * 1000, jsHeapUsedBytes: metrics.JSHeapUsedSize, layoutCount: metrics.LayoutCount - starts[i].metrics.LayoutCount, recalcStyleCount: metrics.RecalcStyleCount - starts[i].metrics.RecalcStyleCount, raf: { count: raf.length, p50Ms: sortedRaf[Math.floor(sortedRaf.length * .5)], p95Ms: sortedRaf[Math.floor(sortedRaf.length * .95)], maxMs: sortedRaf.at(-1), intervalsOver50Ms: raf.filter(n => n > 50).length }, bounds };
    }));
    result.phases.push({ name, wallMs, nodeCpuUserUs: cpu.user, nodeCpuSystemUs: cpu.system, nodeCpuPercentOfOneCore: (cpu.user + cpu.system) / (wallMs * 10), nodeMemory: process.memoryUsage(), outputs });
    await writeFile(join(output, 'metrics.json'), JSON.stringify(result, null, 2));
  };
  await sample('idle');
  const definitions = [];
  for (let i = 0; i < 14; i++) {
    const definition = runtime.composition.timerManagementService.createDefinition({ label: `Baseline timer ${i + 1} with long label`, durationMs: 600000, iconAssetId: null, startAudioAssetId: null, endAudioAssetId: null, outputs: { browserSource: true, deviceRouteIds: [] }, eventRules: i === 0 ? [{ enabled: true, selector: { match: { kind: 'canonical', type: 'cheer' }, sources: 'any', conditions: [] }, action: 'increment', amountMs: 1000, inactiveBehavior: 'ignore', quantityUnit: null }] : [] });
    definitions.push(definition); await runtime.composition.timerRuntimeCoordinator.start(definition.id);
  }
  await sample('maximum-timers');
  await sample('track-text-changes', async () => { for (let i = 0; i < 5; i++) { pear.setSong({ status: 200, body: { videoId: `fixture-${i}`, title: `Long synthetic track title ${i}`, artist: `Artist ${i}`, album: 'Synthetic album', songDuration: 180, elapsedSeconds: i, isPaused: false } }); await delay(3200); } });
  const latencies = []; const statuses = [];
  await sample('event-admission', async () => {
    for (let i = 0; i < 20; i++) {
      const event = { id: `baseline-cheer-${i}`, providerId: 'twitch', sourcePlatform: 'twitch', ingestProvider: 'twitch', occurredAt: new Date().toISOString(), actor: { id: 'fixture-viewer', displayName: 'Synthetic viewer' }, message: null, metadata: {}, type: 'cheer', amount: 100 };
      const t = performance.now(); statuses.push((await runtime.composition.eventIngestionService.ingestNormalizedEvent(event)).status); latencies.push(performance.now() - t);
      statuses.push((await runtime.composition.eventIngestionService.ingestNormalizedEvent(event)).status);
      await delay(100);
    }
  });
  result.admission = { normalizedEventLatenciesMs: latencies, statuses, note: 'In-process real event ingestion and duplicate delivery, not future manual bus HTTP admission.' };
  const videoLatencies = [], videoStatuses = [];
  for (let i = 0; i < 5; i++) { const t = performance.now(); const response = await request('/videos/live/requests', 'POST', { link: 'https://youtu.be/e2ePlacemnt', title: `Offline fixture ${i}`, durationSeconds: 30, autoplay: false }); videoLatencies.push(performance.now() - t); videoStatuses.push(response.item?.id ? 'accepted-item' : 'unknown'); }
  const queue = await request('/videos/live');
  result.admission.video = { httpLatenciesMs: videoLatencies, statuses: videoStatuses, queueItemCount: queue.items?.length ?? null, responseKeys: Object.keys(queue), note: 'Five deliberate requests; metadata denied before outbound traffic. No video playback.' };
  await writeFile(join(output, 'metrics.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, phases: result.phases.map(p => ({ name: p.name, nodeCpuPercentOfOneCore: p.nodeCpuPercentOfOneCore, rss: p.nodeMemory.rss, messages: p.outputs.map(o => o.receivedMessages) })), admission: result.admission }));
} finally { await browser?.close(); await runtime?.close(); await pear.close(); await rm(root, { recursive: true, force: true }); }
