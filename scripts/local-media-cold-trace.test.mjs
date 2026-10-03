import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import * as traceModule from './local-media-cold-trace.mjs';
import { assessTrace, traceWindowStart, captureDiagnostic } from './local-media-cold-trace.mjs';

const manifest = { fixtures: [{ id: 'one', path: 'C:\\own\\one.mp4' }], windows: [
  { id: 'control', fixtureId: 'one', kind: 'positive-control' },
  { id: 'first', fixtureId: 'one', kind: 'measurement', pass: 'cache-purge-requested' },
  { id: 'warm', fixtureId: 'one', kind: 'measurement', pass: 'warm-repeat' }
] };
const summary = () => ({ schemaVersion: 1, status: 'observed', lostEvents: 0, lostBuffers: 0, unmappedDiskReads: 0, windows: [
  { ...manifest.windows[0], status: 'observed', fileReadCount: 1 },
  { ...manifest.windows[1], status: 'observed', diskReadCount: 1, diskReadBytes: 4096 },
  { ...manifest.windows[2], status: 'observed', diskReadCount: 1, diskReadBytes: 4096 }
] });
test('owned stop allows the observed completed cleanup interval within a bounded deadline', () => {
  assert.equal(traceModule.traceStopTimeoutMs, 45000);
});

function captureFixture({ stopDelayMs = 40, reason = 'stop', complete = true, stopCompletion } = {}) {
  const child = Object.assign(new EventEmitter(), { pid: 12345, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
  let sessionName, input = '', stopping;
  let notifyStopStarted;
  const stopStarted = new Promise(resolve => { notifyStopStarted = resolve; });
  const emit = value => child.stdout.write(`${JSON.stringify({ schemaVersion: 1, sessionName, ...value })}\n`);
  child.stdin.on('data', bytes => { input += bytes; });
  child.stdin.on('finish', () => {
    emit({ status: 'stop-started', stopStartedUtc: new Date().toISOString() });
    notifyStopStarted();
    if (complete) stopping = (stopCompletion ?? delay(stopDelayMs)).then(() => {
      emit({ status: 'stopped', reason, endedUtc: new Date().toISOString(), stopElapsedMs: stopDelayMs });
      child.emit('close', 0);
    });
  });
  return {
    spawnCapture(_command, args) {
      sessionName = args[args.indexOf('--session') + 1];
      process.nextTick(() => emit({ status: 'ready', startedUtc: new Date().toISOString() }));
      return child;
    },
    get input() { return input; },
    stopStarted,
    get stopping() { return stopping; }
  };
}

test('initial stop awaits delayed native completion, then analyzes the already saved manifest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stream-jams-trace-test-'));
  let releaseStop;
  const stopCompletion = new Promise(resolve => { releaseStop = resolve; });
  const capture = captureFixture({ stopCompletion });
  let analyzed = false;
  const probe = traceModule.createTraceProbe(directory, [], async (_command, args) => {
    const saved = JSON.parse(await readFile(args[args.indexOf('--manifest') + 1], 'utf8'));
    assert.deepEqual(saved, { schemaVersion: 1, fixtures: [], windows: [] });
    assert.ok(probe.ownership.lifecycle.helperClosedUtc);
    analyzed = true;
    await writeFile(args[args.indexOf('--output') + 1], JSON.stringify({ ...summary(), windows: [] }));
  }, undefined, { spawnCapture: capture.spawnCapture, stopTimeoutMs: 200 });
  try {
    await probe.start();
    const finishing = probe.finish();
    // finish() saves the manifest before sending stop. Wait for that boundary,
    // not a guessed filesystem delay, and hold native completion explicitly.
    await capture.stopStarted;
    assert.equal(analyzed, false);
    assert.ok(await readFile(probe.ownership.manifestPath, 'utf8'));
    await delay(40);
    releaseStop();
    const result = await finishing;
    assert.equal(result.status, 'verified-file-read-mapping');
    assert.equal(analyzed, true);
    assert.equal(capture.input, 'stop\n');
    assert.equal(result.traceOwnership.helperPid, 12345);
    assert.equal(result.traceOwnership.lifecycle.helperStopElapsedMs, 40);
    assert.ok(result.traceOwnership.lifecycle.stopWaitElapsedMs >= 40);
    await probe.stop();
    assert.equal(capture.input, 'stop\n');
  } finally { releaseStop(); await capture.stopping; await rm(directory, { recursive: true, force: true }); }
});

