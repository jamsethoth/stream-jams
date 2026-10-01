import { createHash } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { sendMediaFile } from "../../http/media-response.js";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { LocalAssetStore } from "./local-asset-store.js";
import { LocalMediaService } from "./local-media-service.js";
import { SqliteAssetRepository } from "./sqlite-asset-repository.js";
import { SqliteAssetRetirementRepository } from "./sqlite-asset-retirement-repository.js";

const chunkSize = 64 * 1024;

async function fixture(mib: number) {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-resource-regression-"));
  const sizeBytes = mib * 1024 * 1024;
  const file = await open(join(directory, "media.mp4"), "w");
  try { await file.truncate(sizeBytes); } finally { await file.close(); }
  const hash = createHash("sha256"), zeros = Buffer.alloc(chunkSize);
  for (let offset = 0; offset < sizeBytes; offset += chunkSize) hash.update(zeros);
  const record = { id: "asset", originalFileName: "media.mp4", storagePath: "media.mp4", mimeType: "video/mp4", mediaType: "video" as const, durationMs: 1000, sizeBytes, checksum: `sha256:${hash.digest("hex")}` };
  const database = createInMemoryStreamJamsDatabase();
  const assets = new SqliteAssetRepository(database.connection);
  await assets.save(record);
  const store = new LocalAssetStore({ assetDirectory: directory });
  // Instrument the real reader without collecting chunks or changing backpressure.
  const reads: { bytes: number; largestChunk: number; highWaterMark: number | undefined }[] = [];
  const openRead = store.openRead.bind(store);
  vi.spyOn(store, "openRead").mockImplementation(async (path, size) => {
    const opened = await openRead(path, size);
    const create = opened.handle.createReadStream.bind(opened.handle);
    opened.handle.createReadStream = options => {
      const stream = create(options);
      const metrics = { bytes: 0, largestChunk: 0, highWaterMark: options?.highWaterMark };
      reads.push(metrics);
      const push = stream.push.bind(stream);
      stream.push = (chunk: Buffer | null, encoding?: BufferEncoding) => {
        if (chunk !== null) { metrics.bytes += chunk.length; metrics.largestChunk = Math.max(metrics.largestChunk, chunk.length); }
        return push(chunk, encoding);
      };
      return stream;
    };
    return opened;
  });
  const media = new LocalMediaService({ assets, store, retirements: new SqliteAssetRetirementRepository(database.connection) });
  const noBulkRead = vi.spyOn(store, "read").mockRejectedValue(new Error("Playback must not read complete bodies"));
  return { store, media, record, reads, noBulkRead, async close() {
    await media.close(); database.close();
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  } };
}

for (const mib of [1, 25, 100]) {
  it(`${mib} MiB: each preparation hashes fresh 64 KiB chunks, HTTP reads only its interval, and owners/readers/grants drain`, async () => {
    const f = await fixture(mib), app = Fastify();
    let activeContext: ReturnType<LocalMediaService["resolveForDelivery"]>;
    app.get("/range", (request, reply) => sendMediaFile(request, reply, activeContext.reader, activeContext.record, activeContext.signal));
    try {
      // A second call with the same owner and later owner must both read again.
      for (let pass = 0; pass < 3; pass++) {
        const owner = pass < 2 ? "first" : "later";
        if (pass !== 1) await f.media.acquire(owner, [f.record.id]);
        const countBefore = f.reads.length;
        await f.media.verifyGroup(owner, [f.record.id, f.record.id], AbortSignal.timeout(10_000));
        expect(f.reads.slice(countBefore)).toHaveLength(1);
        expect(f.reads.at(-1)).toEqual({ bytes: f.record.sizeBytes, largestChunk: chunkSize, highWaterMark: chunkSize });
        const grant = f.media.issueTrustedGrant(owner, f.record.id, "test-recipient", Date.now() + 60_000);
        const context = f.media.resolveForDelivery(grant.handle);
        activeContext = context;
        const response = await app.inject({ method: "GET", url: "/range", headers: { range: "bytes=100-4195" } });
        expect(response.statusCode).toBe(206);
        expect(response.headers["content-range"]).toBe(`bytes 100-4195/${f.record.sizeBytes}`);
        expect(response.rawPayload).toEqual(Buffer.alloc(4096));
        expect(f.reads.at(-1)).toEqual({ bytes: 4096, largestChunk: 4096, highWaterMark: chunkSize });
        await expect.poll(() => f.media.counts).toEqual({ owners: 1, grants: 1, readers: 0 });
        expect(f.store.activeReaders).toBe(0);
        // Keep owner across the first two preparations to catch result caching.
        if (pass !== 0) {
          await f.media.release(owner);
          expect(context.signal.aborted).toBe(true);
          expect(() => f.media.resolveForDelivery(grant.handle)).toThrow("unavailable");
          expect(f.media.counts).toEqual({ owners: 0, grants: 0, readers: 0 });
        }
      }
      expect(f.noBulkRead).not.toHaveBeenCalled();
    } finally { await app.close(); await f.close(); }
  }, 20_000);
}

it("declared 256-reader/4096-grant capacities reject additional work without evicting the active owner", async () => {
  const f = await fixture(1);
  try {
    await f.media.acquire("owner", [f.record.id]);
    const opened = await Promise.all(Array.from({ length: 256 }, () => f.media.openRead(f.record)));
    try {
      expect(f.store.activeReaders).toBe(256);
      await expect(f.media.openRead(f.record)).rejects.toThrow("capacity");
      expect(f.media.counts).toEqual({ owners: 1, grants: 0, readers: 256 });
    } finally { await Promise.all(opened.map(read => read.close())); }
    for (let i = 0; i < 4096; i++) f.media.issueTrustedGrant("owner", f.record.id, `recipient-${i}`, Date.now() + 60_000);
    expect(() => f.media.issueTrustedGrant("owner", f.record.id, "over-capacity", Date.now() + 60_000)).toThrow("capacity");
    expect(f.media.counts).toEqual({ owners: 1, grants: 4096, readers: 0 });
    await f.media.release("owner");
    expect(f.media.counts).toEqual({ owners: 0, grants: 0, readers: 0 });
    expect(f.store.activeReaders).toBe(0);
  } finally { await f.close(); }
}, 20_000);
