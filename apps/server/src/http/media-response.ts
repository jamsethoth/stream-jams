import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import fresh from "fresh";
import parseRange from "range-parser";
import type { AssetRecord } from "@stream-jams/core";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { LocalAssetStore } from "../modules/assets/local-asset-store.js";

/** Authorization and registered-asset resolution must precede this boundary. */
export async function sendMediaFile(request: FastifyRequest, reply: FastifyReply, store: Pick<LocalAssetStore, "openRead">, asset: AssetRecord, signal?: AbortSignal): Promise<FastifyReply> {
  signal?.throwIfAborted();
  const opened = await store.openRead(asset.storagePath, asset.sizeBytes);
  try {
    signal?.throwIfAborted();
    // Hash the registered identity, not the media body; this is a validator, not fresh integrity verification.
    const etag = `"${createHash("sha256").update(asset.storagePath).update("\0").update(asset.checksum).digest("hex")}"`;
    reply.header("accept-ranges", "bytes").header("etag", etag).header("cache-control", "no-store")
      .header("x-content-type-options", "nosniff").type(asset.mimeType);
    const ifMatch = request.headers["if-match"];
    if (ifMatch !== undefined && ifMatch !== "*" && !strongMatch(ifMatch, etag)) {
      await opened.close();
      return await reply.code(412).header("content-length", "0").send();
    }
    const ifNoneMatch = request.headers["if-none-match"];
    if (ifNoneMatch !== undefined && fresh({ "if-none-match": ifNoneMatch }, { etag })) {
      await opened.close();
      return await reply.code(304).send();
    }
    // No Last-Modified is advertised: date conditions cannot validate this representation.
    const range = request.method === "GET" && (request.headers["if-range"] === undefined || request.headers["if-range"] === etag)
      ? singleRange(request.headers.range, opened.sizeBytes) : null;
    if (range === -1) {
      await opened.close();
      return await reply.code(416).header("content-range", `bytes */${opened.sizeBytes}`).header("content-length", "0").send();
    }
    if (range !== null) reply.code(206).header("content-range", `bytes ${range.start}-${range.end}/${opened.sizeBytes}`);
    reply.header("content-length", String(range === null ? opened.sizeBytes : range.end - range.start + 1));
    if (request.method === "HEAD" || opened.sizeBytes === 0) {
      await opened.close();
      return await reply.send(Readable.from([]));
    }
    const stream = opened.handle.createReadStream({ highWaterMark: 64 * 1024, start: range?.start ?? 0, end: range?.end ?? opened.sizeBytes - 1, ...(signal === undefined ? {} : { signal }) });
    return await reply.send(stream);
  } finally {
    await opened.close();
  }
}

function strongMatch(header: string, etag: string): boolean {
  // Consume whole entity-tags, so a comma inside an opaque tag cannot produce a false match.
  const tags = header.match(/(?:W\/)?"[^"\r\n]*"/g) ?? [];
  return tags.some(tag => tag === etag);
}

function singleRange(header: string | undefined, length: number): parseRange.Range | -1 | null {
  // Restrict syntax before the deliberately permissive library parser; arithmetic remains library-owned.
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (match === undefined || match === null || (match[1] === "" && match[2] === "")) return null;
  const start = match[1] === "" ? null : BigInt(match[1]!);
  const end = match[2] === "" ? null : BigInt(match[2]!);
  if (start !== null && end !== null && end < start) return null;
  if (length === 0 || (start !== null && start >= BigInt(length)) || (start === null && end === 0n)) return -1;
  // Clamp oversized endpoints/suffixes before converting to JS numbers.
  const last = end === null ? "" : String(end > BigInt(length) ? length : Number(end));
  const parsed = parseRange(length, `bytes=${start ?? ""}-${last}`);
  return typeof parsed === "number" ? (parsed === -1 ? -1 : null) : parsed[0] ?? null;
}
