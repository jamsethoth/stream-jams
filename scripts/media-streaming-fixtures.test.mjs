import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { mediaFixtureManifest, uploadMediaFixture, validateFixtureDestination, validateMediaFixture } from "./media-streaming-fixtures.mjs";

async function fixed(name = "media-streaming-audio-only.webm") {
  return { fixture: name, name, mimeType: mediaFixtureManifest[name].mimeType, bytes: await readFile(new URL(`../tests/fixtures/media/${name}`, import.meta.url)) };
}
test("every reviewed fixed fixture passes its size/hash/media contract", async () => {
  for (const name of Object.keys(mediaFixtureManifest)) validateMediaFixture(await fixed(name));
});
test("rejects changed bytes, wrong MIME/container, empty, oversized and unreviewed fixtures", async () => {
  const input = await fixed();
  const altered = Buffer.from(input.bytes); altered[altered.length - 1] ^= 1;
  assert.throws(() => validateMediaFixture({ ...input, bytes: altered }), /SHA-256/);
  assert.throws(() => validateMediaFixture({ ...input, mimeType: "video/webm" }), /MIME type/);
  assert.throws(() => validateMediaFixture({ ...input, mimeType: "image/png", name: "wrong.png" }), /signature/);
  assert.throws(() => validateMediaFixture({ ...input, name: "wrong.mp4" }), /extension/);
  assert.throws(() => validateMediaFixture({ ...input, bytes: input.bytes.subarray(0, -1) }), /size/);
  assert.throws(() => validateMediaFixture({ ...input, bytes: Buffer.alloc(256 * 1024 + 1) }), /byte limit/);
  assert.throws(() => validateMediaFixture({ ...input, bytes: Buffer.alloc(0) }), /nonempty/);
  assert.throws(() => validateMediaFixture({ ...input, fixture: "unreviewed.webm" }), /manifest/);
});
test("generated PNG checks size, actual dimensions and complete container without fixed hash", () => {
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=", "base64");
  const input = { bytes, name: "generated.png", mimeType: "image/png", fixture: { kind: "generated-png", width: 1, height: 1 } };
  validateMediaFixture(input);
  assert.throws(() => validateMediaFixture({ ...input, fixture: { ...input.fixture, width: 8 } }), /dimensions/);
  assert.throws(() => validateMediaFixture({ ...input, bytes: bytes.subarray(0, -1) }), /container/);
  assert.throws(() => validateMediaFixture({ ...input, bytes: Buffer.alloc(64 * 1024 + 1) }), /byte limit/);
  const invalidHeader = Buffer.from(bytes); invalidHeader[26] = 1;
  assert.throws(() => validateMediaFixture({ ...input, bytes: invalidHeader }), /container/);
  const unknownChunk = Buffer.from(bytes); unknownChunk.write("ABCD", 37, "ascii");
  assert.throws(() => validateMediaFixture({ ...input, bytes: unknownChunk }), /unknown critical/);
});
test("requires exact owned loopback destination including its port/path and no credentials", () => {
  const base = "http://127.0.0.1:3001";
  assert.equal(validateFixtureDestination(base), `${base}/assets/import`);
  for (const target of ["https://example.com/assets/import", "http://127.0.0.1:3002/assets/import", `${base}/other`, `${base}/assets/import?redirect=1`, `${base}/assets/import#fragment`, "http://user:pass@127.0.0.1:3001/assets/import"]) {
    assert.throws(() => validateFixtureDestination(base, target), /owned loopback/);
  }
  for (const unowned of ["http://localhost:3001", "http://127.0.0.2:3001", "https://127.0.0.1:3001", `${base}/`, "http://127.0.0.1"]) {
    assert.throws(() => validateFixtureDestination(unowned), /owned loopback/);
  }
});
test("invalid fixtures/destinations cause zero requests; redirects cannot forward bytes or credentials", async () => {
  let requests = 0, forwarded = 0;
  const destination = createServer((_request, response) => { forwarded++; response.end(); });
  destination.listen(0, "127.0.0.1"); await once(destination, "listening");
  const receiver = createServer((_request, response) => { requests++; response.writeHead(307, { location: `http://127.0.0.1:${destination.address().port}/assets/import` }); response.end(); });
  receiver.listen(0, "127.0.0.1"); await once(receiver, "listening");
  try {
    const input = { ...await fixed(), ownedBase: `http://127.0.0.1:${receiver.address().port}`, headers: { authorization: "Bearer test-only" } };
    const changed = Buffer.from(input.bytes); changed[changed.length - 1] ^= 1;
    await assert.rejects(uploadMediaFixture({ ...input, bytes: changed }), /SHA-256/);
    await assert.rejects(uploadMediaFixture({ ...input, bytes: Buffer.alloc(256 * 1024 + 1) }), /byte limit/);
    await assert.rejects(uploadMediaFixture({ ...input, destination: `http://127.0.0.1:${destination.address().port}/assets/import` }), /owned loopback/);
    assert.equal(requests, 0); assert.equal(forwarded, 0);
    await assert.rejects(uploadMediaFixture(input), /fetch failed/);
    assert.equal(requests, 1); assert.equal(forwarded, 0);
  } finally {
    receiver.closeAllConnections(); destination.closeAllConnections();
    await Promise.all([new Promise(resolve => receiver.close(resolve)), new Promise(resolve => destination.close(resolve))]);
  }
});
