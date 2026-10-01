/* global AbortSignal */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { setImmediate as tick } from 'node:timers/promises';
import { clearInterval, setInterval } from 'node:timers';
import { fileURLToPath } from 'node:url';

// A fresh process isolates server verification/transport from import allocations,
// Vitest, Chromium and native decoders. No OS cache flushing is performed.
const chunkSize = 65536, mib = 1024 * 1024;
const outputRoot = resolve('apps/desktop/out/streaming-automation-resources');
if (!process.argv.includes('--worker')) {
  await mkdir(outputRoot, { recursive: true });
  const rows = [], ipc = [];
  const worker = fork(fileURLToPath(import.meta.url), ['--worker'], { execArgv: ['--expose-gc'], windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  worker.on('message', message => {
    const json = JSON.stringify(message);
    const measured = { sizeBytes: Buffer.byteLength(json), bodyField: /"(?:bytes|base64|body)"\s*:/.test(json), trustedHandle: json.includes('med_') };
    ipc.push(measured);
    rows.push(message);
  });
  const code = await new Promise((accept, reject) => { worker.once('error', reject); worker.once('exit', (code, signal) => signal ? reject(new Error(`Worker terminated: ${signal}`)) : accept(code)); });
  const evidence = { nodeVersion: process.version, scope: 'Actual built LocalMediaService/LocalAssetStore in isolated Node worker; not packaged Electron utility or native renderer memory.', rows, ipc,
    limits: { fileReadChunkBytes: chunkSize, sampledExternalGrowthBytes: 80 * mib, retainedExternalGrowthBytes: 8 * mib, retainedArrayBufferGrowthBytes: 8 * mib },
    limitations: ['First process use is not OS-cache cold. No system cache or machine state was changed.', 'Sampled peaks are observations, not continuous/allocation proofs. Exact production read chunks and fresh hash bytes are asserted separately.', 'GC-aware retained-buffer ceilings catch whole-body retention; they do not promise constant RSS or native decoder memory.'] };
  await writeFile(join(outputRoot, 'server-worker-memory.json'), JSON.stringify(evidence, null, 2));
  assert.equal(code, 0, 'Resource worker failed');
  assert.equal(rows.length, 6);
  assert.ok(ipc.every(item => item.sizeBytes < 4096 && !item.bodyField && !item.trustedHandle), 'Worker IPC must contain only measurements');
  console.info(`Streaming resource evidence: ${join(outputRoot, 'server-worker-memory.json')}`);
} else {
  const [{ createInMemoryStreamJamsDatabase }, { SqliteAssetRepository }, { SqliteAssetRetirementRepository }, { LocalAssetStore }, { LocalMediaService }] = await Promise.all([
    import('../apps/server/dist/modules/db/database.js'), import('../apps/server/dist/modules/assets/sqlite-asset-repository.js'),
    import('../apps/server/dist/modules/assets/sqlite-asset-retirement-repository.js'), import('../apps/server/dist/modules/assets/local-asset-store.js'), import('../apps/server/dist/modules/assets/local-media-service.js')
  ]);
  const directory = await mkdtemp(join(tmpdir(), 'stream-jams-resource-worker-'));
  const database = createInMemoryStreamJamsDatabase();
  const assets = new SqliteAssetRepository(database.connection), store = new LocalAssetStore({ assetDirectory: directory });
  const reads = [];
  const openRead = store.openRead.bind(store);
  store.openRead = async (...args) => {
    const opened = await openRead(...args), create = opened.handle.createReadStream.bind(opened.handle);
    opened.handle.createReadStream = options => {
      const stream = create(options), metrics = { readBytes: 0, maximumChunkBytes: 0, highWaterMark: options.highWaterMark };
      reads.push(metrics);
      const push = stream.push.bind(stream);
      stream.push = (chunk, encoding) => {
        if (chunk !== null) { metrics.readBytes += chunk.length; metrics.maximumChunkBytes = Math.max(metrics.maximumChunkBytes, chunk.length); }
        return push(chunk, encoding);
      };
      return stream;
    };
    return opened;
  };
  store.read = async () => { throw new Error('Complete-body playback reads are forbidden'); };
  const media = new LocalMediaService({ assets, store, retirements: new SqliteAssetRetirementRepository(database.connection) });
  const collect = async () => { assert.equal(typeof globalThis.gc, 'function'); globalThis.gc(); await tick(); globalThis.gc(); await tick(); };
  try {
    for (const sizeMiB of [1, 25, 100]) {
      const storagePath = `${sizeMiB}.mp4`, sizeBytes = sizeMiB * mib, id = `size-${sizeMiB}`;
      const file = await open(join(directory, storagePath), 'w');
      try { await file.truncate(sizeBytes); } finally { await file.close(); }
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(join(directory, storagePath), { highWaterMark: chunkSize })) hash.update(chunk);
      await assets.save({ id, storagePath, sizeBytes, originalFileName: storagePath, mimeType: 'video/mp4', mediaType: 'video', durationMs: 1000, checksum: `sha256:${hash.digest('hex')}` });
      for (const pass of ['first-process-use', 'repeat-preparation']) {
        const owner = `${id}:${pass}`;
        await media.acquire(owner, [id]); await collect();
        const before = process.memoryUsage(), peak = { ...before }, readStart = reads.length;
        const sample = () => { const current = process.memoryUsage(); for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], current[key]); };
        const sampling = setInterval(sample, 1), started = performance.now();
        let verificationMs;
        try { await media.verifyGroup(owner, [id, id], AbortSignal.timeout(15_000)); verificationMs = performance.now() - started; sample(); }
        finally { clearInterval(sampling); }
        assert.equal(reads.length - readStart, 1, 'Every preparation hashes again; duplicates share one read');
        const verification = reads.at(-1);
        assert.deepEqual(verification, { readBytes: sizeBytes, maximumChunkBytes: chunkSize, highWaterMark: chunkSize });
        const grant = media.issueTrustedGrant(owner, id, 'benchmark', Date.now() + 60000), context = media.resolveForDelivery(grant.handle);
        const opened = await context.reader.openRead(storagePath, sizeBytes);
        let intervalBytes = 0;
        try { for await (const chunk of opened.handle.createReadStream({ start: 100, end: 4195, highWaterMark: chunkSize, autoClose: false, signal: context.signal })) intervalBytes += chunk.length; }
        finally { await opened.close(); }
        assert.equal(intervalBytes, 4096);
        assert.deepEqual(reads.at(-1), { readBytes: 4096, maximumChunkBytes: 4096, highWaterMark: chunkSize });
        await media.release(owner); await collect();
        const afterGC = process.memoryUsage(), cleanup = { ...media.counts, storeReaders: store.activeReaders };
        assert.deepEqual(cleanup, { owners: 0, grants: 0, readers: 0, storeReaders: 0 });
        assert.ok(peak.external - before.external < 80 * mib, 'Sampled external growth exceeds bounded verification budget');
        assert.ok(afterGC.external - before.external < 8 * mib, 'Released preparation retains excessive external buffers');
        assert.ok(afterGC.arrayBuffers - before.arrayBuffers < 8 * mib, 'Released preparation retains excessive ArrayBuffers');
        process.send({ sizeMiB, pass, verificationMs, before, peak, afterGC, verification, intervalBytes, cleanup });
      }
    }
  } finally { await media.close(); database.close(); await rm(directory, { recursive: true, force: true }); }
  process.disconnect();
}
