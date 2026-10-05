import { pearArtworkPolicy } from "./music-artwork-policy.js";
import { describe, expect, it, vi } from "vitest";
import { createDefaultMusicModuleConfig, type MusicSnapshot, type MusicSourceAdapter, type MusicStatus } from "@stream-jams/core";
import { MusicRuntimeCoordinator } from "./music-runtime-coordinator.js";

const connected: MusicStatus = { state: "connected", stale: false, diagnosticReference: null };
const configuration = createDefaultMusicModuleConfig();
function snapshot(generation: string, revision: number, observedAtEpochMs: number, trackId = "song"): MusicSnapshot {
  return { providerId: "pear", generation, revision, track: { id: trackId, title: trackId, artists: ["Artist"], album: null, artworkRef: null }, playbackState: "playing", positionMs: 0, durationMs: null, observedAtEpochMs, session: null };
}
class ControlledSource implements MusicSourceAdapter {
  onSnapshot: ((value: MusicSnapshot) => void) | null = null;
  onStatus: ((value: MusicStatus) => void) | null = null;
  signal: AbortSignal | null = null;
  stopCount = 0;
  async testConnection() { return { transport: "poll" as const, capabilities: { artwork: true, position: true, duration: true, sessionSelection: false } }; }
  async start(onSnapshot: (value: MusicSnapshot) => void, onStatus: (value: MusicStatus) => void, signal: AbortSignal) {
    this.onSnapshot = onSnapshot; this.onStatus = onStatus; this.signal = signal;
  }
  getSnapshot() { return null; }
  async stop() { this.stopCount++; }
}

function fixture() {
  let enabled = false;
  let providerId: string | null = "pear";
  let now = 1000;
  const sources: ControlledSource[] = [];
  const publications: Array<{ revision: number; projection: ReturnType<MusicRuntimeCoordinator["getProjection"]> }> = [];
  const runtime = new MusicRuntimeCoordinator({
    getConfig: async () => ({ enabled, config: configuration }),
    getActiveSource: async () => providerId === null ? null : ({ providerId, configuration: { baseUrl: "http://127.0.0.1:26538", transport: "poll" as const }, token: "test" }),
    createSource: () => { const source = new ControlledSource(); sources.push(source); return source; },
    now: () => now,
    sink: async event => { publications.push({ revision: event.revision, projection: event.getProjection("landscape") }); }
  });
  return { runtime, sources, publications, setEnabled(value: boolean) { enabled = value; }, setProvider(value: string | null) { providerId = value; }, setNow(value: number) { now = value; } };
}

