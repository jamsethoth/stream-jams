/* global structuredClone */
import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeMediaStreamingEvidence } from './media-streaming-evidence.mjs';

const memory = { rss: 100, heapTotal: 80, heapUsed: 40, external: 20, arrayBuffers: 10 };
const acceptance = { packageSha256: 'a'.repeat(64), profile: 'C:/Temp/disposable', files: [], requests: [], samples: [{ label: 'baseline', at: 100, main: memory, processes: [{ pid: 42, type: 'Utility', memory: { workingSetSize: 100, peakWorkingSetSize: 120, privateBytes: 80 } }], renderer: null }], ipc: [], limitations: ['Muted decoding only.'], nativeTiming: [], error: 'ACCEPTANCE_FAILED' };
const resources = { profile: 'C:/Temp/disposable', packageSha256: 'b'.repeat(64), results: [{ sizeMiB: 1, sizeBytes: 1048576, pass: 0, onsetObservedMs: 12, native: { muted: true, volume: 0, privateUrl: true, error: null, target: 1, actual: 1 }, rendererHeap: { usedJSHeapSize: 10, totalJSHeapSize: 20 } }], ranges: [{ status: 206, contentRange: 'bytes 0-9/10' }], utilityResources: [{ label: '1MiB:0', pid: 42, before: memory, peak: memory, afterGC: memory, cleanup: { owners: 0, grants: 0, readers: 0, storeReaders: 0 }, reads: [{ expectedSizeBytes: 1048576, readBytes: 1048576, maximumChunkBytes: 65536, highWaterMark: 65536 }] }], utilityScope: 'Test utility observer.', exitCode: 0, capturedPidsExited: true, failures: [], limitations: [] };
test('accepts representative partial acceptance and resource observations', () => {
  assert.deepEqual(JSON.parse(serializeMediaStreamingEvidence('acceptance', acceptance)), acceptance);
  assert.deepEqual(JSON.parse(serializeMediaStreamingEvidence('resources', resources)), resources);
});
for (const [name, mutate] of [
  ['unknown field', value => { value.responseBody = 'secret'; }],
  ['nested unknown field', value => { value.samples[0].main.secret = 'token'; }],
  ['malformed field', value => { value.packageSha256 = 42; }],
  ['oversized string', value => { value.profile = 'x'.repeat(1025); }],
  ['oversized array', value => { value.ipc = Array(10001).fill({ channel: 'stream-jams:audio-command', sizeBytes: 1, bodyField: false, trustedHandle: false }); }],
  ['unexpected IPC channel', value => { value.ipc = [{ channel: 'secret', sizeBytes: 1, bodyField: false, trustedHandle: false }]; }],
  ['infinite number', value => { value.samples[0].main.rss = Infinity; }],
  ['NaN number', value => { value.samples[0].at = NaN; }],
  ['raw error', value => { value.error = 'Bearer secret'; }],
  ['raw range', value => { value.requests = [{ status: 206, range: 'Bearer token', contentRange: null }]; }]
]) test(`rejects ${name} without echoing rejected content`, () => {
  const value = structuredClone(acceptance); mutate(value);
  assert.throws(() => serializeMediaStreamingEvidence('acceptance', value), { message: 'Media streaming evidence validation failed' });
});
test('rejects malformed nested resource measurements and arbitrary failure text', () => {
  const value = structuredClone(resources); value.utilityResources[0].reads[0].readBytes = Infinity;
  assert.throws(() => serializeMediaStreamingEvidence('resources', value));
  value.utilityResources = []; value.failures = ['secret response body'];
  assert.throws(() => serializeMediaStreamingEvidence('resources', value));
});
test('accepts only fixed validation failure evidence', () => {
  assert.deepEqual(JSON.parse(serializeMediaStreamingEvidence('failure', { status: 'invalid-evidence', failures: ['EVIDENCE_VALIDATION_FAILED'] })), { status: 'invalid-evidence', failures: ['EVIDENCE_VALIDATION_FAILED'] });
  assert.throws(() => serializeMediaStreamingEvidence('failure', { status: 'invalid-evidence', failures: ['secret'] }));
});
test('rejects total serialized evidence beyond 16 MiB', () => {
  const value = structuredClone(acceptance);
  const row = { label: 'x'.repeat(1024), at: 100, main: memory, processes: Array(64).fill({ pid: 42, type: 'Utility', memory: { workingSetSize: 100, peakWorkingSetSize: 120 } }), renderer: null };
  value.samples = Array(2000).fill(row);
  assert.throws(() => serializeMediaStreamingEvidence('acceptance', value), { message: 'Media streaming evidence validation failed' });
});
