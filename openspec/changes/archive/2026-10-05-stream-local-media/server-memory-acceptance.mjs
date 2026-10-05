/* global AbortSignal */
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setInterval, clearInterval } from 'node:timers';
import { createInMemoryStreamJamsDatabase } from '../../../../apps/server/dist/modules/db/database.js';
import { SqliteAssetRepository } from '../../../../apps/server/dist/modules/assets/sqlite-asset-repository.js';
import { SqliteAssetRetirementRepository } from '../../../../apps/server/dist/modules/assets/sqlite-asset-retirement-repository.js';
import { LocalAssetStore } from '../../../../apps/server/dist/modules/assets/local-asset-store.js';
import { LocalMediaService } from '../../../../apps/server/dist/modules/assets/local-media-service.js';

const root = resolve('apps/desktop/out/streaming-acceptance');
const packaged = JSON.parse(await readFile(join(root, 'results.json'), 'utf8'));
const store = new LocalAssetStore({ assetDirectory: packaged.profile });
const database = createInMemoryStreamJamsDatabase();
const assets = new SqliteAssetRepository(database.connection);
const retirements = new SqliteAssetRetirementRepository(database.connection);
const media = new LocalMediaService({ assets, store, retirements });
const evidence = { nodeVersion: process.version, scope: 'Actual built server LocalMediaService/LocalAssetStore in a standalone process; not packaged utility-process external memory.', rows: [] };
try {
  for (const mib of [1, 25, 100]) {
    const storagePath = `neutral-${mib}MiB.mp4`, sizeBytes = mib * 1024 * 1024, id = `size-${mib}`;
    const hash = createHash('sha256'); for await (const chunk of createReadStream(join(packaged.profile, storagePath))) hash.update(chunk);
    await assets.save({ id, storagePath, sizeBytes, originalFileName: storagePath, mimeType: 'video/mp4', mediaType: 'video', durationMs: 10_000, checksum: `sha256:${hash.digest('hex')}` });
    for (const pass of ['first-process-use', 'warm-repeat']) {
      const owner = `${id}:${pass}`; await media.acquire(owner, [id]); globalThis.gc?.();
      const before = process.memoryUsage(), peak = { ...before };
      const sampling = setInterval(() => { const current = process.memoryUsage(); for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], current[key]); }, 1);
      const started = performance.now();
      try { await media.verifyGroup(owner, [id], AbortSignal.timeout(15_000)); }
      finally { clearInterval(sampling); }
      const verificationMs = performance.now() - started;
      const grant = media.issueTrustedGrant(owner, id, 'memory-probe', Date.now() + 60_000);
      const context = media.resolveForDelivery(grant.handle), opened = await context.reader.openRead(storagePath, sizeBytes);
      let intervalBytes = 0, maximumChunkBytes = 0;
      try { for await (const chunk of opened.handle.createReadStream({ start: 100, end: 4195, highWaterMark: 65536, autoClose: false, signal: context.signal })) { intervalBytes += chunk.length; maximumChunkBytes = Math.max(maximumChunkBytes, chunk.length); } }
      finally { await opened.close(); }
      await media.release(owner);
      const cleanup = { ...media.counts, storeReaders: store.activeReaders };
      if (intervalBytes !== 4096 || Object.values(cleanup).some(value => value !== 0)) throw new Error('Interval/ownership cleanup did not meet its bound');
      evidence.rows.push({ mib, sizeBytes, pass, verificationMs, before, peak, after: process.memoryUsage(), intervalBytes, maximumChunkBytes, cleanup });
    }
  }
} finally { await media.close(); database.close(); }
await writeFile(join(root, 'server-memory.json'), JSON.stringify(evidence, null, 2));
console.info(`Incremental server memory evidence: ${join(root, 'server-memory.json')}`);
