import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { get, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { sendMediaFile } from "../../http/media-response.js";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { LocalAssetStore } from "../assets/local-asset-store.js";
import { LocalMediaService } from "../assets/local-media-service.js";
import { SqliteAssetRepository } from "../assets/sqlite-asset-repository.js";
import { SqliteAssetRetirementRepository } from "../assets/sqlite-asset-retirement-repository.js";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-recovery-"));
  const database = createInMemoryStreamJamsDatabase();
  const assets = new SqliteAssetRepository(database.connection);
  const store = new LocalAssetStore({ assetDirectory: directory });
  const media = new LocalMediaService({ assets, store, retirements: new SqliteAssetRetirementRepository(database.connection) });
  const bytes = Buffer.alloc(16 * 1024 * 1024, 42);
  const record = { id: "clip", originalFileName: "clip.webm", mediaType: "video" as const, mimeType: "video/webm", storagePath: "clip.webm", sizeBytes: bytes.length, durationMs: 1000, checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}` };
  await writeFile(join(directory, record.storagePath), bytes);
  await assets.save(record);
  const app = Fastify();
  app.get<{ Params: { handle: string } }>("/media/:handle", async (request, reply) => {
    try {
      const context = media.resolveForDelivery(request.params.handle);
      return await sendMediaFile(request, reply, context.reader, context.record, context.signal);
    } catch (error) {
      if (reply.sent) throw error;
      return reply.code(404).send();
    }
  });
  const origin = await app.listen({ host: "127.0.0.1", port: 0 });
  return { media, store, origin, bytes, async close() {
    await media.close(); await app.close(); database.close();
    await rm(directory, { recursive: true, force: true });
  } };
}

async function pausedReader(url: string) {
  return new Promise<{ incoming: IncomingMessage; destroy(): void }>((resolveReady, reject) => {
    const request = get(url, incoming => {
      incoming.pause();
      // An aborted server stream is the injected recipient failure, not an
      // unhandled client exception. The socket's eventual close is observed.
      incoming.on("error", () => undefined);
      resolveReady({ incoming, destroy() { incoming.destroy(); request.destroy(); } });
    });
    request.on("error", reject);
  });
}

it("revokes a stalled recipient while healthy selected recipients finish the same pinned version and later ranges", async () => {
  const f = await fixture();
  let stalled: Awaited<ReturnType<typeof pausedReader>> | undefined;
  try {
    await f.media.acquire("occurrence", ["clip"]);
    await f.media.verifyGroup("occurrence", ["clip"], AbortSignal.timeout(5000));
    const failed = f.media.issueTrustedGrant("occurrence", "clip", "selected-failed", Date.now() + 60000);
    const healthy = f.media.issueTrustedGrant("occurrence", "clip", "selected-healthy", Date.now() + 60000);
    stalled = await pausedReader(`${f.origin}/media/${failed.handle}`);
    await expect.poll(() => f.media.counts.readers).toBe(1);
    const response = await fetch(`${f.origin}/media/${healthy.handle}`, { signal: AbortSignal.timeout(5000) });
    expect(response.status).toBe(200);
    expect(createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex")).toBe(createHash("sha256").update(f.bytes).digest("hex"));
    await expect.poll(() => f.media.counts.readers).toBe(1);
    f.media.revoke(failed.handle);
    await expect.poll(() => f.media.counts.readers).toBe(0);
    expect(f.store.activeReaders).toBe(0);
    expect(f.media.counts).toEqual({ owners: 1, grants: 1, readers: 0 });
    expect((await fetch(`${f.origin}/media/${failed.handle}`)).status).toBe(404);
    const seek = await fetch(`${f.origin}/media/${healthy.handle}`, { headers: { range: "bytes=65536-65599" } });
    expect(seek.status).toBe(206);
    expect(seek.headers.get("content-range")).toBe(`bytes 65536-65599/${f.bytes.length}`);
    expect(Buffer.from(await seek.arrayBuffer())).toEqual(f.bytes.subarray(65536, 65600));
    await f.media.release("occurrence");
    await expect.poll(() => f.media.counts).toEqual({ owners: 0, grants: 0, readers: 0 });
  } finally { stalled?.destroy(); await f.close(); }
});

it("drains stalled reads on service generation loss and requires fresh ownership without reviving old grants", async () => {
  const f = await fixture();
  let stalled: Awaited<ReturnType<typeof pausedReader>> | undefined;
  try {
    await f.media.acquire("interrupted", ["clip"]);
    const old = f.media.issueTrustedGrant("interrupted", "clip", "selected", Date.now() + 60000);
    stalled = await pausedReader(`${f.origin}/media/${old.handle}`);
    await expect.poll(() => f.media.counts.readers).toBe(1);
    await f.media.invalidate();
    expect(f.media.counts).toEqual({ owners: 0, grants: 0, readers: 0 });
    expect(f.store.activeReaders).toBe(0);
    expect((await fetch(`${f.origin}/media/${old.handle}`)).status).toBe(404);
    await f.media.acquire("fresh-occurrence", ["clip"]);
    await f.media.verifyGroup("fresh-occurrence", ["clip"], AbortSignal.timeout(5000));
    const recovered = f.media.issueTrustedGrant("fresh-occurrence", "clip", "selected", Date.now() + 60000);
    expect(recovered.handle).not.toBe(old.handle);
    expect(recovered.snapshot).toEqual(old.snapshot);
    const response = await fetch(`${f.origin}/media/${recovered.handle}`, { headers: { range: "bytes=0-1023" } });
    expect(response.status).toBe(206);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(f.bytes.subarray(0, 1024));
    expect((await fetch(`${f.origin}/media/${old.handle}`)).status).toBe(404);
    await f.media.release("fresh-occurrence");
    await expect.poll(() => f.media.counts).toEqual({ owners: 0, grants: 0, readers: 0 });
  } finally { stalled?.destroy(); await f.close(); }
});
