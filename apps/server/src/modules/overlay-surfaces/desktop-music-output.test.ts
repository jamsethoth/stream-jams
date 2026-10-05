import { createDefaultMusicModuleConfig, projectMusicWidget, type DesktopModuleSync, type SurfaceConfiguration } from "@stream-jams/core";
import { expect, it, vi } from "vitest";
import { DesktopModuleSnapshotSink } from "./desktop-module-snapshot-sink.js";

const config = createDefaultMusicModuleConfig();
const owner = { providerId: "pear", generation: "g1" };
const descriptor = { url: "https://i.ytimg.com/vi/one/default.jpg" };
const projection = projectMusicWidget({ ...owner, revision: 1, track: { id: "track", title: "Title", artists: ["Artist"], album: null, artworkRef: "art_provider" },
  playbackState: "playing", positionMs: null, durationMs: null, observedAtEpochMs: 1000, session: null },
  { state: "connected", stale: false, diagnosticReference: null }, config, "landscape", 1000, 1000)!;
const presentation = { kind: "music-widget" as const, widget: projection };
const desktop = (visible: boolean): SurfaceConfiguration => ({ id: "desktop:primary", kind: "desktop", enabled: true, displayId: "display",
  displayLabel: "Main", autoFollowDisplayName: false, opacity: 1, layers: [{ moduleId: "timers", visible: true }, { moduleId: "music", visible }] });

it("delivers metadata immediately and attaches pending art to the latest progress frame", async () => {
  let finish!: (ref: string | null) => void;
  let currentPresentation = presentation;
  const coordinator = { revision: 1, getCurrentArtwork: () => ({ ref: "art_provider", owner, descriptor }) };
  const resolve = vi.fn(() => new Promise<string | null>(done => { finish = done; }));
  const syncModule = vi.fn<(sync: DesktopModuleSync) => Promise<void>>(async () => {});
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule }, surfaces: { list: async () => [desktop(true)] },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: true, instructions: [] }) }, assets: { resolveTimerModule: vi.fn() },
    music: { runtime: { getModuleSnapshot: async () => ({ moduleId: "music", enabled: true, instructions: [], presentation: currentPresentation }) },
      coordinator, assets: { resolveMusicModule: async () => ({ presentation: currentPresentation, assets: [], missingAssetIds: [], ownerId: "music-owner" }), releaseMusicOwner: vi.fn(async () => {}) },
      artwork: { resolve, issueGrant: vi.fn(() => "grant"), revokeRecipient: vi.fn() } } });
  const work = sink.syncMusic();
  try {
    await vi.waitFor(() => expect(syncModule).toHaveBeenCalledWith(expect.objectContaining({ presentation, artwork: null })), { timeout: 200 });
    await work;
    currentPresentation = { ...presentation, widget: { ...projection, snapshot: { ...projection.snapshot, positionMs: 2000 } } };
    coordinator.revision = 2;
    await sink.syncMusic();
    expect(resolve).toHaveBeenCalledTimes(1);
    finish("art_cached");
    await vi.waitFor(() => expect(syncModule).toHaveBeenLastCalledWith(expect.objectContaining({ presentation: currentPresentation, artwork: expect.objectContaining({ ref: "art_provider" }) })));
    await sink.syncMusic();
    expect(syncModule).toHaveBeenLastCalledWith(expect.objectContaining({ artwork: expect.objectContaining({ ref: "art_provider" }) }));
    expect(resolve).toHaveBeenCalledTimes(1);
  } finally { finish?.(null); await sink.close(); await work; }
});

