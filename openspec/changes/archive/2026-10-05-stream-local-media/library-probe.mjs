// Standalone feasibility probe, not a production contract test.
// Run from the repository root: node openspec/changes/archive/2026-10-05-stream-local-media/library-probe.mjs
import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";

const serverRequire = createRequire(new URL("../../../../apps/server/package.json", import.meta.url));
const Fastify = serverRequire("fastify");
const fastifyStatic = serverRequire("@fastify/static");
const directory = await mkdtemp(join(tmpdir(), "stream-jams-library-probe-"));
const app = Fastify();
const observations = [];
try {
  await writeFile(join(directory, "media.webm"), "0123456789");
  await writeFile(join(directory, "replacement.webm"), "ABCDEFGHIJ");
  let replaceBeforeDelivery = false;
  await app.register(fastifyStatic, {
    serve: false,
    root: directory,
    cacheControl: false,
    lastModified: false,
    setHeaders(reply) {
      reply.header("cache-control", "no-store");
      if (replaceBeforeDelivery) {
        replaceBeforeDelivery = false;
        renameSync(join(directory, "media.webm"), join(directory, "retired.webm"));
        renameSync(join(directory, "replacement.webm"), join(directory, "media.webm"));
      }
    }
  });
  app.get("/media", (_request, reply) => reply.sendFile("media.webm", { highWaterMark: 65536 }));
  app.get("/checksum", (_request, reply) => reply.header("etag", '"registered-sha256"').sendFile("media.webm", { etag: false }));
  await app.ready();
  const baseline = await app.inject("/media");
  assert.equal(baseline.statusCode, 200);
  assert.equal(baseline.body, "0123456789");
  const cases = [
    ["ordinary range", "/media", "GET", { range: "bytes=2-4" }, 206],
    ["HEAD ignores Range", "/media", "HEAD", { range: "bytes=2-4" }, 200],
    ["oversized suffix means entire file", "/media", "GET", { range: "bytes=-20" }, 206],
    ["malformed Range ignored", "/media", "GET", { range: "bytes=bad" }, 200],
    ["weak If-Range cannot match", "/media", "GET", { range: "bytes=2-4", "if-range": baseline.headers.etag }, 200],
    ["date If-Range without date validator", "/media", "GET", { range: "bytes=2-4", "if-range": "Wed, 30 Sep 2026 00:00:00 GMT" }, 200],
    ["custom checksum If-None-Match", "/checksum", "GET", { "if-none-match": '"registered-sha256"' }, 304],
    ["custom checksum If-Range", "/checksum", "GET", { range: "bytes=2-4", "if-range": '"registered-sha256"' }, 206]
  ];
  for (const [name, url, method, headers, expectedStatus] of cases) {
    const response = await app.inject({ url, method, headers });
    observations.push({ name, expectedStatus, actualStatus: response.statusCode, matchesContract: response.statusCode === expectedStatus });
  }
  replaceBeforeDelivery = true;
  const replaced = await app.inject("/media");
  observations.push({ name: "replacement after library stat, before body read", expectedBody: "0123456789", actualBody: replaced.body, matchesContract: replaced.body === "0123456789" });
  console.log(JSON.stringify({
    node: process.version,
    fastify: serverRequire("fastify/package.json").version,
    static: serverRequire("@fastify/static/package.json").version,
    probe: fileURLToPath(import.meta.url),
    observations
  }, null, 2));
  // This probe reports differences; it is not a passing implementation suite.
  process.exitCode = observations.every(result => result.matchesContract) ? 0 : 1;
} finally {
  await app.close();
  const resolvedDirectory = resolve(directory);
  assert.ok(resolvedDirectory.startsWith(`${resolve(tmpdir())}${sep}stream-jams-library-probe-`));
  await rm(resolvedDirectory, { recursive: true, force: true });
}
