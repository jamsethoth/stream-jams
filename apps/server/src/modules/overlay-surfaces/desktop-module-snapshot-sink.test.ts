import { expect, it, vi } from "vitest";
import type { DesktopModuleSync, OverlayModulePresentation, SurfaceConfiguration } from "@stream-jams/core";
import { DesktopModuleSnapshotSink } from "./desktop-module-snapshot-sink.js";

const presentation: OverlayModulePresentation = { kind: "timer-stack", stack: {
  targetProfileId: "landscape", region: { layout: { x: 0, y: 0, width: 320, height: 90, zIndex: 1 }, orientation: "vertical", maxVisible: 1 },
  cards: [{ definitionId: "mitts", generation: "g1", label: "Wear oven mitts", iconAssetId: "missing", status: "paused", remainingMs: 5000,
    slot: { x: 0, y: 0, width: 320, height: 90, zIndex: 1 } }], overflowCount: 0
} };
const desktop = (visible = true): SurfaceConfiguration => ({ id: "desktop:primary", kind: "desktop", enabled: true, displayId: "one",
  displayLabel: "Main", autoFollowDisplayName: false, opacity: 1, layers: [{ moduleId: "timers", visible }] });

it.each(["clear", "close", "replace"])("drops asset resolution superseded by %s", async action => {
  const syncModule = vi.fn<(sync: DesktopModuleSync) => Promise<void>>(async () => {});
  let surfaces: SurfaceConfiguration[] = [desktop()];
  const resolved = { presentation, assets: [], missingAssetIds: [] };
  let finish!: (value: typeof resolved) => void;
  const resolveTimerModule = vi.fn(async () => resolved);
  resolveTimerModule.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule }, surfaces: { list: async () => surfaces },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: true, instructions: [], presentation }) },
    assets: { resolveTimerModule } });
  const first = sink.sync(); await vi.waitFor(() => expect(resolveTimerModule).toHaveBeenCalledOnce());
  if (action === "close") await sink.close();
  else { if (action === "clear") surfaces = [desktop(false)]; await sink.sync(); }
  finish(resolved); await first;
  expect(syncModule).toHaveBeenCalledTimes(1);
  expect(syncModule).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, presentation: action === "replace" ? presentation : null }));
});

it("drops stale surface lookups before they can clear newer content", async () => {
  const syncModule = vi.fn<(sync: DesktopModuleSync) => Promise<void>>(async () => {});
  let finish!: (value: SurfaceConfiguration[]) => void;
  const list = vi.fn(async () => [desktop()]);
  list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule }, surfaces: { list },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: true, instructions: [], presentation }) },
    assets: { resolveTimerModule: async () => ({ presentation, assets: [], missingAssetIds: [] }) } });
  const first = sink.sync(); await sink.sync(); finish([desktop(false)]); await first;
  expect(syncModule).toHaveBeenCalledTimes(1);
  expect(syncModule).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, presentation }));
});

it("sends resolved timer snapshots only to a visible configured desktop layer", async () => {
  const syncModule = vi.fn<(sync: DesktopModuleSync) => Promise<void>>(async () => {});
  let surfaces: SurfaceConfiguration[] = [desktop()];
  const logger = { warn: vi.fn(async () => {}) };
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule }, surfaces: { list: async () => surfaces },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: true, instructions: [], presentation }) },
    assets: { resolveTimerModule: async () => ({ presentation: { ...presentation, stack: { ...presentation.stack,
      cards: presentation.stack.cards.map(card => ({ ...card, iconAssetId: null })) } }, assets: [], missingAssetIds: ["missing"] }) },
    logger, generateReferenceId: () => "ref_timer" });
  await sink.sync();
  expect(syncModule).toHaveBeenLastCalledWith(expect.objectContaining({ moduleId: "timers", revision: 1,
    presentation: expect.objectContaining({ kind: "timer-stack" }), assets: [] }));
  expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Timer icons"), expect.objectContaining({ correlationId: "ref_timer" }));
  surfaces = [desktop(false)]; await sink.sync();
  expect(syncModule).toHaveBeenLastCalledWith({ moduleId: "timers", revision: 2, presentation: null, assets: [] });
  await sink.close();
  expect(syncModule).toHaveBeenLastCalledWith({ moduleId: "timers", revision: 3, presentation: null, assets: [] });
});

it("clears desktop presentation when timers are disabled or empty", async () => {
  const syncModule = vi.fn<(sync: DesktopModuleSync) => Promise<void>>(async () => {});
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule }, surfaces: { list: async () => [desktop()] },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: false, instructions: [], presentation }) },
    assets: { resolveTimerModule: vi.fn() } });
  await sink.sync();
  expect(syncModule).toHaveBeenCalledWith({ moduleId: "timers", revision: 1, presentation: null, assets: [] });
});
