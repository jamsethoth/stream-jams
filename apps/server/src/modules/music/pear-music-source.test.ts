import { afterEach, describe, expect, it, vi } from "vitest";
import { startPearProtocolFixture, type PearProtocolFixture } from "@stream-jams/test-support";
import type { MusicSnapshot, MusicStatus } from "@stream-jams/core";
import { PearMusicSource } from "./pear-music-source.js";

let fixture: PearProtocolFixture | null = null;
let adapter: PearMusicSource | null = null;
afterEach(async () => { vi.useRealTimers(); await adapter?.stop(); await fixture?.close(); adapter = null; fixture = null; });

async function create(transport: "ws" | "poll" | "auto") {
  fixture = await startPearProtocolFixture();
  adapter = new PearMusicSource({ config: { baseUrl: fixture.baseUrl, transport }, token: "throwaway-token", providerId: "provider_1", generation: "generation_1", jitter: () => 0.5, now: () => Date.now() });
  return adapter;
}

const song = { videoId: "abc", title: "Track", artist: "Artist", songDuration: 90, imageSrc: "https://i.ytimg.com/vi/abc/default.jpg" };

describe("PearMusicSource lifecycle", () => {
  it("hydrates a partial authenticated first frame immediately", async () => {
    const source = await create("ws"); fixture!.setSong({ status: 200, body: song });
    await source.start(() => {}, () => {}, new AbortController().signal);
    await vi.waitFor(() => expect(source.getSnapshot()?.track?.id).toBe("abc"), { timeout: 500 });
    expect(fixture!.requests).toHaveLength(1);
  });

  it("does not overwrite a newer WS track with delayed initial hydration", async () => {
    const source = await create("ws"); fixture!.setSong({ status: 200, body: song, delayMs: 100 });
    await source.start(() => {}, () => {}, new AbortController().signal);
    await vi.waitFor(() => expect(fixture!.requests).toHaveLength(1), { timeout: 500 });
    fixture!.send({ type: "VIDEO_CHANGED", song: { ...song, videoId: "new", title: "New" } });
    await vi.waitFor(() => expect(source.getSnapshot()?.track?.id).toBe("new"));
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(source.getSnapshot()?.track?.id).toBe("new");
  });

  it("does not resurrect a track cleared by WS during initial hydration", async () => {
    const source = await create("ws"); fixture!.setSong({ status: 200, body: song, delayMs: 100 });
    await source.start(() => {}, () => {}, new AbortController().signal);
    await vi.waitFor(() => expect(fixture!.requests).toHaveLength(1));
    fixture!.send({ type: "PLAYER_INFO", song: null, isPlaying: false });
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(source.getSnapshot()?.track).toBeNull();
  });

  it("reconnects automatic transport to WS after an ordinary disconnect", async () => {
    const source = await create("auto"); fixture!.setFirstFrame({ type: "PLAYER_INFO", song, isPlaying: true });
    await source.start(() => {}, () => {}, new AbortController().signal);
    fixture!.closeSockets();
    await vi.waitFor(() => expect(fixture!.sockets).toHaveLength(2), { timeout: 2_500 });
    expect(fixture!.requests).toHaveLength(0);
    expect(source.getSnapshot()?.track?.id).toBe("abc");
  });

  it("probes WS again while automatic transport is polling an unavailable endpoint", async () => {
    const source = await create("auto"); fixture!.setWsStatus(503); fixture!.setSong({ status: 200, body: song });
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "Date"] });
    await source.start(() => {}, () => {}, new AbortController().signal);
    fixture!.setWsStatus(null); fixture!.setFirstFrame({ type: "PLAYER_INFO", song, isPlaying: true });
    for (let index = 0; index < 5; index += 1) {
      await vi.advanceTimersByTimeAsync(3_100);
      if (index < 4) await vi.waitFor(() => expect(fixture!.requests.length).toBeGreaterThanOrEqual(index + 2));
    }
    vi.useRealTimers();
    await vi.waitFor(() => expect(fixture!.sockets).toHaveLength(1), { timeout: 500 });
    fixture!.send({ type: "POSITION_CHANGED", position: 23 });
    await vi.waitFor(() => expect(source.getSnapshot()?.positionMs).toBe(23_000));
  });

  it("caps repeated transport retry delays at five seconds including jitter", async () => {
    fixture = await startPearProtocolFixture(); fixture.setSong({ status: 503 });
    adapter = new PearMusicSource({ config: { baseUrl: fixture.baseUrl, transport: "poll" }, token: "throwaway-token", providerId: "provider_1", generation: "generation_1", jitter: () => 1 });
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    const timers = vi.spyOn(globalThis, "setTimeout");
    const started = adapter.start(() => {}, () => {}, new AbortController().signal);
    void started.catch(() => {});
    await vi.waitFor(() => expect(fixture!.requests).toHaveLength(1));
    for (const [index, delay] of [1_200, 2_400, 5_000, 5_000].entries()) {
      await vi.advanceTimersByTimeAsync(delay + 100);
      await vi.waitFor(() => expect(fixture!.requests).toHaveLength(index + 2));
    }
    expect(timers.mock.calls.map(call => call[1]).filter(value => typeof value === "number" && value >= 800)).not.toContain(6_000);
    expect(timers.mock.calls.map(call => call[1])).toContain(5_000);
    timers.mockRestore();
  });

  it("does not poll or probe after automatic WS authentication is rejected", async () => {
    const source = await create("auto"); fixture!.setWsStatus(403);
    const statuses: MusicStatus[] = [];
    await expect(source.start(() => {}, value => statuses.push(value), new AbortController().signal)).rejects.toThrow(/authorization/);
    vi.useFakeTimers(); await vi.advanceTimersByTimeAsync(60_000);
    expect(statuses.at(-1)?.state).toBe("auth-required");
    expect(fixture!.requests).toHaveLength(0);
    expect(fixture!.sockets).toHaveLength(0);
  });
  it("polls every three seconds without emitting repeated connected status or losing metadata", async () => {
    const source = await create("poll"); fixture!.setSong({ status: 200, body: song });
    const snapshots: MusicSnapshot[] = []; const statuses: MusicStatus[] = [];
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    await source.start(value => snapshots.push(value), value => statuses.push(value), new AbortController().signal);
    expect(snapshots).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3_000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(snapshots).toHaveLength(2));
    expect(snapshots[1]?.track?.id).toBe("abc");
    expect(snapshots[1]?.track?.artworkRef).toBe(snapshots[0]?.track?.artworkRef);
    expect(statuses.map(value => value.state)).toEqual(["connecting", "connected"]);
    expect(fixture!.requests).toHaveLength(2);
  });

  it("clears a track when REST changes to 204", async () => {
    const source = await create("poll"); fixture!.setSong({ status: 200, body: song });
    const snapshots: MusicSnapshot[] = [];
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    await source.start(value => snapshots.push(value), () => {}, new AbortController().signal);
    fixture!.setSong({ status: 204 });
    await vi.advanceTimersByTimeAsync(3_000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(snapshots.at(-1)?.track).toBeNull());
    expect(source.getSnapshot()?.track).toBeNull();
  });

  it("reconciles WS with authenticated REST after fifteen seconds", async () => {
    const source = await create("ws"); fixture!.setFirstFrame({ type: "PLAYER_INFO", song, isPlaying: true, position: 4 });
    fixture!.setSong({ status: 204 });
    const snapshots: MusicSnapshot[] = [];
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    await source.start(value => snapshots.push(value), () => {}, new AbortController().signal);
    expect(snapshots[0]?.track?.title).toBe("Track");
    await vi.advanceTimersByTimeAsync(15_000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(fixture!.requests).toHaveLength(1));
    expect(fixture!.requests).toEqual([{ path: "/api/v1/song", authorization: "Bearer throwaway-token" }]);
    expect(snapshots.at(-1)?.track).toBeNull();
  });

  it.each([
    { name: "new track", frame: { type: "VIDEO_CHANGED", song: { ...song, videoId: "new", title: "New" } }, expectedId: "new" },
    { name: "cleared track", frame: { type: "PLAYER_INFO", song: null, isPlaying: false }, expectedId: null }
  ])("discards delayed reconciliation after a WS $name", async ({ frame, expectedId }) => {
    const source = await create("ws"); fixture!.setFirstFrame({ type: "PLAYER_INFO", song, isPlaying: true });
    fixture!.setSong({ status: 200, body: song, delayMs: 300 });
    const snapshots: MusicSnapshot[] = [];
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    await source.start(value => snapshots.push(value), () => {}, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(15_000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(fixture!.requests).toHaveLength(1));
    fixture!.send(frame);
    await vi.waitFor(() => expect(source.getSnapshot()?.track?.id ?? null).toBe(expectedId));
    const publishedCount = snapshots.length;
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(source.getSnapshot()?.track?.id ?? null).toBe(expectedId);
    expect(snapshots).toHaveLength(publishedCount);
  });

  it("retains reconciliation through a position-only WS update", async () => {
    const source = await create("ws"); fixture!.setFirstFrame({ type: "PLAYER_INFO", song, isPlaying: true });
    fixture!.setSong({ status: 200, body: { ...song, title: "Reconciled" }, delayMs: 300 });
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    await source.start(() => {}, () => {}, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(15_000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(fixture!.requests).toHaveLength(1));
    fixture!.send({ type: "POSITION_CHANGED", position: 12 });
    await vi.waitFor(() => expect(source.getSnapshot()?.positionMs).toBe(12_000));
    await vi.waitFor(() => expect(source.getSnapshot()?.track?.title).toBe("Reconciled"));
  });

  it("discards a late reconciliation response after its socket disconnects", async () => {
    const source = await create("ws"); fixture!.setFirstFrame({ type: "PLAYER_INFO", song, isPlaying: true });
    fixture!.setSong({ status: 200, body: { ...song, title: "Late" }, delayMs: 100 });
    const snapshots: MusicSnapshot[] = [];
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    await source.start(value => snapshots.push(value), () => {}, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(15_000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(fixture!.requests).toHaveLength(1));
    fixture!.closeSockets(1000);
    await vi.waitFor(() => expect(source.getSnapshot()).toBeNull());
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(snapshots).toHaveLength(1);
    expect(source.getSnapshot()).toBeNull();
  });

  it("stops retries and clears live output after WS policy revocation", async () => {
    const source = await create("ws");
    const statuses: MusicStatus[] = [];
    await source.start(() => {}, value => statuses.push(value), new AbortController().signal);
    fixture!.closeSockets(1008);
    await vi.waitFor(() => expect(statuses.at(-1)?.state).toBe("auth-required"));
    expect(source.getSnapshot()).toBeNull();
    vi.useFakeTimers(); await vi.advanceTimersByTimeAsync(30_000);
    expect(fixture!.sockets).toHaveLength(1);
  });

  it("marks REST authorization failure and stops polling", async () => {
    fixture = await startPearProtocolFixture();
    adapter = new PearMusicSource({
      config: { baseUrl: fixture.baseUrl, transport: "poll" }, token: "invalid-token",
      providerId: "provider_1", generation: "generation_1"
    });
    const statuses: MusicStatus[] = [];
    await expect(adapter.start(() => {}, value => statuses.push(value), new AbortController().signal)).rejects.toThrow(/authorization/);
    expect(statuses.at(-1)?.state).toBe("auth-required");
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(fixture.requests).toHaveLength(1);
  });

  it("clears the live track on ordinary socket disconnect before retrying", async () => {
    const source = await create("ws"); fixture!.setFirstFrame({ type: "PLAYER_INFO", song, isPlaying: true });
    const statuses: MusicStatus[] = [];
    await source.start(() => {}, value => statuses.push(value), new AbortController().signal);
    expect(source.getSnapshot()?.track?.id).toBe("abc");
    fixture!.closeSockets(1000);
    await vi.waitFor(() => expect(statuses.at(-1)?.state).toBe("reconnecting"));
    expect(source.getSnapshot()).toBeNull();
  });

  it("discards malformed and oversized frames instead of publishing them", async () => {
    const source = await create("ws");
    const snapshots: MusicSnapshot[] = []; const statuses: MusicStatus[] = [];
    await source.start(value => snapshots.push(value), value => statuses.push(value), new AbortController().signal);
    fixture!.sendRaw("{invalid-json");
    await vi.waitFor(() => expect(statuses.at(-1)?.state).toBe("reconnecting"));
    expect(snapshots).toHaveLength(1);
    expect(source.getSnapshot()).toBeNull();
    await source.stop();
    await fixture!.close(); fixture = null;
    const again = await create("ws");
    const second: MusicSnapshot[] = [];
    await again.start(value => second.push(value), () => {}, new AbortController().signal);
    fixture!.sendRaw(JSON.stringify({ type: "POSITION_CHANGED", padding: "x".repeat(256 * 1024) }));
    await vi.waitFor(() => expect(again.getSnapshot()).toBeNull());
    expect(second).toHaveLength(1);
  });

  it("discards an in-flight poll completed after stop", async () => {
    const source = await create("poll"); fixture!.setSong({ status: 200, body: song });
    const snapshots: MusicSnapshot[] = [];
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    await source.start(value => snapshots.push(value), () => {}, new AbortController().signal);
    fixture!.setSong({ status: 200, body: { ...song, title: "Late" }, delayMs: 100 });
    await vi.advanceTimersByTimeAsync(3_000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(fixture!.requests).toHaveLength(2));
    await source.stop();
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(snapshots).toHaveLength(1);
  });

  it("honors Retry-After before another serialized poll", async () => {
    const source = await create("poll"); fixture!.setSong({ status: 503, retryAfter: "5" });
    const statuses: MusicStatus[] = [];
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    const started = source.start(() => {}, value => statuses.push(value), new AbortController().signal);
    void started.catch(() => {});
    await vi.waitFor(() => expect(statuses.at(-1)?.state).toBe("reconnecting"));
    fixture!.setSong({ status: 204 });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fixture!.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_100);
    vi.useRealTimers();
    await started;
    expect(fixture!.requests).toHaveLength(2);
  });

  it.each(["90", "date"])("honors Retry-After beyond 60 seconds (%s)", async header => {
    const source = await create("poll");
    fixture!.setSong({ status: 503, retryAfter: header === "date" ? new Date(Date.now() + 90_000).toUTCString() : header });
    const statuses: MusicStatus[] = [];
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    const started = source.start(() => {}, value => statuses.push(value), new AbortController().signal);
    void started.catch(() => {});
    await vi.waitFor(() => expect(statuses.at(-1)?.state).toBe("reconnecting"));
    fixture!.setSong({ status: 204 });
    await vi.advanceTimersByTimeAsync(61_000);
    expect(fixture!.requests).toHaveLength(1);
    await source.stop();
    await expect(started).rejects.toThrow();
    expect(fixture!.requests).toHaveLength(1);
  });

  it.each(["nonsense", "-5"])("uses bounded backoff for invalid Retry-After (%s)", async header => {
    const source = await create("poll"); fixture!.setSong({ status: 503, retryAfter: header });
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    const started = source.start(() => {}, () => {}, new AbortController().signal);
    void started.catch(() => {});
    await vi.waitFor(() => expect(fixture!.requests).toHaveLength(1));
    fixture!.setSong({ status: 204 });
    await vi.advanceTimersByTimeAsync(2_000);
    vi.useRealTimers();
    await started;
    expect(fixture!.requests).toHaveLength(2);
  });

  it("discards callbacks after stop and is safe to stop twice", async () => {
    const source = await create("ws");
    const snapshots: MusicSnapshot[] = [];
    await source.start(value => snapshots.push(value), () => {}, new AbortController().signal);
    await source.stop(); await source.stop();
    fixture!.send({ type: "PLAYER_INFO", song, isPlaying: true });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(snapshots).toHaveLength(1);
    expect(source.getSnapshot()).toBeNull();
  });

  it("keeps artwork descriptors private and generation-owned", async () => {
    const source = await create("ws"); fixture!.setFirstFrame({ type: "PLAYER_INFO", song, isPlaying: true });
    await source.start(() => {}, () => {}, new AbortController().signal);
    const ref = source.getSnapshot()?.track?.artworkRef;
    expect(ref).toMatch(/^art_[A-Za-z0-9]+$/);
    expect(ref).not.toContain("ytimg");
    expect(source.getArtworkDescriptor(ref!, { providerId: "provider_1", generation: "generation_1" })).toEqual({ url: song.imageSrc });
    expect(source.getArtworkDescriptor(ref!, { providerId: "provider_1", generation: "wrong" })).toBeNull();
    fixture!.send({ type: "PLAYER_INFO", song: { ...song, imageSrc: null }, isPlaying: true });
    await vi.waitFor(() => expect(source.getSnapshot()?.track?.artworkRef).toBeNull());
    expect(source.getArtworkDescriptor(ref!, { providerId: "provider_1", generation: "generation_1" })).toBeNull();
    fixture!.send({ type: "PLAYER_INFO", song: null, isPlaying: false });
    await vi.waitFor(() => expect(source.getSnapshot()?.track).toBeNull());
    expect(source.getArtworkDescriptor(ref!, { providerId: "provider_1", generation: "generation_1" })).toBeNull();
    await source.stop();
    expect(source.getArtworkDescriptor(ref!, { providerId: "provider_1", generation: "generation_1" })).toBeNull();
  });
});
