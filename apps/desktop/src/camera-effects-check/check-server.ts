import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { readdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, relative, sep } from "node:path";

/* Node-side HTTP helpers for the camera effects check's local server. */

/** Pages live under `/<token>/`, so relative script, WASM and model URLs carry the token too. */
export function pathAfterToken(pathname: string, token: string): string | null {
  const match = /^\/([A-Za-z0-9_-]{16,64})(\/.*)$/u.exec(pathname);
  if (match === null) return null;
  const given = Buffer.from(match[1]!);
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected) ? match[2]! : null;
}

const contentTypes: Readonly<Record<string, string>> = {
  ".js": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".tflite": "application/octet-stream"
};

/**
 * The servable files under the built `app` directory, keyed by URL path. Only these exact
 * paths are served, so a request can never reach outside the directory.
 */
export async function staticFiles(directory: string): Promise<Map<string, { readonly path: string; readonly type: string }>> {
  const files = new Map<string, { readonly path: string; readonly type: string }>();
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    const type = contentTypes[extname(entry.name)];
    if (type !== undefined) files.set(`/app/${relative(directory, path).split(sep).join("/")}`, { path, type });
  }
  return files;
}

export class CheckInputError extends Error {}

const maximumBodyBytes = 64 * 1024;

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).byteLength;
    if (size > maximumBodyBytes) throw new CheckInputError("Body too large");
    chunks.push(chunk as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch (error) { throw new CheckInputError("Expected JSON", { cause: error }); }
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

export function sendHtml(response: ServerResponse, body: string): void {
  // The token is in the path; never leak it in a Referer.
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" });
  response.end(body);
}
