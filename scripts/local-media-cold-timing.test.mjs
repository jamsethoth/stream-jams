/* global AbortController */
import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL } from 'node:url';
import { runColdTiming, parseOptions, createAdapter, runChild, verifiedRamMapCapabilities } from './local-media-cold-timing.mjs';
import { closeOwnedNative, materializePlayableFixture } from './local-media-cold-native.mjs';

const real = { execute: true, acknowledge: true, pairs: 1 };
function fixture(overrides = {}) {
  const calls = [];
  const adapter = Object.fromEntries(['preflight', 'lock', 'prepare', 'purge', 'verifyTracing', 'startTrace', 'finishTrace', 'measure', 'cleanup', 'retainLock', 'unlock', 'save'].map(name => [name, async (...args) => {
    calls.push([name, ...args]);
    if (name === 'preflight') return { sha256: 'verified' };
    if (name === 'verifyTracing') return { status: 'verified-file-read-mapping' };
    if (name === 'finishTrace') return { status: 'observed-storage-read' };
    if (name === 'measure') return { cleanup: { nativeElements: 0 } };
    return undefined;
  }]));
  return { calls, adapter: { ...adapter, ...overrides } };
}
test('default dry run invokes no adapters or writes', async () => {
  const { adapter, calls } = fixture();
  assert.equal((await runColdTiming({ pairs: 1 }, adapter)).outcome, 'dry-run');
  assert.deepEqual(calls, []);
});
test('strict options bound pairs and require explicit acknowledgement', async () => {
  assert.throws(() => parseOptions(['--pairs', '4']), /pairs/);
  assert.throws(() => parseOptions(['--unknown']), /Unknown/);
  const { adapter, calls } = fixture();
  assert.equal((await runColdTiming({ execute: true, pairs: 1 }, adapter)).outcome, 'blocked');
  assert.deepEqual(calls, []);
});
test('preflight failure cannot acquire lock, prepare fixtures or purge', async () => {
  const { adapter, calls } = fixture({ preflight: async () => { throw new Error('Windows elevated signed tool required'); } });
  assert.equal((await runColdTiming(real, adapter)).outcome, 'blocked');
  assert.deepEqual(calls.map(x => x[0]), []);
});
test('each pair prepares before purge, immediately measures, repeats warm and cleans', async () => {
  const { adapter, calls } = fixture();
  const result = await runColdTiming(real, adapter);
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(calls.map(x => x[0]), ['preflight', 'lock', 'prepare', 'verifyTracing', 'startTrace', 'purge', 'measure', 'measure', 'finishTrace', 'cleanup', 'unlock', 'save']);
  assert.equal(calls[6][1], 'cache-purge-requested');
  assert.equal(calls[7][1], 'warm-repeat');
});
test('purge failure is not retried and owns only fixture cleanup', async () => {
  const { adapter, calls } = fixture({ purge: async () => { calls.push(['purge']); throw new Error('purge failed'); } });
  assert.equal((await runColdTiming(real, adapter)).outcome, 'failed');
  assert.deepEqual(calls.map(x => x[0]), ['preflight', 'lock', 'prepare', 'verifyTracing', 'startTrace', 'purge', 'cleanup', 'unlock', 'save']);
});
test('cancellation after preparation prevents purge and cleans', async () => {
  const controller = new AbortController();
  const { adapter, calls } = fixture({ prepare: async () => { calls.push(['prepare']); controller.abort(); } });
  assert.equal((await runColdTiming({ ...real, signal: controller.signal }, adapter)).outcome, 'cancelled');
  assert.ok(!calls.some(x => x[0] === 'purge'));
  assert.ok(calls.some(x => x[0] === 'cleanup'));
});
test('cleanup failure retains failed outcome even after measurements', async () => {
  const { adapter } = fixture({ cleanup: async () => { throw new Error('reader cleanup failed'); } });
  const result = await runColdTiming(real, adapter);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.cleanup, 'failed');
});

