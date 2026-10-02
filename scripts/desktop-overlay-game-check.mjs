/* global process, fetch, AbortSignal, setTimeout, clearTimeout */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { performance } from 'node:perf_hooks';

export function parseArgs(args) {
  const options = { baseUrl: 'http://127.0.0.1:39187', timeoutMs: 30000, trigger: false };
  const keys = { '--base-url': 'baseUrl', '--timeout-ms': 'timeoutMs', '--effect-id': 'effectId', '--variant-id': 'variantId', '--overlay-pid': 'overlayPid' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--trigger') { options.trigger = true; continue; }
    if (!keys[arg] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Invalid arguments');
    options[keys[arg]] = args[++i];
  }
  const url = new URL(options.baseUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('A literal loopback HTTP origin is required');
  options.baseUrl = url.origin;
  options.timeoutMs = Number(options.timeoutMs);
  if (options.overlayPid !== undefined) {
    options.overlayPid = Number(options.overlayPid);
    if (!Number.isSafeInteger(options.overlayPid) || options.overlayPid <= 0) throw new Error('Invalid overlay PID');
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 300000) throw new Error('Timeout must be 1000–300000 ms');
  for (const key of ['effectId', 'variantId']) if (options[key] !== undefined && !/^[A-Za-z0-9_-]{1,256}$/.test(options[key])) throw new Error('Invalid saved identifier');
  if (options.trigger !== Boolean(options.effectId && options.variantId) || (!options.trigger && (options.effectId || options.variantId))) throw new Error('Playback requires --trigger --effect-id --variant-id');
  return options;
}

export function parseSample(line) {
  const value = JSON.parse(line);
  if (value.kind !== 'sample' || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0 || !Array.isArray(value.games) || !Array.isArray(value.overlays) || !Number.isSafeInteger(value.foreground)) throw new Error('Invalid observer sample');
  function window(row) {
    if (!Number.isSafeInteger(row.hwnd) || row.hwnd <= 0 || !Number.isSafeInteger(row.pid) || row.pid <= 0 || !Number.isInteger(row.rank) || row.rank < 0 || typeof row.visible !== 'boolean' || row.live !== true || !Number.isSafeInteger(row.exStyle) || !Array.isArray(row.bounds) || row.bounds.length !== 4 || !row.bounds.every(Number.isFinite)) throw new Error('Invalid native identity');
    if (row.executable !== undefined && !['Control_DX11', 'Control_DX12', 'electron', 'Stream Jams', 'stream-jams'].includes(row.executable)) throw new Error('Invalid executable');
    return { hwnd: row.hwnd, pid: row.pid, rank: row.rank, visible: row.visible, live: true, exStyle: row.exStyle, bounds: row.bounds, ...(row.executable ? { executable: row.executable } : {}) };
  }
  return { kind: 'sample', elapsedMs: value.elapsedMs, foreground: value.foreground, games: value.games.map(window), overlays: value.overlays.map(window) };
}
export function focusedGame(sample) { return sample.games.find(row => row.visible && row.live && row.hwnd === sample.foreground); }
export function orderEvidence(samples) {
  if (samples.some(sample => sample.overlays.some(row => row.hwnd === sample.foreground))) return { status: 'fail', reason: 'Selected overlay became foreground' };
  const focused = samples.filter(focusedGame);
  if (!focused.length) return { status: 'incomplete', reason: 'No focused live Control window observed' };
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  const pass = focused.every(sample => sample.overlays.length === 1 && sample.overlays.some(row => row.visible && row.live && row.rank < focusedGame(sample).rank && overlap(row.bounds, focusedGame(sample).bounds) && (row.exStyle & 0x08000020) === 0x08000020));
  return { status: pass ? 'pass' : 'fail', focusedSamples: focused.length, scope: 'Native order and styles only; physical pixels, audio and input remain unconfirmed' };
}
export function playbackEvidence(trigger, triggered, observations) {
  if (!trigger) return { status: 'not-requested' };
  if (observations.some(row => ['failed', 'cancelled'].includes(row.status))) return { status: 'failed', reason: 'Triggered occurrence failed' };
  if (triggered && observations.some(row => ['playing', 'completed'].includes(row.status))) return { status: 'pass', scope: 'Playback bookkeeping only; physical delivery unconfirmed' };
  return { status: 'incomplete', reason: 'Triggered occurrence was not observed playing or completed' };
}
export async function run(options, dependencies = {}) {
  const fetcher = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => performance.now());
  const start = now();
  const samples = [], playback = [];
  let session, occurrenceId, observer, observerClosed, aborted = false, cleanup = 'not-needed';
  let lastPlaybackPoll = -Infinity;
  let observerStarted, triggerAfterSampleMs = Infinity;
  let expectedTermination, observerTerminal;
  const cancel = () => { aborted = true; expectedTermination = 'cancelled'; observer?.kill(); };
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  async function request(path, method = 'GET', body, cleanupRequest = false) {
    const remaining = cleanupRequest ? 3000 : Math.ceil(Math.min(3000, options.timeoutMs - (now() - start)));
    if (remaining <= 0 || (aborted && !cleanupRequest)) throw new Error('deadline');
    const headers = { ...(session ? { Authorization: `Bearer ${session.id}` } : {}), ...(method !== 'GET' ? { 'content-type': 'application/json', ...(session ? { 'x-stream-jams-csrf': session.csrfToken } : {}) } : {}) };
    const response = await fetcher(options.baseUrl + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(remaining), redirect: 'error' });
    if (!response.ok) throw new Error('request-failed');
    return response.json();
  }
  let failure;
  let timer;
  async function reap() {
    if (!observerClosed) return;
    let reapTimer;
    const reaped = await Promise.race([observerClosed.then(() => true), new Promise(resolve => { reapTimer = setTimeout(() => resolve(false), 2000); })]);
    clearTimeout(reapTimer);
    if (!reaped) failure = 'Owned observer did not exit after cancellation';
  }
  try {
    await request('/health');
    observerStarted = now();
    observer = (dependencies.spawn ?? spawn)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./desktop-overlay-game-observer.ps1', import.meta.url)), '-TimeoutMs', String(options.timeoutMs)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    observerClosed = new Promise(resolve => {
      observer.once('close', (code, signal) => {
        observerTerminal = { code, signal: signal ?? null, reason: expectedTermination ?? 'observer-exit', elapsedMs: now() - start };
        resolve();
      });
      observer.once('error', () => { failure = 'observer-unavailable'; resolve(); });
    });
    observer.stderr.resume(); // Never forward native errors or unrelated process metadata.
    timer = setTimeout(() => { expectedTermination = 'deadline'; observer.kill(); }, Math.max(1, options.timeoutMs - (now() - start)));
    const lines = createInterface({ input: observer.stdout });
    for await (const line of lines) {
      if (aborted || now() - start >= options.timeoutMs) { expectedTermination ??= 'deadline'; break; }
      const sample = parseSample(line);
      if (options.overlayPid) sample.overlays = sample.overlays.filter(row => row.pid === options.overlayPid);
      if (samples.length && sample.elapsedMs < samples.at(-1).elapsedMs) throw new Error('non-monotonic-observer');
      samples.push(sample);
      if (options.trigger && !session && focusedGame(sample) && sample.overlays.length === 1) {
        session = await request('/auth/management/sessions', 'POST', {});
        if (typeof session.id !== 'string' || typeof session.csrfToken !== 'string') throw new Error('invalid-session');
        // Observer stopwatch starts after process launch/interop compilation. This
        // conservative launch-relative threshold excludes samples taken before auth.
        triggerAfterSampleMs = now() - observerStarted;
        continue; // Recheck game focus in a fresh native sample after authentication.
      }
      if (options.trigger && session && !occurrenceId && sample.elapsedMs >= triggerAfterSampleMs && focusedGame(sample) && sample.overlays.length === 1) {
        const result = await request(`/screen-effects/${encodeURIComponent(options.effectId)}/test`, 'POST', { variantId: options.variantId, confirmLiveImpact: true });
        if (result.status !== 'queued' || typeof result.occurrenceId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(result.occurrenceId)) throw new Error('invalid-trigger-result');
        occurrenceId = result.occurrenceId;
      }
      if (occurrenceId && now() - lastPlaybackPoll >= 1000) {
        lastPlaybackPoll = now();
        const snapshot = await request('/playback/operations');
        const rows = [...snapshot.current, ...snapshot.queued, ...snapshot.recent];
        const row = rows.find(row => row.moduleId === 'screen-effects' && row.occurrenceId === occurrenceId);
        playback.push({ elapsedMs: now() - start, status: row?.status ?? 'not-observed' });
      }
    }
    observer.kill(); await reap();
  } catch { failure = 'Check interrupted, timed out, or failed; credentials and server details withheld'; }
  finally {
    clearTimeout(timer); observer?.kill();
    await reap();
    if (occurrenceId) {
      try {
        const snapshot = await request('/playback/operations', 'GET', undefined, true);
        const matches = row => row.moduleId === 'screen-effects' && row.occurrenceId === occurrenceId;
        const action = snapshot.current.some(matches) ? 'skip' : snapshot.queued.some(matches) ? 'remove' : undefined;
        if (action) await request(`/playback/operations/screen-effects/${encodeURIComponent(occurrenceId)}/${action}`, 'POST', {}, true);
        cleanup = action ?? 'already-terminal';
      } catch { cleanup = 'failed: only the triggered occurrence may still need manual stopping'; }
    }
    session = undefined;
    process.off('SIGINT', cancel); process.off('SIGTERM', cancel);
  }
  if (aborted) failure = 'Check explicitly cancelled';
  else if (observerTerminal && observerTerminal.reason !== 'deadline' && (observerTerminal.code !== 0 || observerTerminal.elapsedMs < options.timeoutMs)) failure ??= 'Observer failed or exited before the requested observation deadline';
  const playbackOutcome = playbackEvidence(options.trigger, Boolean(occurrenceId), playback);
  if (options.trigger && playbackOutcome.status !== 'pass') failure ??= `Playback ${playbackOutcome.status}: selected playback was not observed successfully`;
  return { mode: options.trigger ? 'trigger' : 'observe-only', durationMs: now() - start, ...(failure ? { failure } : {}), ...(observerTerminal ? { observerTerminal } : {}), ordering: orderEvidence(samples), triggered: Boolean(occurrenceId), playbackOutcome, playback, cleanup, samples };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = await run(parseArgs(process.argv.slice(2))); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.failure || result.ordering.status !== 'pass' || result.cleanup.startsWith('failed') ? 1 : 0; }
  catch { console.error('Invalid arguments or check failure. No credentials are printed.'); process.exitCode = 1; }
}
