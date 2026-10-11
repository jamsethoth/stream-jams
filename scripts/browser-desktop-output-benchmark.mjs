// Run only against freshly built disposable candidate assets. Original pinned workload is preserved.
// Reuse the exact pinned controller; adapt saved configuration and viewport choice only.
import { createHash } from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { access, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const taskRoot = resolve(repositoryRoot, '.superpowers/sdd/2026-10-10-browser-desktop-output-layouts');
const evidenceRoot = resolve(repositoryRoot, 'docs/verification/browser-desktop-output-layouts/baseline');
if (process.cwd() !== repositoryRoot) throw new Error('Run from the Windows repository root.');
const values = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!['--mode', '--output'].includes(name) || value === undefined || values.has(name)) {
    throw new Error('Usage: candidate-measure.mjs --mode comparable|compact --output <new ignored performance/runs directory>');
  }
  values.set(name, value);
}
const mode = values.get('--mode');
const requestedOutput = values.get('--output');
if (!['comparable', 'compact'].includes(mode) || requestedOutput === undefined) {
  throw new Error('Specify both --mode comparable|compact and --output.');
}
const output = resolve(requestedOutput);
const runsRoot = resolve(taskRoot, 'performance', 'runs');
const withinRuns = relative(runsRoot, output);
if (withinRuns === '' || withinRuns === '..' || withinRuns.startsWith(`..${sep}`) || resolve(runsRoot, withinRuns) !== output) {
  throw new Error('Output must be a new child directory of this ignored performance/runs directory.');
}
try { await access(output); throw new Error('Output already exists; do not overwrite or automatically replay a measurement.'); }
catch (error) { if (error?.code !== 'ENOENT') throw error; }

const digest = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const controllerBytes = await readFile(resolve(repositoryRoot, 'scripts/browser-desktop-output-benchmark-controller.mjs'));
const fixtureBytes = await readFile(resolve(evidenceRoot, 'saved-configs.json'));
const metricsBytes = await readFile(resolve(evidenceRoot, 'metrics.json'));
const expected = {
  controller: '869204716D1885B2BAD80827D47A3F7F1CAA2584E5227A4010969B0704338881',
  fixtures: '80F818BAFE25C146286F0C053FCB184F33267822C82AAE26C73175128FF70F77',
  metrics: '11B6775F290BF848F0021158FDB80E8FB44D2310873F1D79A1049A7D67961278'
};
if (digest(controllerBytes) !== expected.controller || digest(fixtureBytes) !== expected.fixtures || digest(metricsBytes) !== expected.metrics) {
  throw new Error('Pinned controller/fixture/metrics hash changed. Do not replace the authoritative baseline.');
}
const baseline = JSON.parse(metricsBytes.toString('utf8'));
const observedEnvironment = { node: process.version, os: `${platform()} ${release()}`, cpu: cpus()[0]?.model,
  logicalCpus: cpus().length, physicalMemoryBytes: totalmem() };
const environmentMismatches = Object.entries(observedEnvironment).filter(([key, value]) => baseline.environment[key] !== value).map(([key]) => key);
if (environmentMismatches.length > 0) throw new Error(`Baseline environment differs: ${environmentMismatches.join(', ')}. Record/reconcile the environment before comparing.`);

const moduleAt = path => import(pathToFileURL(resolve(repositoryRoot, path)).href);
const { upgradeTimersConfig } = await moduleAt('packages/core/dist/timers/config-upgrade.js');
const { upgradeVideosLayout, upgradeVideosRewardMappings } = await moduleAt('packages/core/dist/videos/config-upgrade.js');
const { currentVideosModuleConfigSchema } = await moduleAt('packages/core/dist/videos/schemas.js');
const { musicModuleConfigSchema } = await moduleAt('packages/core/dist/music/schemas.js');
const { moduleOutputCanvas } = await moduleAt('packages/core/dist/overlay-modules/output-canvas.js');
const saved = JSON.parse(fixtureBytes.toString('utf8'));
let timers;
try { timers = upgradeTimersConfig(saved.timers); }
catch (cause) {
  throw new Error('Pinned legacy Timer fixture did not upgrade. Preserve its height280/capacity12 fractional cards; fix exact legacy compatibility before measuring. No service/browser/output directory started.', { cause });
}
const fixtures = { music: musicModuleConfigSchema.parse(saved.music), timers,
  videos: currentVideosModuleConfigSchema.parse({ ...saved.videos, rewardMappings: upgradeVideosRewardMappings(saved.videos.rewardMappings), layout: upgradeVideosLayout(saved.videos.layout) }) };
