import { mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { get } from "node:http";
import Fastify from "fastify";
import { expect, it } from "vitest";
import { LocalAssetStore, AssetStreamCapacityError } from "../modules/assets/local-asset-store.js";
import { sendMediaFile } from "./media-response.js";

it("streams a small interval of a large file over HTTP and closes abandoned readers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-media-http-"));
  const app = Fastify();
  const sizeBytes = 100 * 1024 * 1024;
  const file = await open(join(directory, "large.webm"), "w");
  await file.truncate(sizeBytes);
  await file.write(Buffer.from("range"), 0, 5, sizeBytes - 5);
  await file.close();
  const store = new LocalAssetStore({ assetDirectory: directory });
  const record = { id: "large", originalFileName: "large.webm", storagePath: "large.webm", checksum: "sha256:fixture", mimeType: "video/webm", mediaType: "video" as const, sizeBytes, durationMs: null };
  app.get("/media", (request, reply) => sendMediaFile(request, reply, store, record));
  app.get("/failed-read", (request, reply) => sendMediaFile(request, reply, {
    async openRead(path, size) {
      const opened = await store.openRead(path, size);
      const createReadStream = opened.handle.createReadStream.bind(opened.handle);
      // Inject a storage failure after the first real chunk has reached the response.
      opened.handle.createReadStream = options => {
        const stream = createReadStream(options);
        stream.once("data", () => setImmediate(() => stream.destroy(new Error("storage read failed"))));
        return stream;
      };
      return opened;
    }
  }, record));
  try {
    const origin = await app.listen({ host: "127.0.0.1", port: 0 });
    const response = await fetch(`${origin}/media`, { headers: { range: "bytes=-5" } });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-length")).toBe("5");
    expect(await response.text()).toBe("range");
    await expect.poll(() => store.activeReaders).toBe(0);
    const failed = await fetch(`${origin}/failed-read`);
    expect(failed.status).toBe(200);
    await expect(failed.arrayBuffer()).rejects.toThrow();
    await expect.poll(() => store.activeReaders).toBe(0);
    await new Promise<void>((resolve, reject) => {
      const request = get(`${origin}/media`, incoming => {
        incoming.once("data", () => {
          incoming.destroy();
          request.destroy();
          resolve();
        });
        incoming.once("error", reject);
      });
      request.once("error", reject);
    });
    await expect.poll(() => store.activeReaders).toBe(0);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects excess readers while preserving existing readers and recovers capacity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stream-jams-media-capacity-"));
  const store = new LocalAssetStore({ assetDirectory: directory });
  const readers: Awaited<ReturnType<LocalAssetStore["openRead"]>>[] = [];
  try {
    await writeFile(join(directory, "media"), "x");
    readers.push(...await Promise.all(Array.from({ length: 256 }, () => store.openRead("media", 1))));
    await expect(store.openRead("media", 1)).rejects.toBeInstanceOf(AssetStreamCapacityError);
    await readers.pop()!.close();
    const replacement = await store.openRead("media", 1);
    await replacement.close();
    expect(store.activeReaders).toBe(255);
  } finally {
    await Promise.all(readers.map(reader => reader.close()));
    await rm(directory, { recursive: true, force: true });
  }
  expect(store.activeReaders).toBe(0);
});
