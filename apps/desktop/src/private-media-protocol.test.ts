import { describe, expect, it, vi } from "vitest";
import { PrivateMediaProtocol } from "./private-media-protocol.js";

const grant = () => ({ snapshot: { assetId: "video", version: "a".repeat(64), mimeType: "video/mp4" as const, sizeBytes: 100_000_000, durationMs: 60_000 }, handle: `med_${"a".repeat(43)}`, expiresAt: Date.now() + 60_000 });
function create(fetcher: typeof fetch = vi.fn(async () => new Response("media"))) {
  return new PrivateMediaProtocol({ scheme: "stream-jams-audio", host: "player", trustedServiceOrigin: "http://127.0.0.1:1234", generation: 1, recipientId: "audio-player", fetch: fetcher });
}
describe("private media protocol", () => {
  it("proxies private Music artwork only for its owned surface and revokes on hiding", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } }));
    const adapter = new PrivateMediaProtocol({ scheme: "stream-jams-overlay", host: "surface", trustedServiceOrigin: "http://127.0.0.1:1234",
      generation: 1, recipientId: "desktop:primary", fetch: fetcher });
    const source = { handle: `mart_${"a".repeat(43)}`, expiresAt: Date.now() + 60_000 };
    const handle = adapter.issueArtwork("music-revision", source);
    const url = `stream-jams-overlay://surface/music-artwork/${handle}`;
    expect(handle).not.toContain("mart_");
    expect((await adapter.handle(new Request(url))).status).toBe(200);
    expect(fetcher).toHaveBeenCalledWith(`http://127.0.0.1:1234/media/music-artwork/${source.handle}`, expect.objectContaining({ redirect: "error" }));
    expect((await adapter.handle(new Request(url.replace("surface", "wrong-output")))).status).toBe(404);
    adapter.revokeOwner("music-revision");
    expect((await adapter.handle(new Request(url))).status).toBe(404);
    adapter.destroy();
  });
  it("forwards only range/validators to its fixed origin with a distinct private handle", async () => {
    const fetcher = vi.fn(async () => new Response("part", { status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-3/100", "Set-Cookie": "secret", "Access-Control-Allow-Origin": "*" } }));
    const adapter = create(fetcher);
    const ref = adapter.issue("playback", grant());
    const response = await adapter.handle(new Request(adapter.url(ref), { headers: { Range: "bytes=0-3", Authorization: "secret", Cookie: "secret", "X-Arbitrary": "no" } }));
    expect(ref.handle).not.toContain("med_");
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-3/100");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:1234/media/${grant().handle}`);
    expect(init.redirect).toBe("error");
    expect([...new Headers(init.headers).keys()]).toEqual(["range"]);
    expect(await response.text()).toBe("part");
    expect(adapter.diagnostics.activeStreams).toBe(0);
    adapter.destroy();
  });
  it("rejects foreign sessions, methods, paths and URLs before any upstream request", async () => {
    const fetcher = vi.fn(async () => new Response(null));
    const adapter = create(fetcher);
    const ref = adapter.issue("playback", grant());
    const url = adapter.url(ref);
    const other = create(fetcher);
    expect((await other.handle(new Request(url))).status).toBe(404);
    for (const bad of [url.replace("player", "other"), `${url}?host=evil`, `${url}#fragment`, "http://127.0.0.1/media/file", url.replace("/media/", "/file/")]) {
      expect((await adapter.handle(new Request(bad))).status).toBe(404);
    }
    expect((await adapter.handle(new Request(url, { method: "POST" }))).status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
    adapter.destroy(); other.destroy();
  });
  it("HEAD preserves representation headers with no body", async () => {
    const adapter = create(vi.fn(async () => new Response(null, { headers: { "Content-Length": "100000000" } })));
    const ref = adapter.issue("owner", grant());
    const response = await adapter.handle(new Request(adapter.url(ref), { method: "HEAD" }));
    expect(response.headers.get("Content-Length")).toBe("100000000");
    expect(response.body).toBeNull();
    expect(adapter.diagnostics.activeStreams).toBe(0); adapter.destroy();
  });
  it("cancels upstream on body detach and owner revocation even without Electron request abort", async () => {
    const signals: AbortSignal[] = [];
    const cancelled = vi.fn();
    const adapter = create(vi.fn(async (_url, init) => {
      signals.push(init!.signal as AbortSignal);
      return new Response(new ReadableStream({ cancel: cancelled }));
    }));
    const ref = adapter.issue("owner", grant());
    const url = adapter.url(ref);
    const first = await adapter.handle(new Request(url));
    const second = await adapter.handle(new Request(adapter.url(ref)));
    expect(adapter.diagnostics.activeStreams).toBe(2);
    await first.body!.cancel();
    expect(signals[0]!.aborted).toBe(true);
    expect(adapter.diagnostics.activeStreams).toBe(1);
    adapter.revokeOwner("owner");
    expect(signals[1]!.aborted).toBe(true);
    expect(adapter.diagnostics).toEqual({ liveGrants: 0, activeStreams: 0 });
    expect((await adapter.handle(new Request(url))).status).toBe(404);
    await second.body!.cancel();
    expect(cancelled).toHaveBeenCalledTimes(2);
  });
  it("rejects upstream redirects/errors/compression and untrusted service origins", async () => {
    for (const response of [new Response(null, { status: 302 }), new Response(null, { status: 401 }), new Response("media", { headers: { "Content-Encoding": "gzip" } })]) {
      const adapter = create(vi.fn(async () => response));
      const ref = adapter.issue("owner", grant());
      expect((await adapter.handle(new Request(adapter.url(ref)))).status).toBe(502);
      expect(adapter.diagnostics.activeStreams).toBe(0); adapter.destroy();
    }
    for (const origin of ["http://example.com", "http://127.0.0.1/path", "http://user:secret@127.0.0.1", "https://127.0.0.1"]) {
      expect(() => new PrivateMediaProtocol({ scheme: "stream-jams-audio", host: "player", trustedServiceOrigin: origin, generation: 1, recipientId: "audio" })).toThrow();
    }
  });
  it("expires grants and cancels destruction with bounded header timeout", async () => {
    vi.useFakeTimers();
    try {
      const adapter = create(vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))))));
      const ref = adapter.issue("owner", { ...grant(), expiresAt: Date.now() + 100 });
      const url = adapter.url(ref);
      const response = adapter.handle(new Request(url));
      await vi.advanceTimersByTimeAsync(101);
      expect((await response).status).toBe(502);
      expect((await adapter.handle(new Request(url))).status).toBe(404);
      expect(adapter.diagnostics).toEqual({ liveGrants: 0, activeStreams: 0 });
      adapter.destroy(); expect(() => adapter.issue("owner", grant())).toThrow();
    } finally { vi.useRealTimers(); }
  });
  it("deduplicates trusted issuance and isolates owner cleanup", async () => {
    const adapter = create();
    const trusted = grant();
    const first = adapter.issue("first", trusted);
    expect(adapter.issue("first", trusted).handle).toBe(first.handle);
    const second = adapter.issue("second", trusted);
    const firstUrl = adapter.url(first);
    const secondUrl = adapter.url(second);
    adapter.revokeOwner("first");
    expect((await adapter.handle(new Request(firstUrl))).status).toBe(404);
    const response = await adapter.handle(new Request(secondUrl));
    expect(await response.text()).toBe("media");
    adapter.destroy();
    expect((await adapter.handle(new Request(secondUrl))).status).toBe(404);
  });
  it("times out header acquisition independently from owner expiry", async () => {
    vi.useFakeTimers();
    try {
      const adapter = new PrivateMediaProtocol({ scheme: "stream-jams-audio", host: "player", trustedServiceOrigin: "http://127.0.0.1:1234", generation: 1, recipientId: "audio", headerTimeoutMs: 20,
        fetch: vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) });
      const ref = adapter.issue("owner", grant());
      const pending = adapter.handle(new Request(adapter.url(ref)));
      await vi.advanceTimersByTimeAsync(21);
      expect((await pending).status).toBe(502);
      expect(adapter.diagnostics.activeStreams).toBe(0); adapter.destroy();
    } finally { vi.useRealTimers(); }
  });
  it("rejects excess active reads while retaining existing owners", async () => {
    const adapter = create(vi.fn(async () => new Response(new ReadableStream())));
    const ref = adapter.issue("owner", grant());
    const url = adapter.url(ref);
    const responses: Response[] = [];
    for (let index = 0; index < 256; index++) responses.push(await adapter.handle(new Request(url)));
    expect((await adapter.handle(new Request(url))).status).toBe(503);
    expect(adapter.diagnostics).toEqual({ liveGrants: 1, activeStreams: 256 });
    adapter.destroy();
    await Promise.all(responses.map(response => response.body!.cancel()));
    expect(adapter.diagnostics).toEqual({ liveGrants: 0, activeStreams: 0 });
  });
});

it("renews a persistent owner in place and forbids changing its snapshot behind a stable handle", async () => {
  vi.useFakeTimers();
  const adapter = create(); const original = grant(); original.expiresAt = Date.now() + 1000;
  const reference = adapter.issue("timer-run", original);
  await vi.advanceTimersByTimeAsync(500);
  const renewed = adapter.issue("timer-run", { ...original, expiresAt: Date.now() + 5000 });
  expect(renewed).toEqual(reference); expect(adapter.diagnostics.liveGrants).toBe(1);
  expect(() => adapter.issue("timer-run", { ...original, snapshot: { ...original.snapshot, version: "b".repeat(64) } })).toThrow(/snapshot/);
  await vi.advanceTimersByTimeAsync(1000);
  expect((await adapter.handle(new Request(adapter.url(reference), { method: "HEAD" }))).status).toBe(200);
  await vi.advanceTimersByTimeAsync(4000);
  expect(adapter.diagnostics.liveGrants).toBe(0); adapter.destroy(); vi.useRealTimers();
});