it.each(["hidden", "closed", "new generation"])("does not revive pending artwork after %s", async action => {
  let surface = desktop(true);
  let finish!: (ref: string | null) => void;
  let signal!: AbortSignal;
  const coordinator = { revision: 1, getCurrentArtwork: () => ({ ref: "art_provider", owner, descriptor }) };
  const resolve = vi.fn((_descriptor, _owner, inputSignal: AbortSignal) => { signal = inputSignal; return new Promise<string | null>(done => { finish = done; }); });
  const issueGrant = vi.fn(() => "grant");
  const syncModule = vi.fn<(sync: DesktopModuleSync) => Promise<void>>(async () => {});
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule }, surfaces: { list: async () => [surface] },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: true, instructions: [] }) }, assets: { resolveTimerModule: vi.fn() },
    music: { runtime: { getModuleSnapshot: async () => ({ moduleId: "music", enabled: true, instructions: [], presentation }) }, coordinator,
      assets: { resolveMusicModule: async () => ({ presentation, assets: [], missingAssetIds: [], ownerId: "music-owner" }), releaseMusicOwner: vi.fn(async () => {}) },
      artwork: { resolve, issueGrant, revokeRecipient: vi.fn() } } });
  try {
    await sink.syncMusic();
    expect(syncModule).toHaveBeenLastCalledWith(expect.objectContaining({ presentation, artwork: null }));
    if (action === "hidden") { surface = desktop(false); await sink.syncMusic(); }
    else if (action === "closed") await sink.close();
    else coordinator.revision = 2;
    const callCount = syncModule.mock.calls.length;
    finish("art_cached");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(issueGrant).not.toHaveBeenCalled();
    expect(syncModule).toHaveBeenCalledTimes(callCount);
    if (action !== "new generation") expect(signal.aborted).toBe(true);
  } finally { finish?.(null); await sink.close(); }
});

it("cancels the old artwork caller when a new track arrives", async () => {
  let currentPresentation = presentation;
  let artworkRef = "art_provider";
  const pending: { signal: AbortSignal; finish: (ref: string | null) => void }[] = [];
  const coordinator = { revision: 1, getCurrentArtwork: () => ({ ref: artworkRef, owner, descriptor }) };
  const resolve = vi.fn((_descriptor, _owner, signal: AbortSignal) => new Promise<string | null>(finish => { pending.push({ signal, finish }); }));
  const issueGrant = vi.fn(() => "grant");
  const syncModule = vi.fn<(sync: DesktopModuleSync) => Promise<void>>(async () => {});
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule }, surfaces: { list: async () => [desktop(true)] },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: true, instructions: [] }) }, assets: { resolveTimerModule: vi.fn() },
    music: { runtime: { getModuleSnapshot: async () => ({ moduleId: "music", enabled: true, instructions: [], presentation: currentPresentation }) }, coordinator,
      assets: { resolveMusicModule: async () => ({ presentation: currentPresentation, assets: [], missingAssetIds: [], ownerId: "music-owner" }), releaseMusicOwner: vi.fn(async () => {}) },
      artwork: { resolve, issueGrant, revokeRecipient: vi.fn() } } });
  try {
    await sink.syncMusic();
    artworkRef = "art_new";
    coordinator.revision++;
    currentPresentation = { ...presentation, widget: { ...projection, snapshot: { ...projection.snapshot,
      track: { ...projection.snapshot.track!, id: "new-track", artworkRef } } } };
    await sink.syncMusic();
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(pending[0]!.signal.aborted).toBe(true);
    pending[0]!.finish("art_old");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(issueGrant).not.toHaveBeenCalled();
    pending[1]!.finish("art_new_cached");
    await vi.waitFor(() => expect(syncModule).toHaveBeenLastCalledWith(expect.objectContaining({ presentation: currentPresentation,
      artwork: expect.objectContaining({ ref: "art_new" }) })));
  } finally { for (const task of pending) task.finish(null); await sink.close(); }
});

