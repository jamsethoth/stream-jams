/* global setTimeout, clearTimeout */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';

export const traceHelper = resolve('scripts/local-media-etw/bin/Release/net10.0-windows/LocalMediaEtw.dll');
// The retained 2026-10-01 trace completed during a second 15-second wait.
// Give the initial blocking native stop 45 seconds; unresolved stops still fail.
export const traceStopTimeoutMs = 45000;

export function captureDiagnostic(stdout) {
  for (const line of stdout.trim().split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line);
      if (value.schemaVersion === 1 && value.status === 'error' && typeof value.errorType === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,80}$/.test(value.errorType) &&
          (value.nativeErrorCode === null || Number.isSafeInteger(value.nativeErrorCode))) return { errorType: value.errorType, nativeErrorCode: value.nativeErrorCode };
    } catch { /* Raw output is never returned as diagnostic evidence. */ }
  }
  return undefined;
}

export async function traceWindowStart(afterUtc, signal) {
  const boundary = Date.parse(afterUtc);
  if (!Number.isFinite(boundary)) throw new Error('Invalid trace window boundary');
  // .NET readiness may contain submillisecond precision. Requiring a later
  // whole millisecond also places the JavaScript boundary after those digits.
  for (let attempt = 0; attempt < 100; attempt++) {
    signal?.throwIfAborted();
    const now = Date.now();
    if (now > boundary) return new Date(now).toISOString();
    await delay(1, undefined, { signal });
  }
  throw new Error('UTC clock did not advance beyond the preceding trace window');
}

export function assessTrace(manifest, summary) {
  const failures = [];
  if (summary.schemaVersion !== 1 || summary.status !== 'observed' || summary.lostEvents !== 0 || summary.lostBuffers !== 0 || summary.unmappedDiskReads !== 0) failures.push('Trace is incomplete, lost events or ambiguous reads');
  if (!Array.isArray(summary.windows) || summary.windows.length !== manifest.windows.length) failures.push('Missing or duplicate windows');
  const windows = manifest.windows.map(window => {
    const matches = (summary.windows ?? []).filter(candidate => candidate.id === window.id && candidate.fixtureId === window.fixtureId && candidate.kind === window.kind);
    const evidence = matches[0];
    if (matches.length !== 1 || evidence?.status !== 'observed') failures.push(`Exact-file mapping missing: ${window.id}`);
    if (window.kind === 'positive-control' && !(evidence?.fileReadCount > 0)) failures.push(`Positive control missing: ${window.fixtureId}`);
    if (window.pass === 'cache-purge-requested' && !(evidence?.diskReadCount > 0 && evidence?.diskReadBytes > 0)) failures.push(`No observed storage read: ${window.fixtureId}`);
    return { ...window, evidence };
  });
  return { status: failures.length ? 'inconclusive' : manifest.windows.some(window => window.pass === 'cache-purge-requested') ? 'observed-storage-read' : 'verified-file-read-mapping', lostEvents: summary.lostEvents, failures, windows };
}

