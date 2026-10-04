import { randomBytes } from "node:crypto";
import {
  desktopMediaOwnershipSchema, desktopMediaProtocolVersion, localMediaResourceLimits,
  trustedMediaGrantSchema,
  type DesktopMediaOwnership, type PrivateMediaReference, type TrustedMediaGrant
} from "@stream-jams/core";

const requestHeaders = ["range", "if-range", "if-match", "if-none-match"];
const responseHeaders = ["content-type", "content-length", "content-range", "etag", "accept-ranges"];
type Entry = { ownership: DesktopMediaOwnership; grant: TrustedMediaGrant; controllers: Set<AbortController>; expiry: ReturnType<typeof setTimeout> };
type ArtworkEntry = { ownerId: string; grant: { handle: string; expiresAt: number }; controllers: Set<AbortController>; expiry: ReturnType<typeof setTimeout> };
export interface PrivateMediaProtocolOptions {
  readonly scheme: "stream-jams-audio" | "stream-jams-overlay";
  readonly host: "player" | "surface";
  readonly trustedServiceOrigin: string;
  readonly generation: number;
  readonly recipientId: string;
  readonly fetch?: typeof fetch;
  readonly headerTimeoutMs?: number;
}

/** One registry per owning private session/generation. Caller installs handle on that session. */
export class PrivateMediaProtocol {
  #entries = new Map<string, Entry>();
  #artwork = new Map<string, ArtworkEntry>();
  #activeStreams = 0;
  #destroyed = false;
  readonly #origin: string;
  readonly #fetch: typeof fetch;
  constructor(private readonly options: PrivateMediaProtocolOptions) {
    const origin = new URL(options.trustedServiceOrigin);
    if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Private media requires the owned loopback service origin");
    if ((options.scheme === "stream-jams-audio") !== (options.host === "player")) throw new Error("Invalid private media origin");
    desktopMediaOwnershipSchema.parse({ generation: options.generation, recipientId: options.recipientId, ownerId: "validation" });
    this.#origin = origin.origin;
    this.#fetch = options.fetch ?? fetch;
  }
  issue(ownerId: string, candidate: TrustedMediaGrant): PrivateMediaReference {
    const ownership = desktopMediaOwnershipSchema.parse({ generation: this.options.generation, recipientId: this.options.recipientId, ownerId });
    const grant = trustedMediaGrantSchema.parse(candidate);
    if (this.#destroyed || grant.expiresAt <= Date.now()) throw new Error("Private media ownership is unavailable");
    for (const [handle, entry] of this.#entries) {
      if (entry.ownership.ownerId === ownerId && entry.grant.handle === grant.handle) {
        if (JSON.stringify(entry.grant.snapshot) !== JSON.stringify(grant.snapshot)) throw new Error("A renewed grant cannot change its pinned snapshot");
        clearTimeout(entry.expiry);
        entry.grant = grant;
        entry.expiry = setTimeout(() => this.revoke(handle), Math.min(2_147_483_647, grant.expiresAt - Date.now()));
        entry.expiry.unref();
        return { protocolVersion: desktopMediaProtocolVersion, snapshot: { ...entry.grant.snapshot }, handle };
      }
    }
    if (this.#entries.size >= localMediaResourceLimits.liveGrants) throw new Error("Private media grant capacity reached");
    const handle = `private_${randomBytes(32).toString("base64url")}`;
    const expiry = setTimeout(() => this.revoke(handle), Math.min(2_147_483_647, grant.expiresAt - Date.now()));
    expiry.unref();
    // Parse copied values: caller mutations cannot change the registered capability/snapshot.
    this.#entries.set(handle, { ownership, grant, controllers: new Set(), expiry });
    return { protocolVersion: desktopMediaProtocolVersion, snapshot: { ...grant.snapshot }, handle };
  }
  issueArtwork(ownerId: string, grant: { handle: string; expiresAt: number }): string {
    desktopMediaOwnershipSchema.parse({ generation: this.options.generation, recipientId: this.options.recipientId, ownerId });
    if (this.#destroyed || this.options.scheme !== "stream-jams-overlay" || !/^mart_[A-Za-z0-9_-]{43}$/.test(grant.handle) ||
      !Number.isSafeInteger(grant.expiresAt) || grant.expiresAt <= Date.now() || grant.expiresAt - Date.now() > 3_600_000) throw new Error("Private artwork grant is unavailable");
    if (this.#artwork.size >= 64) throw new Error("Private artwork grant capacity reached");
    const handle = `private_${randomBytes(32).toString("base64url")}`;
    const expiry = setTimeout(() => this.#revokeArtwork(handle), grant.expiresAt - Date.now());
    expiry.unref();
    this.#artwork.set(handle, { ownerId, grant: { ...grant }, controllers: new Set(), expiry });
    return handle;
  }
  url(reference: PrivateMediaReference): string {
    if (!this.#entries.has(reference.handle)) throw new Error("Unknown private media reference");
    return `${this.options.scheme}://${this.options.host}/media/${reference.handle}`;
  }
  revoke(handle: string): void {
    const entry = this.#entries.get(handle);
    if (!entry) return;
    this.#entries.delete(handle);
    clearTimeout(entry.expiry);
    for (const controller of entry.controllers) controller.abort();
  }
  revokeOwner(ownerId: string): void {
    for (const [handle, entry] of this.#entries) if (entry.ownership.ownerId === ownerId) this.revoke(handle);
    for (const [handle, entry] of this.#artwork) if (entry.ownerId === ownerId) this.#revokeArtwork(handle);
  }
  destroy(): void {
    this.#destroyed = true;
    for (const handle of this.#entries.keys()) this.revoke(handle);
    for (const handle of this.#artwork.keys()) this.#revokeArtwork(handle);
  }
  #revokeArtwork(handle: string): void {
    const entry = this.#artwork.get(handle);
    if (entry === undefined) return;
    this.#artwork.delete(handle); clearTimeout(entry.expiry);
    for (const controller of entry.controllers) controller.abort();
  }
  get diagnostics(): { liveGrants: number; activeStreams: number } {
    return { liveGrants: this.#entries.size, activeStreams: this.#activeStreams };
  }
  async handle(request: Request): Promise<Response> {
    const fail = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    let url: URL;
    try { url = new URL(request.url); }
    // error-provenance: allow expected -- malformed private requests fail closed without disclosing grants
    catch { return fail(404); }
    if (url.protocol === "stream-jams-overlay:" && url.hostname === "surface" && /^\/music-artwork\/private_[A-Za-z0-9_-]{43}$/.test(url.pathname)) {
      if (this.#destroyed || request.method !== "GET" || url.search || url.hash) return fail(404);
      const handle = url.pathname.slice("/music-artwork/".length);
      const entry = this.#artwork.get(handle);
      if (entry === undefined || entry.grant.expiresAt <= Date.now()) return fail(404);
      const controller = new AbortController(); entry.controllers.add(controller);
      const onAbort = () => controller.abort(); request.signal.addEventListener("abort", onAbort, { once: true });
      try {
        const upstream = await this.#fetch(`${this.#origin}/media/music-artwork/${entry.grant.handle}`, { redirect: "error", signal: controller.signal });
        const mime = upstream.headers.get("content-type");
        if (controller.signal.aborted || upstream.status !== 200 || !["image/png", "image/jpeg", "image/webp"].includes(mime ?? "") ||
          upstream.headers.get("content-encoding") !== null) { await upstream.body?.cancel(); return fail(404); }
        if (Number(upstream.headers.get("content-length") ?? 0) > 2 * 1024 * 1024 || upstream.body === null) { await upstream.body?.cancel(); return fail(404); }
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of upstream.body) {
          size += chunk.byteLength;
          if (controller.signal.aborted || size > 2 * 1024 * 1024) { controller.abort(); return fail(404); }
          chunks.push(chunk);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return new Response(bytes, { headers: { "Content-Type": mime!, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
      } catch { return fail(404); }
      finally { entry.controllers.delete(controller); request.signal.removeEventListener("abort", onAbort); }
    }
    if (this.#destroyed || !["GET", "HEAD"].includes(request.method) || url.protocol !== `${this.options.scheme}:` ||
      url.hostname !== this.options.host || url.port || url.username || url.password || url.search || url.hash ||
      !/^\/media\/private_[A-Za-z0-9_-]{43}$/.test(url.pathname)) return fail(404);
    const entry = this.#entries.get(url.pathname.slice("/media/".length));
    if (!entry || entry.grant.expiresAt <= Date.now()) return fail(404);
    if (this.#activeStreams >= localMediaResourceLimits.activeStreams) return fail(503);
    const controller = new AbortController();
    entry.controllers.add(controller);
    this.#activeStreams++;
    let done = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      entry.controllers.delete(controller);
      this.#activeStreams--;
      request.signal.removeEventListener("abort", abort);
      controller.signal.removeEventListener("abort", cancelled);
    };
    const abort = () => controller.abort();
    const cancelled = () => {
      void reader?.cancel().catch(
        // error-provenance: allow cleanup -- cancellation is best effort after authoritative upstream abort
        () => undefined
      );
      finish();
    };
    request.signal.addEventListener("abort", abort, { once: true });
    controller.signal.addEventListener("abort", cancelled, { once: true });
    if (request.signal.aborted) controller.abort();
    const headers = new Headers();
    for (const name of requestHeaders) {
      const value = request.headers.get(name);
      if (value !== null && value.length <= 8192) headers.set(name, value);
    }
    const timeout = setTimeout(abort, this.options.headerTimeoutMs ?? 15_000);
    try {
      const upstream = await this.#fetch(`${this.#origin}/media/${entry.grant.handle}`, {
        method: request.method, headers, redirect: "error", signal: controller.signal
      });
      clearTimeout(timeout);
      if (controller.signal.aborted) { await upstream.body?.cancel(); return fail(502); }
      if (![200, 206, 304, 416].includes(upstream.status) || upstream.headers.get("content-encoding") !== null) {
        controller.abort(); await upstream.body?.cancel(); return fail(502);
      }
      const forwarded = new Headers({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
      for (const name of responseHeaders) { const value = upstream.headers.get(name); if (value !== null) forwarded.set(name, value); }
      if (request.method === "HEAD" || upstream.body === null || upstream.status === 304 || upstream.status === 416) {
        await upstream.body?.cancel(); finish();
        return new Response(null, { status: upstream.status, headers: forwarded });
      }
      reader = upstream.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        pull: async output => {
          try {
            const next = await reader!.read();
            if (next.done) { finish(); output.close(); }
            else output.enqueue(next.value);
          } catch (error) { finish(); output.error(error); }
        },
        cancel: async () => {
          controller.abort();
          await reader!.cancel().catch(
            // error-provenance: allow cleanup -- cancellation is best effort after authoritative upstream abort
            () => undefined
          );
          finish();
        }
      }, { highWaterMark: 0 });
      return new Response(body, { status: upstream.status, headers: forwarded });
    }
    // error-provenance: allow expected -- capability reads fail closed with no upstream URL or credential diagnostic
    catch {
      controller.abort(); finish(); return fail(502);
    } finally { clearTimeout(timeout); }
  }
}