const baselineOutputs = [['timers', 'landscape', 1920, 1080], ['timers', 'vertical', 1080, 1920], ['music', 'landscape', 1920, 1080]];
const outputs = baselineOutputs.map(([moduleId, profile, width, height]) => {
  if (mode === 'comparable') return [moduleId, profile, width, height];
  const canvas = moduleOutputCanvas({ moduleId, enabled: true, config: fixtures[moduleId], updatedAt: '2026-10-10T00:00:00.000Z' }, profile, 'browser', 0);
  return [moduleId, profile, canvas.width, canvas.height];
});

let adaptedController = controllerBytes.toString('utf8');
function replaceOnce(before, after) {
  if (!adaptedController.includes(before) || adaptedController.indexOf(before) !== adaptedController.lastIndexOf(before)) {
    throw new Error('Pinned controller adaptation anchor changed. Inspect it; do not guess or silently alter workload.');
  }
  adaptedController = adaptedController.replace(before, after);
}
// A data-URL module cannot resolve bare package imports; retain the same installed package.
replaceOnce("import { chromium } from '@playwright/test';", `import { chromium } from ${JSON.stringify(import.meta.resolve('@playwright/test'))};`);
const configStart = "  const musicConfig = await request('/overlay-modules/music/config');";
const configEnd = "  await writeFile(join(output, 'saved-configs.json'), JSON.stringify({ timers: timerConfig.config, music: musicConfig.config, videos: videoConfig.config }, null, 2));";
const start = adaptedController.indexOf(configStart);
const end = adaptedController.indexOf(configEnd, start);
if (start < 0 || end < 0) throw new Error('Pinned configuration intake block changed.');
replaceOnce(adaptedController.slice(start, end + configEnd.length), [
  `  const musicConfig = { config: ${JSON.stringify(fixtures.music)} };`,
  `  const timerConfig = { config: ${JSON.stringify(fixtures.timers)} };`,
  `  const videoConfig = { config: ${JSON.stringify(fixtures.videos)} };`,
  "  await request('/overlay-modules/music/config', 'PUT', { enabled: true, config: musicConfig.config });",
  "  await request('/overlay-modules/timers/config', 'PUT', { enabled: true, config: timerConfig.config });",
  "  await request('/overlay-modules/videos/config', 'PUT', { enabled: true, config: videoConfig.config });",
  configEnd
].join('\n'));
replaceOnce("[['timers', 'landscape', 1920, 1080], ['timers', 'vertical', 1080, 1920], ['music', 'landscape', 1920, 1080]]", JSON.stringify(outputs));
replaceOnce("outputs: ['timers landscape 1920x1080', 'timers vertical 1080x1920', 'music landscape 1920x1080']",
  `outputs: ${JSON.stringify(outputs.map(([moduleId, profile, width, height]) => `${moduleId} ${profile} ${width}x${height}`))}`);
replaceOnce('  result.environment.browser = browser.version();',
  `  result.environment.browser = browser.version();\n  if (result.environment.browser !== ${JSON.stringify(baseline.environment.browser)}) throw new Error('Chromium version differs from pinned baseline; measurement aborted.');`);