test('unresolved stop fails closed while retaining the manifest, PID and lifecycle', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stream-jams-trace-test-'));
  const capture = captureFixture({ complete: false });
  const probe = traceModule.createTraceProbe(directory, [], () => assert.fail('must not analyze unresolved trace'), undefined, { spawnCapture: capture.spawnCapture, stopTimeoutMs: 10 });
  try {
    await probe.start();
    await assert.rejects(probe.finish(), /cleanup deadline exceeded/);
    const owned = probe.ownership;
    assert.equal(owned.helperPid, 12345);
    assert.ok(owned.lifecycle.helperStopStartedUtc);
    assert.equal(owned.lifecycle.helperClosedUtc, undefined);
    assert.equal(JSON.parse(await readFile(owned.manifestPath, 'utf8')).schemaVersion, 1);
    await assert.rejects(probe.stop(), /cleanup deadline exceeded/);
    assert.equal(capture.input, 'stop\n');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('completed helper with watchdog reason cannot authorize analysis', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stream-jams-trace-test-'));
  const capture = captureFixture({ stopDelayMs: 1, reason: 'watchdog' });
  const probe = traceModule.createTraceProbe(directory, [], () => assert.fail('must not analyze watchdog trace'), undefined, { spawnCapture: capture.spawnCapture, stopTimeoutMs: 200 });
  try {
    await probe.start();
    await assert.rejects(probe.finish(), /ended unexpectedly/);
    assert.equal(probe.ownership.helperPid, 12345);
  } finally { await capture.stopping; await rm(directory, { recursive: true, force: true }); }
});
test('first pass requires disk bytes but warm reads may be nonzero', () => {
  assert.equal(assessTrace(manifest, summary()).status, 'observed-storage-read');
  const missing = summary(); missing.windows[1].diskReadBytes = 0;
  assert.equal(assessTrace(manifest, missing).status, 'inconclusive');
});
test('a nonpurging positive control proves file mapping without claiming storage reads', () => {
  const controls = { ...manifest, windows: manifest.windows.slice(0, 1) };
  const observation = { ...summary(), windows: summary().windows.slice(0, 1) };
  assert.equal(assessTrace(controls, observation).status, 'verified-file-read-mapping');
});
test('loss, missing exact fixture mapping, duplicate windows and omitted windows fail closed', () => {
  for (const mutate of [s => { s.lostEvents = 1; }, s => { delete s.lostEvents; }, s => { s.lostBuffers = 1; }, s => { delete s.lostBuffers; }, s => { s.unmappedDiskReads = 1; }, s => { s.windows[0].fileReadCount = 0; }, s => { s.windows[1].fixtureId = 'other'; }, s => { s.windows.push(s.windows[0]); }, s => { s.windows.pop(); }]) {
    const altered = summary(); mutate(altered);
    assert.equal(assessTrace(manifest, altered).status, 'inconclusive');
  }
});

test('capture windows are strictly separated from microsecond readiness and preceding completion', async () => {
  const readiness = new Date().toISOString().replace('Z', '9999Z');
  const first = await traceWindowStart(readiness);
  assert.ok(Date.parse(first) > Date.parse(readiness));
  const second = await traceWindowStart(first);
  assert.ok(Date.parse(second) > Date.parse(first));
  await assert.rejects(traceWindowStart('not-utc'), /Invalid trace window boundary/);
});
test('capture diagnostics preserve only structured error types and numeric native codes', () => {
  assert.deepEqual(captureDiagnostic('{"schemaVersion":1,"status":"error","errorType":"Win32Exception","nativeErrorCode":5,"message":"C:\\\\private\\\\path"}\n'), { errorType: 'Win32Exception', nativeErrorCode: 5 });
  for (const data of ['raw C:\\private\\path', '{"schemaVersion":2,"status":"error","errorType":"Win32Exception"}', '{"schemaVersion":1,"status":"error","errorType":"C:\\\\private\\\\path","nativeErrorCode":"C:/private"}']) assert.equal(captureDiagnostic(data), undefined);
});