it("admits Music only on the selected visible private surface and revokes its art when hidden", async () => {
  let surface = desktop(false);
  const syncModule = vi.fn<(sync: DesktopModuleSync) => Promise<void>>(async () => {});
  const issueGrant = vi.fn(() => `mart_${"a".repeat(43)}`);
  const revokeRecipient = vi.fn();
  const releaseMusicOwner = vi.fn<(owner: string) => Promise<void>>(async () => {});
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule }, surfaces: { list: async () => [surface] },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: true, instructions: [] }) },
    assets: { resolveTimerModule: vi.fn() },
    music: { runtime: { getModuleSnapshot: async () => ({ moduleId: "music", enabled: true, instructions: [], presentation }) },
      coordinator: { revision: 1, getCurrentArtwork: () => ({ ref: "art_provider", owner, descriptor }) },
      assets: { resolveMusicModule: async () => ({ presentation, assets: [], missingAssetIds: [], ownerId: "music-owner" }), releaseMusicOwner },
      artwork: { resolve: async () => "art_cached", issueGrant, revokeRecipient } } });
  await sink.syncMusic();
  expect(issueGrant).not.toHaveBeenCalled();
  expect(syncModule).toHaveBeenLastCalledWith({ moduleId: "music", revision: 1, presentation: null, assets: [], artwork: null });
  surface = desktop(true);
  await sink.syncMusic();
  await vi.waitFor(() => expect(issueGrant).toHaveBeenCalledWith("art_cached", owner, "desktop-music:desktop:primary", expect.any(Number)));
  expect(syncModule).toHaveBeenLastCalledWith(expect.objectContaining({ moduleId: "music", revision: 3,
    artwork: { ref: "art_provider", grant: { handle: `mart_${"a".repeat(43)}`, expiresAt: expect.any(Number) } } }));
  surface = desktop(false);
  await sink.syncMusic();
  expect(revokeRecipient).toHaveBeenCalledWith("desktop-music:desktop:primary");
  expect(releaseMusicOwner).toHaveBeenCalledWith("music-owner");
  expect(syncModule).toHaveBeenLastCalledWith({ moduleId: "music", revision: 4, presentation: null, assets: [], artwork: null });
  expect(syncModule.mock.calls.every(([command]) => command.moduleId === "music")).toBe(true);
  await sink.close();
});

it("drops an old asynchronous Music resolution after the layer becomes hidden", async () => {
  let surface = desktop(true);
  let finish!: (value: { presentation: typeof presentation; assets: []; missingAssetIds: []; ownerId: string }) => void;
  const releaseMusicOwner = vi.fn<(owner: string) => Promise<void>>(async () => {});
  const syncModule = vi.fn<(sync: DesktopModuleSync) => Promise<void>>(async () => {});
  const issueGrant = vi.fn(() => `mart_${"a".repeat(43)}`);
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule }, surfaces: { list: async () => [surface] },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: true, instructions: [] }) }, assets: { resolveTimerModule: vi.fn() },
    music: { runtime: { getModuleSnapshot: async () => ({ moduleId: "music", enabled: true, instructions: [], presentation }) },
      coordinator: { revision: 1, getCurrentArtwork: () => ({ ref: "art_provider", owner, descriptor }) },
      assets: { resolveMusicModule: () => new Promise(resolve => { finish = resolve; }), releaseMusicOwner },
      artwork: { resolve: async () => "art_cached", issueGrant, revokeRecipient: vi.fn() } } });
  const first = sink.syncMusic();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  surface = desktop(false); await sink.syncMusic();
  finish({ presentation, assets: [], missingAssetIds: [], ownerId: "old-owner" }); await first;
  expect(issueGrant).not.toHaveBeenCalled();
  expect(releaseMusicOwner).toHaveBeenCalledWith("old-owner");
  expect(syncModule.mock.calls.map(([sync]) => sync.revision)).toEqual([1]);
  await sink.close();
});

it("drops a resolved desktop Music frame when its coordinator revision becomes obsolete", async () => {
  let finish!: (value: { presentation: typeof presentation; assets: []; missingAssetIds: []; ownerId: string }) => void;
  const coordinator = { revision: 1, getCurrentArtwork: () => ({ ref: "art_provider", owner, descriptor }) };
  const releaseMusicOwner = vi.fn<(owner: string) => Promise<void>>(async () => {});
  const syncModule = vi.fn<(sync: DesktopModuleSync) => Promise<void>>(async () => {});
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule }, surfaces: { list: async () => [desktop(true)] },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: true, instructions: [] }) }, assets: { resolveTimerModule: vi.fn() },
    music: { runtime: { getModuleSnapshot: async () => ({ moduleId: "music", enabled: true, instructions: [], presentation }) },
      coordinator, assets: { resolveMusicModule: () => new Promise(resolve => { finish = resolve; }), releaseMusicOwner },
      artwork: { resolve: async () => "art_cached", issueGrant: vi.fn(() => null), revokeRecipient: vi.fn() } } });
  const work = sink.syncMusic();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  coordinator.revision = 2;
  finish({ presentation, assets: [], missingAssetIds: [], ownerId: "old-owner" });
  await work;
  expect(syncModule).not.toHaveBeenCalled();
  expect(releaseMusicOwner).toHaveBeenCalledWith("old-owner");
  await sink.close();
});
