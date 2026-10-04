import { afterEach, describe, expect, it, vi } from "vitest";
import { startPearProtocolFixture, type PearProtocolFixture } from "@stream-jams/test-support";
import type { MusicSnapshot, MusicStatus } from "@stream-jams/core";
import { PearMusicSource } from "./pear-music-source.js";

let fixture: PearProtocolFixture | null = null;
let adapter: PearMusicSource | null = null;
afterEach(async () => { vi.useRealTimers(); await adapter?.stop(); await fixture?.close(); adapter = null; fixture = null; });

async function create(transport: "ws" | "poll" | "auto") {
  fixture = await startPearProtocolFixture();
  adapter = new PearMusicSource({ config: { baseUrl: fixture.baseUrl, transport }, token: "throwaway-token", providerId: "provider_1", generation: "generation_1", jitter: () => 0.5 });
  return adapter;
}

const song = { videoId: "abc", title: "Track", artist: "Artist", songDuration: 90, imageSrc: "https://i.ytimg.com/vi/abc/default.jpg" };

describe("PearMusicSource lifecycle", () => {
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
    await vi.waitFor(() => expect(statuses.at(-1)?.state).toBe("reconnecting"));
    fixture!.setSong({ status: 204 });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fixture!.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_100);
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