test('unresolved trace ownership retains lock, saves failure and blocks a concurrent second run', async () => {
  let held = false, saved;
  const evidence = { traceOwnership: { sessionName: 'StreamJamsMedia-owned', helperPid: 42 }, retainedFixtureDirectory: 'owned-fixtures' };
  const { adapter, calls } = fixture({
    lock: async () => { if (held) throw new Error('Existing machine lock'); held = true; },
    cleanup: async () => { const error = new Error('Owned trace still active'); error.cleanupEvidence = evidence; throw error; },
    retainLock: async metadata => { calls.push(['retainLock', metadata]); return { status: 'retained', path: 'owned.lock', ...metadata }; },
    save: async value => { saved = value; }
  });
  const first = await runColdTiming(real, adapter);
  assert.equal(first.outcome, 'failed');
  assert.equal(first.cleanup, 'failed');
  assert.equal(first.machineLock.status, 'retained');
  assert.deepEqual(first.machineLock.cleanupEvidence, evidence);
  assert.equal(saved, first);
  assert.ok(!calls.some(call => call[0] === 'unlock'));
  const second = await runColdTiming(real, adapter);
  assert.equal(second.outcome, 'blocked');
  assert.match(second.error, /Existing machine lock/);
});

test('concrete retained lock persists recovery metadata and refuses a second exclusive owner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stream-jams-lock-test-'));
  const lockPath = join(directory, 'machine.lock');
  try {
    const first = createAdapter({ warmOnly: true }, { lockPath });
    const second = createAdapter({ warmOnly: true }, { lockPath });
    await first.lock();
    const record = await first.retainLock({ cleanupEvidence: { traceOwnership: { sessionName: 'StreamJamsMedia-test', helperPid: 42 } }, recovery: 'Confirm the owned session exited.' });
    assert.equal(record.path, lockPath);
    assert.deepEqual(JSON.parse(await readFile(lockPath, 'utf8')), record);
    await assert.rejects(second.lock(), error => error.code === 'EEXIST');
    assert.deepEqual(JSON.parse(await readFile(lockPath, 'utf8')), record);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('exclusive lock failure never releases another run lock or mutates fixtures', async () => {
  const { adapter, calls } = fixture({ lock: async () => { throw new Error('already running'); } });
  assert.equal((await runColdTiming(real, adapter)).outcome, 'blocked');
  assert.deepEqual(calls.map(x => x[0]), ['preflight']);
});
test('nonzero native element counts fail the result and stop warm repeat', async () => {
  const { adapter, calls } = fixture({ measure: async () => ({ cleanup: { nativeElements: 1 } }) });
  const result = await runColdTiming(real, adapter);
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(result.rows, []);
  assert.ok(calls.some(x => x[0] === 'cleanup'));
});
test('concrete preflight gates CI, Windows, hash, signature, elevation, EULA and version without running RAMMap', async () => {
  const metadata = { status: 'Valid', subject: 'CN=Microsoft Corporation, O=Microsoft Corporation, C=US', version: '1.63', elevated: true, eula: 1 };
  const sha256 = Object.keys(verifiedRamMapCapabilities)[0];
  for (const invalid of [{ env: { CI: 'true' } }, { platform: 'linux' }, { hashFile: async () => 'unreviewed' }, ...[
    { status: 'NotSigned' }, { subject: 'O=Other' }, { elevated: false }, { eula: 0 }, { version: '1.64' }
  ].map(change => ({ runChild: async (exe) => JSON.stringify(exe === 'dotnet' ? { schemaVersion: 1, status: 'preflight', library: 'Microsoft.Diagnostics.Tracing.TraceEvent', libraryVersion: '3.2.8', windowsSupported: true, elevated: true, captureSupported: true } : { ...metadata, ...change }) }))]) {
    let calls = 0;
    const adapter = createAdapter({ rammap: 'RAMMap64.exe' }, { platform: 'win32', env: {}, readFile: async () => '', hashFile: async () => sha256,
      runChild: async (exe, args) => { calls++; assert.ok(exe.endsWith('powershell.exe') || exe === 'dotnet'); if (exe !== 'dotnet') assert.ok(args.includes('-NonInteractive')); return args?.[1] === 'preflight' ? JSON.stringify({ schemaVersion: 1, status: 'preflight', library: 'Microsoft.Diagnostics.Tracing.TraceEvent', libraryVersion: '3.2.8', windowsSupported: true, elevated: true, captureSupported: true }) : JSON.stringify(metadata); }, ...invalid });
    await assert.rejects(adapter.preflight());
    assert.ok(calls <= 2);
  }
  const adapter = createAdapter({ rammap: 'RAMMap64.exe' }, { platform: 'win32', env: {}, readFile: async () => '', hashFile: async () => sha256,
    runChild: async (exe, args) => { assert.ok(exe.endsWith('powershell.exe') || exe === 'dotnet'); return args?.[1] === 'preflight' ? JSON.stringify({ schemaVersion: 1, status: 'preflight', library: 'Microsoft.Diagnostics.Tracing.TraceEvent', libraryVersion: '3.2.8', windowsSupported: true, elevated: true, captureSupported: true }) : JSON.stringify(metadata); } });
  assert.equal((await adapter.preflight()).sha256, sha256);
});
test('owned child has a bounded timeout and cancellation', async () => {
  await assert.rejects(runChild(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100 }), /Owned child failed/);
  const controller = new AbortController();
  const pending = runChild(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /abort/i);
});


