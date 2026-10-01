import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { DefaultAssetValidator } from "../packages/core/dist/index.js";

// Reviewed tracked inputs. Update deliberately alongside fixture provenance;
// never calculate the expected digest from whichever file is being uploaded.
export const mediaFixtureManifest = Object.freeze({
  "neutral-with-audio.webm": { sizeBytes: 171805, mimeType: "video/webm", sha256: "a690ef07d7a1290c6aeabf262b4e219b3381e2cab38e03052eb9b9940382c7b4" },
  "media-streaming-end-metadata.mp4": { sizeBytes: 173934, mimeType: "video/mp4", sha256: "d883ce393cb7fb1c721913592e804f4478b462034828ce94f91f730d7fa7ca08" },
  "media-streaming-unsupported-adpcm.wav": { sizeBytes: 4186, mimeType: "audio/wav", sha256: "59847a8112773131e1868d006a7795d0cedd25a4678ab075b72c63f716e4d087" },
  "media-streaming-audio-only.webm": { sizeBytes: 982, mimeType: "audio/webm", sha256: "826c78eb2826c2648eeaea6168d1bef59b5ec015e0ae42f7957c3a6421b1b4b2" },
  "media-streaming-animated.gif": { sizeBytes: 89, mimeType: "image/gif", sha256: "450ce4035bc599880c5ce465891aa9a05050f1dc558736eec39d9d54c69388bf" },
  "media-streaming-transparent-vp9.webm": { sizeBytes: 95093, mimeType: "video/webm", sha256: "4db46bc6c600c8a978cb88e2386af641ab1dd9b4e007242f41fd162530c81e80" }
});
const maxTrackedBytes = 256 * 1024;
const validator = new DefaultAssetValidator();

export function validateMediaFixture({ bytes, name, mimeType, fixture }) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new Error("Fixture must be a nonempty Buffer");
  const generated = fixture !== null && typeof fixture === "object" && fixture.kind === "generated-png";
  const limit = generated ? 64 * 1024 : maxTrackedBytes;
  if (bytes.length > limit) throw new Error("Fixture exceeds upload byte limit");
  const validation = validator.validate({ bytes, originalFileName: name, mimeType, sizeBytes: bytes.length });
  if (!validation.accepted) throw new Error(`Fixture media validation failed: ${validation.reason}`);
  if (generated) {
    if (mimeType !== "image/png" || !Number.isSafeInteger(fixture.width) || !Number.isSafeInteger(fixture.height)
      || fixture.width <= 0 || fixture.height <= 0 || fixture.width > 64 || fixture.height > 64
      || bytes.length < 45 || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR"
      || bytes.readUInt32BE(16) !== fixture.width || bytes.readUInt32BE(20) !== fixture.height
      || bytes[24] !== 8 || ![0, 2, 3, 4, 6].includes(bytes[25])
      || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0
      || bytes.toString("hex", bytes.length - 12) !== "0000000049454e44ae426082") {
      throw new Error("Generated PNG does not match expected container/dimensions");
    }
    // Narrow structural contract, not a decoder guarantee: native playback
    // assertions still check the generated Canvas pixels after import.
    let offset = 8, hasPixels = false;
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) throw new Error("Generated PNG has truncated chunks");
      const length = bytes.readUInt32BE(offset);
      if (offset + length + 12 > bytes.length) throw new Error("Generated PNG has truncated chunks");
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (type === "IHDR" && offset !== 8) throw new Error("Generated PNG has duplicate IHDR");
      if ((bytes[offset + 4] & 32) === 0 && !["IHDR", "PLTE", "IDAT", "IEND"].includes(type)) throw new Error("Generated PNG has unknown critical chunk");
      if (type === "IDAT" && length > 0) hasPixels = true;
      if (type === "IEND" && offset + 12 !== bytes.length) throw new Error("Generated PNG has trailing chunks");
      offset += length + 12;
    }
    if (!hasPixels) throw new Error("Generated PNG has no pixel data");
    return;
  }
  const expected = typeof fixture === "string" && Object.hasOwn(mediaFixtureManifest, fixture) ? mediaFixtureManifest[fixture] : undefined;
  if (!expected) throw new Error("Fixture is absent from reviewed manifest");
  if (expected.mimeType !== mimeType) throw new Error("Fixture MIME type differs from reviewed manifest");
  if (expected.sizeBytes !== bytes.length) throw new Error("Fixture size differs from reviewed manifest");
  if (createHash("sha256").update(bytes).digest("hex") !== expected.sha256) throw new Error("Fixture SHA-256 differs from reviewed manifest");
}

export function validateFixtureDestination(ownedBase, destination = `${ownedBase}/assets/import`) {
  const base = new URL(ownedBase), target = new URL(destination);
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || !base.port || base.username || base.password
    || base.pathname !== "/" || base.search || base.hash || ownedBase !== base.origin
    || target.href !== `${base.origin}/assets/import`) {
    throw new Error("Fixture upload requires the exact owned loopback import destination");
  }
  return target.href;
}

export async function uploadMediaFixture({ ownedBase, destination, headers, bytes, name, mimeType, fixture }) {
  const url = validateFixtureDestination(ownedBase, destination);
  if (!Buffer.isBuffer(bytes)) throw new Error("Fixture must be a nonempty Buffer");
  const limit = fixture !== null && typeof fixture === "object" && fixture.kind === "generated-png" ? 64 * 1024 : maxTrackedBytes;
  if (bytes.length > limit) throw new Error("Fixture exceeds upload byte limit");
  // Copy once: validation and the network request use the same immutable snapshot.
  const snapshot = Buffer.from(bytes);
  validateMediaFixture({ bytes: snapshot, name, mimeType, fixture });
  return globalThis.fetch(url, {
    method: "POST", redirect: "error", signal: globalThis.AbortSignal.timeout(15_000),
    headers: { ...headers, "content-type": "application/octet-stream", "x-stream-jams-file-name": name, "x-stream-jams-mime-type": mimeType },
    body: snapshot
  });
}
