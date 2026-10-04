import { randomBytes } from "node:crypto";
import { resolve4, resolve6 } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import type { Readable } from "node:stream";
import sharp from "sharp";
import type { PrivateArtworkDescriptor } from "./pear-normalization.js";

export interface MusicArtworkOwner { readonly providerId: string; readonly generation: string; }
export interface MusicArtworkRead { readonly bytes: Uint8Array; readonly mimeType: "image/png" | "image/jpeg" | "image/webp"; }
export interface MusicArtworkServiceOptions {
  readonly isCurrentOwner: (owner: MusicArtworkOwner) => boolean;
  readonly isCurrentDescriptor?: (url: string, owner: MusicArtworkOwner) => boolean;
  readonly resolveAddresses?: (hostname: string) => Promise<readonly string[]>;
  readonly fetchBytes?: (url: URL, address: string, signal: AbortSignal) => Promise<Uint8Array>;
  readonly now?: () => number;
}

const maxBytes = 2 * 1024 * 1024;
const maxCacheBytes = 16 * 1024 * 1024;
const maxEntries = 32;
const maxPending = 8;
const maxGrants = 64;
const hosts = new Set(["i.ytimg.com", "lh3.googleusercontent.com"]);

interface Entry extends MusicArtworkRead { readonly owner: MusicArtworkOwner; readonly url: string; }
interface Grant { readonly ref: string; readonly owner: MusicArtworkOwner; readonly recipient: string; readonly expiresAt: number; }

/** Ephemeral decoded provider art. Neither descriptors nor bytes enter the asset repository. */
export class MusicArtworkService {
  readonly #entries = new Map<string, Entry>();
  readonly #grants = new Map<string, Grant>();
  readonly #pending = new Map<string, { readonly owner: MusicArtworkOwner; readonly controller: AbortController }>();
  readonly #options: MusicArtworkServiceOptions;
  #cacheBytes = 0;