function identity(info) { return { dev: info.dev, ino: info.ino, size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs }; }
export function createTraceProbe(directory, fixtures, runChild, signal, { spawnCapture = spawn, stopTimeoutMs = traceStopTimeoutMs } = {}) {
  let child, helperPid, closed, manifest, manifestPath, tracePath, sessionName, readyUtc, diagnostic, stopped = false, childError, stopRequestedAt, final;
  const lifecycle = { stopDeadlineMs: stopTimeoutMs };
  const dotnet = 'dotnet';
  return {
    get ownership() { return { sessionName, tracePath, manifestPath, helperPid, watchdogSeconds: 120, lifecycle: { ...lifecycle }, ...(diagnostic ? { captureDiagnostic: diagnostic } : {}) }; },
    async start() {
      signal?.throwIfAborted();
      sessionName = `StreamJamsMedia-${randomUUID()}`;
      tracePath = join(directory, `${sessionName}.etl`);
      manifest = { schemaVersion: 1, fixtures: fixtures.map(({ id, path }) => ({ id, path })), windows: [] };
      child = spawnCapture(dotnet, [traceHelper, 'capture', '--session', sessionName, '--output', tracePath, '--timeout-seconds', '120'], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      helperPid = child.pid;
      let stdout = '', readyTimer;
      const cancelled = new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason ?? new Error('Trace cancelled')), { once: true });
      });
      closed = new Promise((accept, reject) => {
        child.once('error', error => { childError = error; });
        child.stderr.on('data', () => {});
        child.once('close', code => {
          lifecycle.helperClosedUtc = new Date().toISOString();
          diagnostic = captureDiagnostic(stdout);
          if (childError) reject(childError);
          else if (code === 0) accept(stdout);
          else {
            const error = new Error(`Owned ETW capture failed (${code})${diagnostic ? `: ${diagnostic.errorType}; nativeErrorCode=${diagnostic.nativeErrorCode}` : ''}; evidence retained`);
            error.captureDiagnostic = diagnostic; reject(error);
          }
        });
      });
      closed.catch(() => {});
      try {
        await Promise.race([new Promise((accept, reject) => {
          child.stdout.on('data', bytes => {
            stdout = (stdout + bytes).slice(-65536);
            for (const line of stdout.split(/\r?\n/).slice(0, -1)) {
              try {
                const value = JSON.parse(line);
                if (value.schemaVersion !== 1 || value.sessionName !== sessionName) continue;
                if (value.status === 'ready' && Number.isFinite(Date.parse(value.startedUtc))) { readyUtc = value.startedUtc; lifecycle.readyUtc = readyUtc; accept(value); }
                if (value.status === 'stop-started' && Number.isFinite(Date.parse(value.stopStartedUtc))) lifecycle.helperStopStartedUtc = value.stopStartedUtc;
                if (value.status === 'stopped' && Number.isFinite(Date.parse(value.endedUtc))) {
                  final = value; lifecycle.helperStopEndedUtc = value.endedUtc;
                  if (typeof value.stopElapsedMs === 'number' && Number.isFinite(value.stopElapsedMs) && value.stopElapsedMs >= 0) lifecycle.helperStopElapsedMs = value.stopElapsedMs;
                }
              } catch { /* Wait for a complete JSON line. */ }
            }
          });
          readyTimer = setTimeout(() => reject(new Error('ETW readiness deadline exceeded')), 15000);
        }), closed.then(() => { throw new Error('ETW capture ended before ready'); }), cancelled]);
      } finally { clearTimeout(readyTimer); }
    },
    async control() {
      for (const fixture of fixtures) {
        signal?.throwIfAborted();
        const startUtc = await traceWindowStart(manifest.windows.at(-1)?.endUtc ?? readyUtc, signal);
        for await (const chunk of createReadStream(fixture.path)) { void chunk; signal?.throwIfAborted(); }
        if (Date.now() <= Date.parse(startUtc)) await delay(1, undefined, { signal });
        manifest.windows.push({ id: `control-${fixture.id}`, fixtureId: fixture.id, kind: 'positive-control', startUtc, endUtc: new Date().toISOString(), processIds: [process.pid] });
      }
    },
    async finish(rows = []) {
      if (stopped) throw new Error('Trace already stopped');
      stopped = true;
      for (const row of rows) for (const measurement of row.measurements) manifest.windows.push({ id: `${row.pass}-${measurement.fixtureId}`, fixtureId: measurement.fixtureId, kind: 'measurement', pass: row.pass, startUtc: measurement.requestedAt, endUtc: measurement.onsetUtc, processIds: row.runtime.pids });
      manifestPath = `${tracePath}.manifest.json`;
      await writeFile(manifestPath, JSON.stringify({ ...manifest, windows: manifest.windows.map(window => {
        const saved = { ...window }; delete saved.pass; return saved;
      }) }), { flag: 'wx' });
      await this.stop();
      for (const fixture of fixtures) if (JSON.stringify(identity(await stat(fixture.path))) !== JSON.stringify(fixture.identity)) throw new Error('Fixture identity changed while tracing');
      const summaryPath = `${tracePath}.summary.json`;
      await runChild(dotnet, [traceHelper, 'analyze', '--trace', tracePath, '--manifest', manifestPath, '--output', summaryPath], { timeoutMs: 30000, sanitizeErrors: true });
      const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
      return { ...assessTrace(manifest, summary), summary, tracePath, manifestPath, summaryPath, traceOwnership: this.ownership };
    },
    async stop() {
      if (!child) return;
      if (stopRequestedAt === undefined) {
        stopRequestedAt = performance.now();
        lifecycle.stopRequestedUtc = new Date().toISOString();
        child.stdin.on('error', () => {});
        if (!child.stdin.destroyed) child.stdin.end('stop\n');
      }
      let timer;
      try {
        await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Owned ETW cleanup deadline exceeded; trace files retained')), stopTimeoutMs); })]);
        if (final?.schemaVersion !== 1 || final.sessionName !== sessionName || final.reason !== 'stop' || !Number.isFinite(Date.parse(final.endedUtc))) throw new Error('ETW ended unexpectedly; trace files retained');
        child = undefined;
      } finally { lifecycle.stopWaitElapsedMs = performance.now() - stopRequestedAt; clearTimeout(timer); }
    }
  };
}