test('unavailable exact-file storage evidence is inconclusive after native measurements', async () => {
  for (const status of ['unavailable', 'resident']) {
    const { adapter } = fixture({ finishTrace: async () => ({ status }) });
    const result = await runColdTiming(real, adapter);
    assert.equal(result.outcome, 'inconclusive');
    assert.equal(result.rows.length, 2);
    assert.equal(result.storageReads[0].status, status);
  }
});

test('an inconclusive earlier pair cannot be hidden by later observed storage reads', async () => {
  let observed = 0;
  const { adapter } = fixture({ finishTrace: async () => ({ status: observed++ === 0 ? 'inconclusive' : 'observed-storage-read' }) });
  const result = await runColdTiming({ ...real, pairs: 2 }, adapter);
  assert.equal(result.outcome, 'inconclusive');
  assert.equal(result.storageReads.length, 2);
});

test('warm-only native measurement does not invoke purge or residency tools', async () => {
  const { adapter, calls } = fixture();
  const result = await runColdTiming({ ...real, warmOnly: true }, adapter);
  assert.equal(result.outcome, 'completed');
  assert.ok(!calls.some(call => ['purge', 'verifyTracing', 'startTrace', 'finishTrace'].includes(call[0])));
});

test('explicit tracing verification prepares the same native profile and never purges or measures', async () => {
  const { adapter, calls } = fixture();
  const result = await runColdTiming(parseOptions(['--verify-tracing']), adapter);
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(calls.map(call => call[0]), ['preflight', 'lock', 'prepare', 'verifyTracing', 'cleanup', 'unlock', 'save']);
  assert.throws(() => parseOptions(['--verify-tracing', '--execute-cache-purge']), /Choose/);
});

test('qualification mapping or owned trace cleanup failure prevents every purge request', async () => {
  for (const verification of [async () => ({ status: 'inconclusive' }), async () => { throw new Error('Owned ETW cleanup failed'); }]) {
    const { adapter, calls } = fixture({ verifyTracing: verification });
    assert.equal((await runColdTiming(real, adapter)).outcome, 'failed');
    assert.ok(!calls.some(call => call[0] === 'purge'));
  }
});

test('fully materialized MP4 retains the source and a correctly sized free box with matching hash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stream-jams-fixture-test-'));
  try {
    const seed = await readFile(new URL('../tests/fixtures/media/neutral-with-audio.mp4', import.meta.url));
    const path = join(root, 'native.mp4'), sizeBytes = 1048576;
    const checksum = await materializePlayableFixture(path, seed, sizeBytes);
    const bytes = await readFile(path);
    assert.equal(bytes.length, sizeBytes);
    assert.ok(bytes.subarray(0, seed.length).equals(seed));
    assert.equal(bytes.readUInt32BE(seed.length), sizeBytes - seed.length);
    assert.equal(bytes.toString('ascii', seed.length + 4, seed.length + 8), 'free');
    assert.ok(bytes.subarray(seed.length + 8).every(value => value === 0));
    assert.equal(checksum, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
    await assert.rejects(materializePlayableFixture(join(root, 'bad.mp4'), Buffer.alloc(30), 20), /larger/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('owned shutdown failure attempts only its captured launch child and never reports success', async () => {
  const terminated = [];
  const desktop = { evaluate: async () => { throw new Error('renderer unavailable'); } };
  const child = { pid: 12345, exitCode: null, signalCode: null };
  await assert.rejects(closeOwnedNative(desktop, child, new Set(), async pid => { terminated.push(pid); }), /shutdown failed and profile retained/);
  assert.deepEqual(terminated, [12345]);
  child.exitCode = 0;
  await assert.rejects(closeOwnedNative(desktop, child, new Set(), async pid => { terminated.push(pid); }), /shutdown failed/);
  assert.deepEqual(terminated, [12345]);
});