  constructor(options: MusicArtworkServiceOptions) { this.#options = options; }

  get counts(): { readonly entries: number; readonly bytes: number } { return { entries: this.#entries.size, bytes: this.#cacheBytes }; }

  async resolve(descriptor: PrivateArtworkDescriptor, owner: MusicArtworkOwner, signal: AbortSignal): Promise<string | null> {
    if (!this.#options.isCurrentOwner(owner) || signal.aborted) return null;
    const url = parseArtworkUrl(descriptor.url);
    if (url === null || !this.#isCurrentDescriptor(url.href, owner)) return null;
    for (const [ref, entry] of this.#entries) {
      if (sameOwner(entry.owner, owner) && entry.url === url.href) {
        this.#entries.delete(ref); this.#entries.set(ref, entry);
        return ref;
      }
    }
    const key = JSON.stringify([owner.providerId, owner.generation, url.href]);
    if (this.#pending.has(key) || this.#pending.size >= maxPending) return null;
    const controller = new AbortController();
    this.#pending.set(key, { owner, controller });
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), 5_000);
    timeout.unref();
    try {
      const addresses = await withAbort((this.#options.resolveAddresses ?? resolvePublicAddresses)(url.hostname), controller.signal);
      if (addresses.length === 0 || addresses.some(address => !isPublicAddress(address))) return null;
      controller.signal.throwIfAborted();
      const bytes = await withAbort((this.#options.fetchBytes ?? fetchPinnedBytes)(url, addresses[0]!, controller.signal), controller.signal);
      if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) return null;
      const image = await validateRaster(bytes);
      if (image === null || controller.signal.aborted || signal.aborted || !this.#options.isCurrentOwner(owner)
        || !this.#isCurrentDescriptor(url.href, owner)) return null;
      const ref = `art_${randomBytes(24).toString("base64url")}`;
      this.#entries.set(ref, { ...image, owner, url: url.href });
      this.#cacheBytes += image.bytes.byteLength;
      this.#evict();
      return ref;
    } catch { return null; }
    finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      this.#pending.delete(key);
    }
  }

  async read(ref: string, owner: MusicArtworkOwner): Promise<MusicArtworkRead | null> {
    if (!this.#options.isCurrentOwner(owner)) return null;
    const entry = this.#entries.get(ref);
    if (entry === undefined || !sameOwner(entry.owner, owner) || !this.#isCurrentDescriptor(entry.url, owner)) return null;
    this.#entries.delete(ref); this.#entries.set(ref, entry);
    return { bytes: entry.bytes, mimeType: entry.mimeType };
  }

  /** Private desktop recipient handles are short lived and never authorize management or another output. */
  issueGrant(ref: string, owner: MusicArtworkOwner, recipient: string, expiresAt: number): string | null {
    const now = (this.#options.now ?? Date.now)();
    for (const [handle, grant] of this.#grants) if (grant.expiresAt <= now) this.#grants.delete(handle);
    if (!this.#options.isCurrentOwner(owner) || !this.#entries.has(ref) || !sameOwner(this.#entries.get(ref)!.owner, owner)
      || !this.#isCurrentDescriptor(this.#entries.get(ref)!.url, owner)
      || recipient !== "desktop-music:desktop:primary" || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt - now > 3_600_000) return null;
    for (const [handle, grant] of this.#grants) if (grant.ref === ref && grant.recipient === recipient && sameOwner(grant.owner, owner)) {
      this.#grants.set(handle, { ...grant, expiresAt });
      return handle;
    }
    if (this.#grants.size >= maxGrants) return null;
    const handle = `mart_${randomBytes(32).toString("base64url")}`;
    this.#grants.set(handle, { ref, owner, recipient, expiresAt });
    return handle;
  }

  async readGrant(handle: string, recipient: string): Promise<MusicArtworkRead | null> {
    const grant = this.#grants.get(handle);
    if (grant === undefined || grant.recipient !== recipient) return null;
    if (grant.expiresAt <= (this.#options.now ?? Date.now)()) { this.#grants.delete(handle); return null; }
    const image = await this.read(grant.ref, grant.owner);
    if (image === null) this.#grants.delete(handle);
    return image;
  }

  async clearGeneration(owner: MusicArtworkOwner): Promise<void> {
    for (const pending of this.#pending.values()) if (sameOwner(pending.owner, owner)) pending.controller.abort();
    for (const [ref, entry] of this.#entries) if (sameOwner(entry.owner, owner)) this.#remove(ref);
    for (const [handle, grant] of this.#grants) if (sameOwner(grant.owner, owner)) this.#grants.delete(handle);
  }

  revokeRecipient(recipient: string): void {
    for (const [handle, grant] of this.#grants) if (grant.recipient === recipient) this.#grants.delete(handle);
  }

  #remove(ref: string): void {
    const entry = this.#entries.get(ref);
    if (entry === undefined) return;
    this.#cacheBytes -= entry.bytes.byteLength;
    this.#entries.delete(ref);
    for (const [handle, grant] of this.#grants) if (grant.ref === ref) this.#grants.delete(handle);
  }
  #evict(): void {
    while (this.#entries.size > maxEntries || this.#cacheBytes > maxCacheBytes) this.#remove(this.#entries.keys().next().value!);
  }
  #isCurrentDescriptor(url: string, owner: MusicArtworkOwner): boolean {
    return this.#options.isCurrentDescriptor?.(url, owner) ?? true;
  }
}

function withAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted)).catch(() => {});
  });
}

function sameOwner(left: MusicArtworkOwner, right: MusicArtworkOwner): boolean {
  return left.providerId === right.providerId && left.generation === right.generation;
}

function parseArtworkUrl(input: string): URL | null {
  if (input.length > 4096) return null;
  try {
    const url = new URL(input);
    return url.protocol === "https:" && hosts.has(url.hostname) && !url.username && !url.password && url.port === "" ? url : null;
  } catch { return null; }
}

async function resolvePublicAddresses(host: string): Promise<readonly string[]> {
  const results = await Promise.allSettled([resolve4(host), resolve6(host)]);
  const addresses = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  return addresses;
}

/** Permit globally routable v4 and v6 only; reject every special/reserved range conservatively. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return a !== undefined && b !== undefined && c !== undefined
      && a > 0 && a < 224 && a !== 10 && a !== 127
      && !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254)
      && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0 || b === 88))
      && !(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      && !(a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) !== 6) return false;
  const lower = address.toLowerCase();
  // Global unicast 2000::/3, excluding documentation and IPv4-mapped forms.
  const parts = lower.split(":");
  const first = Number.parseInt(parts[0] ?? "", 16);
  const second = Number.parseInt(parts[1] ?? "0", 16) || 0;
  return Number.isFinite(first) && first >= 0x2000 && first < 0x3fff
    && first !== 0x2002 && !(first === 0x2001 && (second <= 0x01ff || second === 0x0db8));
}

export async function validateRaster(bytes: Uint8Array): Promise<MusicArtworkRead | null> {
  const signature = Buffer.from(bytes.subarray(0, 12));
  const kind = signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png"
    : signature.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? "jpeg"
    : signature.toString("ascii", 0, 4) === "RIFF" && signature.toString("ascii", 8, 12) === "WEBP" ? "webp" : null;
  if (kind === null) return null;
  try {
    const decoder = sharp(bytes, { limitInputPixels: 4096 * 4096, failOn: "warning", animated: false });
    const metadata = await decoder.metadata();
    if (metadata.format !== kind || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || (metadata.pages ?? 1) > 1) return null;
    await decoder.raw().toBuffer();
    return { bytes: Uint8Array.from(bytes), mimeType: kind === "jpeg" ? "image/jpeg" : kind === "png" ? "image/png" : "image/webp" };
  } catch { return null; }
}

export function fetchPinnedBytes(url: URL, address: string, signal: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", signal, agent: false,
      lookup: (_hostname, options, callback) => {
        const family = isIP(address);
        if (options.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      }, headers: { accept: "image/png,image/jpeg,image/webp" } }, response => {
      if (response.statusCode !== 200) { response.destroy(); reject(new Error("Artwork HTTP response rejected")); return; }
      void collectBoundedBody(response).then(resolve, (error: unknown) => { req.destroy(); reject(error); });
    });
    req.on("error", reject);
    req.end();
  });
}

export async function collectBoundedBody(stream: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.byteLength;
    if (size > maxBytes) throw new Error("Artwork too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
