import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { get, type ClientRequest, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { connect, type Socket } from "node:net";
import { join } from "node:path";
import { appConfigSchema } from "@stream-jams/core";
import { InMemorySecretStore } from "@stream-jams/test-support";
import { expect, it } from "vitest";
import { SqliteAssetRepository } from "../modules/assets/sqlite-asset-repository.js";
import { createRuntimeAppComposition, type RuntimeAppComposition } from "./runtime-composition.js";

it.each(["paused-media", "unrequested-connection"] as const)("runtime shutdown cancels %s before closing HTTP and SQLite", async kind => {
  const root = await mkdtemp(join(tmpdir(), "stream-jams-runtime-media-close-"));
  const assetDirectory = join(root, "assets"), webBuildDirectory = join(root, "web");
  await mkdir(assetDirectory, { recursive: true });
  await mkdir(join(webBuildDirectory, "assets"), { recursive: true });
  await mkdir(join(webBuildDirectory, ".vite"));
  await writeFile(join(webBuildDirectory, "index.html"), '<html><body><div id="root"></div></body></html>');
  await writeFile(join(webBuildDirectory, "assets", "index.js"), "export {};");
  const dynamicImports = ["src/App.tsx", "src/operator/OperatorApp.tsx", "src/overlay/OverlayApp.tsx"];
  await writeFile(join(webBuildDirectory, ".vite", "manifest.json"), JSON.stringify({
    "index.html": { file: "assets/index.js", isEntry: true, dynamicImports },
    ...Object.fromEntries(dynamicImports.map(src => [src, { file: "assets/index.js", src, isDynamicEntry: true, imports: ["index.html"] }]))
  }));
  const config = appConfigSchema.parse({ server: { host: "127.0.0.1", port: 39187 }, storage: { dataDirectory: join(root, "data"), assetDirectory }, playback: { paused: false, muted: true, doNotDisturb: false } });
  let composition: RuntimeAppComposition | undefined;
  let incoming: IncomingMessage | undefined, request: ClientRequest | undefined, socket: Socket | undefined;
  let closing: Promise<void> | undefined;
  try {
    composition = await createRuntimeAppComposition({ homeDirectory: root, webBuildDirectory, environment: {}, secretStore: new InMemorySecretStore(), configStore: { async readConfig() { return config; }, async updateConfig() { throw new Error("This shutdown test does not update config"); } } });
    const bytes = Buffer.alloc(16 * 1024 * 1024);
    const record = { id: "shutdown-clip", originalFileName: "shutdown.webm", mediaType: "video" as const, mimeType: "video/webm", sizeBytes: bytes.length, storagePath: "shutdown.webm", checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, durationMs: 120000 };
    await writeFile(join(assetDirectory, record.storagePath), bytes);
    await new SqliteAssetRepository(composition.database.connection).save(record);
    const media = composition.localMediaService;
    await media.acquire("shutdown-owner", [record.id]);
    const grant = media.issueTrustedGrant("shutdown-owner", record.id, "shutdown-recipient", Date.now() + 60000);
    const origin = await composition.app.listen({ host: "127.0.0.1", port: 0 });
    if (kind === "unrequested-connection") {
      const url = new URL(origin);
      socket = connect({ host: url.hostname, port: Number(url.port) });
      socket.on("error", () => undefined);
      await new Promise<void>(ready => socket!.once("connect", ready));
      await expect.poll(() => new Promise<number>((resolve, reject) => composition!.app.server.getConnections((error, count) => error ? reject(error) : resolve(count)))).toBe(1);
    } else await new Promise<void>((ready, reject) => {
      request = get(`${origin}/media/${grant.handle}`, response => {
        incoming = response; response.on("error", () => undefined); response.pause(); ready();
      });
      request.on("error", reject);
    });
    if (incoming !== undefined) expect(incoming.statusCode).toBe(200);
    await expect.poll(() => media.counts.readers).toBe(kind === "paused-media" ? 1 : 0);
    let stopped = false;
    closing = composition.close().then(() => { stopped = true; });
    // The client deliberately does not cancel: runtime owns authoritative
    // cancellation. finally still frees it when testing the failing baseline.
    await expect.poll(() => stopped, { timeout: 1500 }).toBe(true);
    expect(media.counts).toEqual({ owners: 0, grants: 0, readers: 0 });
    expect(() => media.resolveForDelivery(grant.handle)).toThrow("unavailable");
    // Only after authoritative shutdown has completed, drain buffered client
    // bytes so its paused parser can observe the remote truncated response.
    if (incoming !== undefined) {
      incoming.resume();
      await expect.poll(() => incoming!.destroyed).toBe(true);
      expect(incoming.complete).toBe(false);
      expect(incoming.aborted).toBe(true);
    }
    if (socket !== undefined) await expect.poll(() => socket!.destroyed).toBe(true);
  } finally {
    incoming?.destroy(); request?.destroy(); socket?.destroy();
    await (closing ?? composition?.close());
    await rm(root, { recursive: true, force: true });
  }
}, 10000);
