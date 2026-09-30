import type { FastifyReply, FastifyRequest } from "fastify";

/** Existing authorization must run before this helper sees asset bytes. */
export function sendMediaBytes(request: FastifyRequest, reply: FastifyReply, bytes: Buffer, mimeType: string): FastifyReply {
  reply.header("accept-ranges", "bytes").header("x-content-type-options", "nosniff").type(mimeType);
  // No representation validator is advertised, so If-Range cannot be satisfied.
  const range = request.method === "GET" && request.headers["if-range"] === undefined
    ? parseByteRange(request.headers.range, bytes.length) : null;
  if (range === "unsatisfiable") {
    return reply.code(416).header("content-range", `bytes */${bytes.length}`).header("content-length", "0").send(Buffer.alloc(0));
  }
  if (range !== null) {
    return reply.code(206).header("content-range", `bytes ${range.start}-${range.end}/${bytes.length}`)
      .header("content-length", String(range.end - range.start + 1)).send(bytes.subarray(range.start, range.end + 1));
  }
  // Fastify strips a HEAD payload while retaining the GET representation length.
  return reply.header("content-length", String(bytes.length)).send(bytes);
}

function parseByteRange(header: string | undefined, length: number): { start: number; end: number } | "unsatisfiable" | null {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (match === undefined || match === null || (match[1] === "" && match[2] === "")) return null;
  const size = BigInt(length);
  if (match[1] === "") {
    const suffix = BigInt(match[2]!);
    if (suffix === 0n || size === 0n) return "unsatisfiable";
    return { start: Number(suffix >= size ? 0n : size - suffix), end: length - 1 };
  }
  const start = BigInt(match[1]!);
  const end = match[2] === "" ? null : BigInt(match[2]!);
  if (end !== null && end < start) return null;
  if (start >= size) return "unsatisfiable";
  return { start: Number(start), end: end === null || end >= size ? length - 1 : Number(end) };
}