// Additional candidate acceptance runs after all pinned samples, so it cannot alter their load.
replaceOnce('  console.log(JSON.stringify({ output, phases:', String.raw`
  const manualLatencies = [], subscribedLatencies = [], mixedStatuses = [];
  const db = runtime.composition.database.connection;
  const journalBefore = Number(db.prepare('SELECT COUNT(*) n FROM event_bus_journal').get().n);
  const mixedInput = { type: 'cheer', providerId: 'twitch', sourcePlatform: 'twitch', ingestProvider: 'twitch', actor: { id: 'candidate-viewer', displayName: 'Synthetic candidate' }, message: null, amount: 100, metadata: {} };
  for (let i = 0; i < 12; i++) {
    let at = performance.now();
    const manual = await request('/management/events/manual', 'POST', { action: { kind: 'simulate-canonical', event: mixedInput } });
    manualLatencies.push(performance.now() - at);
    if (manual.consumers.length !== 4) throw new Error('Missing candidate consumer outcome');
    const subscribed = { ...mixedInput, id: 'candidate-mixed-' + i, occurredAt: new Date().toISOString() };
    at = performance.now(); mixedStatuses.push((await runtime.composition.eventIngestionService.ingestNormalizedEvent(subscribed)).status);
    subscribedLatencies.push(performance.now() - at);
    mixedStatuses.push((await runtime.composition.eventIngestionService.ingestNormalizedEvent(subscribed)).status);
  }
  const journalAfter = Number(db.prepare('SELECT COUNT(*) n FROM event_bus_journal').get().n);
  if (journalAfter - journalBefore !== 24) throw new Error('Mixed candidate sequence duplicated or lost admission');
  const manualRows = db.prepare("SELECT source_registration_id,correlation_key FROM event_bus_journal WHERE source_kind='manual' ORDER BY sequence DESC LIMIT 12").all();
  if (manualRows.some(row => row.source_registration_id !== null || row.correlation_key !== null)) throw new Error('Manual provenance escaped its boundary');
  const timerPage = pages[0];
  await timerPage.page.evaluate(() => {
    const target = document.querySelector('.timer-stack__value');
    if (!target) throw new Error('Running Timer clock missing');
    window.__candidateClockTimes = [];
    window.__candidateClockObserver = new MutationObserver(() => window.__candidateClockTimes.push(performance.now()));
    window.__candidateClockObserver.observe(target, { subtree: true, characterData: true, childList: true });
  });
  const messageStart = timerPage.messages.length;
  await delay(8000);
  const clock = await timerPage.page.evaluate(() => {
    window.__candidateClockObserver.disconnect();
    const times = window.__candidateClockTimes;
    return { changes: times.length, intervalsMs: times.slice(1).map((time, index) => time - times[index]) };
  });
  if (clock.changes < 6 || clock.changes > 10) throw new Error('Real scheduler formatted Timer cadence drifted');
  result.candidateAcceptance = { manualHttpLatenciesMs: manualLatencies, subscribedInProcessLatenciesMs: subscribedLatencies, subscribedStatuses: mixedStatuses,
    journalDelta: journalAfter - journalBefore, manualSourceRegistrationAndCorrelationNull: true,
    queueItems: Number(db.prepare('SELECT COUNT(*) n FROM video_requests').get().n), videoReceipts: Number(db.prepare('SELECT COUNT(*) n FROM video_bus_admissions').get().n),
    timerFormattedClock: clock, timerMessagesDuringClockObservation: timerPage.messages.length - messageStart,
    limitations: ['Additional post-recipe candidate probe; no comparable old manual HTTP metric exists.', 'Formatted second changes observe the real scheduler; the 250ms render interval is verified by source/owning tests, not inferred from second text.', 'Short bounded load is complemented by journal/receipt retention unit tests; it is not a long-duration retention benchmark.'] };
  await writeFile(join(output, 'metrics.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ output, phases:`);

// The original controller uses argv[2] for output and owns all runtime/browser/temp cleanup.
process.argv[2] = output;
const adapterManifest = { mode, pinnedBaselineSource: baseline.environment.sourceHead, inputHashes: expected,
  adaptedControllerSha256: digest(adaptedController), outputs, scheduler: 'unaltered real startLocalRuntime scheduler',
  changes: ['saved Music config validation', 'pure Timer v2 upgrade preserving saved capacity/geometry', 'pure Video layout upgrade; empty saved mappings unchanged',
    mode === 'comparable' ? 'original three full-size viewports retained' : 'same three recipients at current content dimensions', 'explicit pinned environment/browser checks'],
  unchangedLoad: baseline.recipe, limits: baseline.limitations,
  note: 'Shared pinned sampling/workload unchanged. Extra mixed admission and formatted clock acceptance runs afterward. Adapter allocations remain in service+controller RSS; no browser-process/native/GPU/video-decoding measurement added. Raw source diff recording removed during sanitized promotion.' };
await import(`data:text/javascript;base64,${Buffer.from(adaptedController).toString('base64')}`);
const metrics = JSON.parse(await readFile(resolve(output, 'metrics.json'), 'utf8'));
metrics.recipe.comparisonMode = mode;
metrics.recipe.fixtureSource = 'pinned-run/saved-configs.json through production Timer/Video upgraders';
metrics.limitations.push('Adapter allocations are included in service+controller RSS; native/OBS/GPU/decoded-video baseline metrics do not exist.');
await writeFile(resolve(output, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);
await writeFile(resolve(output, 'adapter-manifest.json'), `${JSON.stringify(adapterManifest, null, 2)}\n`);
