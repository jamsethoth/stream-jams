import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { Readable } from "node:stream";
import { createDefaultMusicModuleConfig, projectMusicWidget } from "@stream-jams/core";
import { MusicArtworkService, collectBoundedBody, fetchPinnedBytes, isPublicAddress, validateRaster } from "./music-artwork-service.js";

const owner = { providerId: "pear", generation: "one" };
const url = "https://i.ytimg.com/vi/abc/default.jpg";
const raster = await sharp({ create: { width: 2, height: 3, channels: 4, background: "red" } }).png().toBuffer();

function fixture(overrides: Partial<ConstructorParameters<typeof MusicArtworkService>[0]> = {}) {
  let current = true;
  const fetchBytes = vi.fn(async () => raster);
  const service = new MusicArtworkService({ isCurrentOwner: () => current, resolveAddresses: async () => ["8.8.8.8"], fetchBytes, ...overrides });
  return { service, fetchBytes, setCurrent(value: boolean) { current = value; } };
}

describe("MusicArtworkService", () => {
  it("admits only approved HTTPS hosts, no userinfo, and decoded raster bytes", async () => {
    const { service, fetchBytes } = fixture();
    for (const invalid of ["http://i.ytimg.com/a", "https://user@i.ytimg.com/a", "https://example.org/a", "https://i.ytimg.com.evil.org/a", "https://127.0.0.1/a", "https://i.ytimg.com:444/a"]) {
      expect(await service.resolve({ url: invalid }, owner, new AbortController().signal)).toBeNull();
    }
    expect(fetchBytes).not.toHaveBeenCalled();
    const ref = await service.resolve({ url }, owner, new AbortController().signal);
    expect(ref).toMatch(/^art_/);
    expect(await service.read(ref!, owner)).toEqual({ bytes: Uint8Array.from(raster), mimeType: "image/png" });
    expect(await service.read(ref!, { ...owner, generation: "other" })).toBeNull();
  });

  it("rejects every unsafe DNS answer and does not connect", async () => {
    const { service, fetchBytes } = fixture({ resolveAddresses: async () => ["8.8.8.8", "127.0.0.1"] });
    expect(await service.resolve({ url }, owner, new AbortController().signal)).toBeNull();
    expect(fetchBytes).not.toHaveBeenCalled();
    for (const address of ["10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.0.1", "127.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "192.0.2.1", "2001:db8::1", "2001:0db8:0:0:0:0:0:1", "2002:c0a8:0101::", "2001:0:192:168::", "3fff::1"]) expect(isPublicAddress(address)).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });

  it("rejects oversize, malformed and oversized-dimension images", async () => {
    expect(await validateRaster(Buffer.from("<svg></svg>"))).toBeNull();
    expect(await validateRaster(raster.subarray(0, 15))).toBeNull();
    const large = await sharp({ create: { width: 4097, height: 1, channels: 4, background: "red" } }).png().toBuffer();
    expect(await validateRaster(large)).toBeNull();
    for (const data of [new Uint8Array(2 * 1024 * 1024 + 1), Buffer.from("garbage")]) {
      const { service } = fixture({ fetchBytes: async () => data });
      expect(await service.resolve({ url }, owner, new AbortController().signal)).toBeNull();
    }
  });

  it("keeps safe track text available when artwork fetch fails", async () => {
    const { service } = fixture({ fetchBytes: async () => { throw new Error("offline"); } });
    const art = await service.resolve({ url }, owner, new AbortController().signal);
    expect(art).toBeNull();
    const projection = projectMusicWidget({ providerId: owner.providerId, generation: owner.generation, revision: 1,
      track: { id: "song", title: "Safe title", artists: ["Safe artist"], album: null, artworkRef: art },
      playbackState: "playing", positionMs: null, durationMs: null, observedAtEpochMs: 1000, session: null },
    { state: "connected", stale: false, diagnosticReference: null }, createDefaultMusicModuleConfig(), "landscape", 1000, 1000);
    expect(projection?.snapshot.track).toMatchObject({ title: "Safe title", artists: ["Safe artist"], artworkRef: null });
  });

  it("rejects cancellation and obsolete generation completion", async () => {
    let finish!: (bytes: Uint8Array) => void;
    const pending = new Promise<Uint8Array>(resolve => { finish = resolve; });
    const { service, setCurrent } = fixture({ fetchBytes: async () => pending });
    const controller = new AbortController();
    const first = service.resolve({ url }, owner, controller.signal);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    controller.abort(); finish(raster);
    expect(await first).toBeNull();
    const second = service.resolve({ url }, owner, new AbortController().signal);
    setCurrent(false); finish(raster);
    expect(await second).toBeNull();
    expect(service.counts.entries).toBe(0);
  });

  it("bounds in-flight fetches and aborts only the cleared generation", async () => {
    const controllers: AbortSignal[] = [];
    const service = new MusicArtworkService({
      isCurrentOwner: () => true,
      resolveAddresses: async () => ["8.8.8.8"],
      fetchBytes: async (_url, _address, signal) => { controllers.push(signal); return new Promise<Uint8Array>(() => {}); }
    });
    const requests = Array.from({ length: 8 }, (_, index) => service.resolve({ url: `${url}?${index}` }, owner, new AbortController().signal));
    await vi.waitFor(() => expect(controllers.length).toBe(8));
    expect(await service.resolve({ url: `${url}?extra` }, owner, new AbortController().signal)).toBeNull();
    expect(await service.resolve({ url }, { ...owner, generation: "other" }, new AbortController().signal)).toBeNull();
    await service.clearGeneration(owner);
    expect(controllers.every(signal => signal.aborted)).toBe(true);
    expect(await Promise.all(requests)).toEqual(Array(8).fill(null));
  });

  it("drops a cached image when the active track changes within the same generation", async () => {
    let currentUrl = url;
    const { service } = fixture({ isCurrentDescriptor: descriptor => descriptor === currentUrl });
    const ref = await service.resolve({ url }, owner, new AbortController().signal);
    currentUrl = `${url}?next`;
    expect(await service.read(ref!, owner)).toBeNull();
    expect(service.issueGrant(ref!, owner, "desktop-music", Date.now() + 1000)).toBeNull();
  });

  it("evicts after 32 items and clears generation plus its private grants", async () => {
    const { service } = fixture();
    const refs: string[] = [];
    for (let index = 0; index < 33; index++) refs.push((await service.resolve({ url: `${url}?n=${index}` }, owner, new AbortController().signal))!);
    expect(service.counts.entries).toBe(32);
    expect(await service.read(refs[0]!, owner)).toBeNull();
    const handle = service.issueGrant(refs[1]!, owner, "desktop-music", Date.now() + 1000)!;
    expect(await service.readGrant(handle, "desktop-other")).toBeNull();
    expect(await service.readGrant(handle, "desktop-music")).not.toBeNull();
    await service.clearGeneration(owner);
    expect(service.counts).toEqual({ entries: 0, bytes: 0 });
    expect(await service.readGrant(handle, "desktop-music")).toBeNull();
  });

  it("enforces the 16 MiB cache cap and grant expiry", async () => {
    let clock = 1000;
    const noisy = await sharp(randomBytes(1024 * 1024 * 3), { raw: { width: 1024, height: 1024, channels: 3 } }).jpeg({ quality: 84 }).toBuffer();
    expect(noisy.byteLength).toBeGreaterThan(512 * 1024);
    expect(noisy.byteLength).toBeLessThan(2 * 1024 * 1024);
    const { service } = fixture({ now: () => clock, fetchBytes: async () => noisy });
    const ref = await service.resolve({ url }, owner, new AbortController().signal);
    for (let index = 0; index < 32; index++) await service.resolve({ url: `${url}?${index}` }, owner, new AbortController().signal);
    expect(service.counts.bytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(service.counts.entries).toBeLessThan(32);
    const current = await service.resolve({ url: `${url}?last` }, owner, new AbortController().signal);
    const handle = service.issueGrant(current!, owner, "desktop-music", 1100)!;
    clock = 1100;
    expect(await service.readGrant(handle, "desktop-music")).toBeNull();
    expect(service.issueGrant(current!, owner, "overlay", 1200)).toBeNull();
    expect(ref).not.toBeNull();
  });

  it("bounds streamed bodies before buffering the remainder", async () => {
    await expect(collectBoundedBody(Readable.from([Buffer.alloc(2 * 1024 * 1024), Buffer.from([1])]))).rejects.toThrow("Artwork too large");
  });

  it("pins the actual socket destination while retaining the HTTPS hostname and TLS checks", async () => {
    let hits = 0;
    const server = createServer(socket => { hits++; socket.destroy(); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Missing fixture address");
      const error = await fetchPinnedBytes(new URL(`https://i.ytimg.com:${address.port}/art`), "127.0.0.1", AbortSignal.timeout(1000)).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(Error);
      expect(hits, String(error)).toBe(1);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
