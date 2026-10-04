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
  expect(issueGrant).toHaveBeenCalledWith("art_cached", owner, "desktop-music:desktop:primary", expect.any(Number));
  expect(syncModule).toHaveBeenLastCalledWith(expect.objectContaining({ moduleId: "music", revision: 2,
    artwork: { ref: "art_provider", grant: { handle: `mart_${"a".repeat(43)}`, expiresAt: expect.any(Number) } } }));
  surface = desktop(false);
  await sink.syncMusic();
  expect(revokeRecipient).toHaveBeenCalledWith("desktop-music:desktop:primary");
  expect(releaseMusicOwner).toHaveBeenCalledWith("music-owner");
  expect(syncModule).toHaveBeenLastCalledWith({ moduleId: "music", revision: 3, presentation: null, assets: [], artwork: null });
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
  expect(syncModule.mock.calls.map(([sync]) => sync.revision)).toEqual([2]);
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