describe("MusicRuntimeCoordinator", () => {
  it("gets artwork trust only from the active source generation", async () => {
    const f = fixture(); f.setEnabled(true); await f.runtime.reconcile();
    const generation = f.runtime.generation!;
    const owner = { providerId: "pear", generation };
    const source = f.sources[0]!;
    source.onSnapshot?.(snapshot(generation, 1, 1000));
    expect(f.runtime.getArtworkPolicy(owner)).toBeNull();
    Object.assign(source, { getArtworkPolicy: () => pearArtworkPolicy });
    expect(f.runtime.getArtworkPolicy(owner)).toBe(pearArtworkPolicy);
    expect(f.runtime.getArtworkPolicy({ ...owner, generation: "obsolete" })).toBeNull();
    expect(f.runtime.getArtworkPolicy({ ...owner, providerId: "other" })).toBeNull();
    await f.runtime.stop();
    expect(f.runtime.getArtworkPolicy(owner)).toBeNull();
  });

  it("drains live Music before maintenance and resumes from fresh provider state", async () => {
    const f = fixture(); f.setEnabled(true); await f.runtime.reconcile();
    const first = f.sources[0]!;
    first.onStatus?.(connected); first.onSnapshot?.(snapshot(f.runtime.generation!, 1, 1000));
    await f.runtime.suspendForMaintenance();
    expect(first.signal?.aborted).toBe(true);
    expect(first.stopCount).toBe(1);
    expect(f.runtime.getProjection("landscape")).toBeNull();
    await f.runtime.reconcile();
    expect(f.sources).toHaveLength(1);
    await f.runtime.resumeAfterMaintenance();
    expect(f.sources).toHaveLength(2);
    expect(f.runtime.getProjection("landscape")).toBeNull();
    first.onStatus?.(connected); first.onSnapshot?.(snapshot("old", 99, 1000));
    expect(f.runtime.getProjection("landscape")).toBeNull();
    await f.runtime.stop();
  });
  it("never opens a source on disabled startup, and opens the selected source when enabled", async () => {
    const f = fixture();
    await f.runtime.reconcile();
    expect(f.sources).toHaveLength(0);
    f.setEnabled(true); await f.runtime.reconcile();
    expect(f.sources).toHaveLength(1);
    await f.runtime.stop();
  });

  it("clears before an old source stops and rejects late callbacks after a switch", async () => {
    const f = fixture(); f.setEnabled(true); await f.runtime.reconcile();
    const first = f.sources[0]!;
    first.onStatus?.(connected); first.onSnapshot?.(snapshot(f.runtime.generation!, 1, 1000));
    expect(f.runtime.getProjection("landscape")?.snapshot.track?.id).toBe("song");
    f.setProvider("second");
    const transition = f.runtime.reconcile();
    expect(f.runtime.getProjection("landscape")).toBeNull();
    expect(first.signal?.aborted).toBe(true);
    first.onStatus?.(connected); first.onSnapshot?.(snapshot("old", 99, 1000, "late"));
    await transition;
    expect(f.runtime.getProjection("landscape")).toBeNull();
    expect(first.stopCount).toBe(1);
    await f.runtime.stop();
  });

  it("rejects out-of-order revisions while polls and pausing preserve the appearance epoch", async () => {
    const f = fixture(); f.setEnabled(true); await f.runtime.reconcile();
    const source = f.sources[0]!; const generation = f.runtime.generation!;
    source.onStatus?.(connected); source.onSnapshot?.(snapshot(generation, 2, 1000));
    f.setNow(2000); source.onSnapshot?.({ ...snapshot(generation, 3, 2000), playbackState: "paused" });
    source.onSnapshot?.(snapshot(generation, 2, 2000, "old"));
    expect(f.runtime.getProjection("landscape")?.appearanceStartedAtEpochMs).toBe(1000);
    expect(f.runtime.getProjection("landscape")?.snapshot.track?.id).toBe("song");
    source.onSnapshot?.(snapshot(generation, 4, 2000, "next"));
    expect(f.runtime.getProjection("landscape")?.appearanceStartedAtEpochMs).toBe(2000);
    await f.runtime.stop();
  });

  it("shows hidden Music for a fresh idle period after paused-to-playing resume", async () => {
    const f = fixture(); f.setEnabled(true);
    configuration.profiles.landscape.idleMode = "hide"; configuration.profiles.landscape.idleAfterSeconds = 1;
    try {
      await f.runtime.reconcile(); const source = f.sources[0]!; const generation = f.runtime.generation!;
      source.onStatus?.(connected); source.onSnapshot?.(snapshot(generation, 1, 1000));
      f.setNow(2500); source.onSnapshot?.({ ...snapshot(generation, 2, 2500), playbackState: "paused" });
      expect(f.runtime.getProjection("landscape")).toBeNull();
      f.setNow(3000); source.onSnapshot?.(snapshot(generation, 3, 3000));
      expect(f.runtime.getProjection("landscape")?.appearanceStartedAtEpochMs).toBe(3000);
      f.setNow(3500); source.onSnapshot?.(snapshot(generation, 4, 3500));
      expect(f.runtime.getProjection("landscape")?.appearanceStartedAtEpochMs).toBe(3000);
      f.setNow(4000); expect(f.runtime.getProjection("landscape")).toBeNull();
      source.onSnapshot?.({ ...snapshot(generation, 3, 4000), playbackState: "paused" });
      source.onSnapshot?.(snapshot(generation, 5, 4000));
      expect(f.runtime.getProjection("landscape")).toBeNull();
    } finally { await f.runtime.stop(); configuration.profiles.landscape.idleMode = "none"; configuration.profiles.landscape.idleAfterSeconds = 30; }
  });

  it("publishes idle and stale deadlines without a provider event", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); f.setEnabled(true);
      configuration.profiles.landscape.idleMode = "compact"; configuration.profiles.landscape.idleAfterSeconds = 1;
      await f.runtime.reconcile();
      const source = f.sources[0]!; source.onStatus?.(connected); source.onSnapshot?.(snapshot(f.runtime.generation!, 1, 1000));
      f.setNow(2000); await vi.advanceTimersByTimeAsync(1000);
      expect(f.runtime.getProjection("landscape")?.view).toBe("compact");
      const afterIdle = f.runtime.revision;
      f.setNow(46001); await vi.advanceTimersByTimeAsync(44001);
      expect(f.runtime.revision).toBeGreaterThan(afterIdle);
      expect(f.runtime.getStatus().stale).toBe(true);
      expect(f.runtime.getProjection("landscape")).toBeNull();
      await f.runtime.stop();
    } finally { vi.useRealTimers(); configuration.profiles.landscape.idleMode = "none"; configuration.profiles.landscape.idleAfterSeconds = 30; }
  });

  it("aborts on disable and shutdown and leaves no restart playback truth", async () => {
    const f = fixture(); f.setEnabled(true); await f.runtime.reconcile();
    const source = f.sources[0]!; source.onStatus?.(connected); source.onSnapshot?.(snapshot(f.runtime.generation!, 1, 1000));
    f.setEnabled(false); await f.runtime.reconcile();
    expect(source.signal?.aborted).toBe(true);
    expect(f.runtime.getProjection("landscape")).toBeNull();
    await f.runtime.stop();
    const restarted = fixture(); await restarted.runtime.reconcile();
    expect(restarted.runtime.getProjection("landscape")).toBeNull();
    await restarted.runtime.stop();
  });

  it("publishes an appearance config update without restarting or resetting the source epoch", async () => {
    const f = fixture(); f.setEnabled(true); await f.runtime.reconcile();
    const first = f.sources[0]!; const oldGeneration = f.runtime.generation!;
    first.onStatus?.(connected); first.onSnapshot?.(snapshot(oldGeneration, 1, 1000));
    configuration.profiles.landscape.initialView = "compact";
    try {
      await f.runtime.refreshConfig();
      expect(first.signal?.aborted).toBe(false);
      expect(first.stopCount).toBe(0);
      expect(f.runtime.generation).toBe(oldGeneration);
      expect(f.runtime.getProjection("landscape")?.view).toBe("compact");
      expect(f.runtime.getProjection("landscape")?.appearanceStartedAtEpochMs).toBe(1000);
    } finally { configuration.profiles.landscape.initialView = "full"; await f.runtime.stop(); }
  });

  it("publishes both profile idle deadlines when they differ", async () => {
    vi.useFakeTimers();
    const f = fixture(); f.setEnabled(true);
    configuration.profiles.landscape.idleMode = "compact"; configuration.profiles.landscape.idleAfterSeconds = 1;
    configuration.profiles.vertical.idleMode = "hide"; configuration.profiles.vertical.idleAfterSeconds = 2;
    try {
      await f.runtime.reconcile();
      const source = f.sources[0]!; source.onStatus?.(connected); source.onSnapshot?.(snapshot(f.runtime.generation!, 1, 1000));
      f.setNow(2000); await vi.advanceTimersByTimeAsync(1000);
      const firstDeadlineRevision = f.runtime.revision;
      expect(f.runtime.getProjection("landscape")?.view).toBe("compact");
      expect(f.runtime.getProjection("vertical")).not.toBeNull();
      f.setNow(3000); await vi.advanceTimersByTimeAsync(1000);
      expect(f.runtime.revision).toBeGreaterThan(firstDeadlineRevision);
      expect(f.runtime.getProjection("vertical")).toBeNull();
    } finally {
      await f.runtime.stop(); vi.useRealTimers();
      configuration.profiles.landscape.idleMode = "none"; configuration.profiles.landscape.idleAfterSeconds = 30;
      configuration.profiles.vertical.idleMode = "none"; configuration.profiles.vertical.idleAfterSeconds = 30;
    }
  });

  it("keeps each slow publication bound to its original snapshot and status", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    let firstStarted!: () => void;
    const started = new Promise<void>(resolve => { firstStarted = resolve; });
    const delivered: string[] = [];
    const source = new ControlledSource();
    const runtime = new MusicRuntimeCoordinator({
      getConfig: async () => ({ enabled: true, config: createDefaultMusicModuleConfig() }),
      getActiveSource: async () => ({ providerId: "pear", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "poll" }, token: "test" }),
      createSource: () => source, now: () => 1000,
      sink: async event => { if (event.getProjection("landscape")?.snapshot.track?.id === "first") { firstStarted(); await blocked; delivered.push(`${event.getProjection("landscape")?.snapshot.track?.id ?? "none"}:${event.status.state}`); } }
    });
    await runtime.reconcile(); source.onStatus?.(connected);
    source.onSnapshot?.(snapshot(runtime.generation!, 1, 1000, "first"));
    await started;
    source.onSnapshot?.(snapshot(runtime.generation!, 2, 1000, "second"));
    source.onStatus?.({ state: "reconnecting", stale: false, diagnosticReference: null });
    release(); await vi.waitFor(() => expect(delivered).toEqual(["first:connected"]));
    await runtime.stop();
  });

  it("retains auth-required when start rejects after reporting revoked credentials", async () => {
    const source = new ControlledSource();
    source.start = async (_snapshot, onStatus) => { onStatus({ state: "auth-required", stale: false, diagnosticReference: null }); throw new Error("revoked"); };
    const runtime = new MusicRuntimeCoordinator({
      getConfig: async () => ({ enabled: true, config: createDefaultMusicModuleConfig() }),
      getActiveSource: async () => ({ providerId: "pear", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "poll" }, token: "test" }),
      createSource: () => source
    });
    await runtime.reconcile(); await Promise.resolve();
    expect(runtime.getStatus().state).toBe("auth-required");
    await runtime.stop();
  });

  it("stops the source even when a presentation recipient never settles", async () => {
    const source = new ControlledSource();
    let hold!: () => void;
    const blocking = new Promise<void>(resolve => { hold = resolve; });
    const runtime = new MusicRuntimeCoordinator({
      getConfig: async () => ({ enabled: true, config: createDefaultMusicModuleConfig() }),
      getActiveSource: async () => ({ providerId: "pear", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "poll" }, token: "test" }),
      createSource: () => source,
      sink: async () => blocking
    });
    await runtime.reconcile(); await Promise.resolve();
    const result = await Promise.race([runtime.stop().then(() => "stopped"), new Promise<string>(resolve => setTimeout(() => resolve("blocked"), 50))]);
    expect(result).toBe("stopped");
    expect(source.signal?.aborted).toBe(true);
    expect(source.stopCount).toBe(1);
    hold();
  });

  it("isolates a failing subscriber from source shutdown", async () => {
    const f = fixture(); f.setEnabled(true); await f.runtime.reconcile();
    f.runtime.subscribe(() => { throw new Error("recipient failed"); });
    await expect(f.runtime.stop()).resolves.toBeUndefined();
    expect(f.sources[0]?.stopCount).toBe(1);
  });

  it("keeps only the latest publication queued behind a slow sink", async () => {
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const received: number[] = [];
    let holdFirst = true;
    const source = new ControlledSource();
    const runtime = new MusicRuntimeCoordinator({
      getConfig: async () => ({ enabled: true, config: createDefaultMusicModuleConfig() }),
      getActiveSource: async () => ({ providerId: "pear", configuration: { baseUrl: "http://127.0.0.1:26538", transport: "poll" }, token: "test" }),
      createSource: () => source,
      now: () => 1000,
      sink: async event => { received.push(event.revision); if (holdFirst) { holdFirst = false; await blocked; } }
    });
    await runtime.reconcile();
    await Promise.resolve();
    source.onStatus?.(connected);
    for (let revision = 1; revision <= 20; revision++) source.onSnapshot?.(snapshot(runtime.generation!, revision, 1000));
    expect(received).toHaveLength(1);
    release();
    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(received[1]).toBe(runtime.revision);
    await runtime.stop();
  });

  it("offers the current identity to a new subscriber and rejects an old revision after disconnect", async () => {
    const f = fixture(); f.setEnabled(true); await f.runtime.reconcile();
    const source = f.sources[0]!; const generation = f.runtime.generation!;
    source.onStatus?.(connected); source.onSnapshot?.(snapshot(generation, 5, 1000));
    const revisions: number[] = [];
    const unsubscribe = f.runtime.subscribe(revision => revisions.push(revision));
    expect(revisions).toEqual([f.runtime.revision]);
    source.onStatus?.({ state: "reconnecting", stale: false, diagnosticReference: null });
    source.onStatus?.(connected);
    source.onSnapshot?.(snapshot(generation, 4, 1000, "old"));
    expect(f.runtime.getProjection("landscape")).toBeNull();
    source.onSnapshot?.(snapshot(generation, 6, 1000, "recovered"));
    expect(f.runtime.getProjection("landscape")?.snapshot.track?.id).toBe("recovered");
    unsubscribe(); await f.runtime.stop();
  });
});
