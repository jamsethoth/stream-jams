import { afterEach, expect, it, vi } from "vitest";
import { dataOverlayStateSchema, type DataOverlayState, type DesktopModuleSync, type OverlayModuleSnapshot } from "@stream-jams/core";
import { DataOverlayOutputRuntime, createDataOutputRefreshQueue } from "./data-overlay-output-runtime.js";
import { DesktopModuleSnapshotSink } from "../overlay-surfaces/desktop-module-snapshot-sink.js";

const seed = (): DataOverlayState => dataOverlayStateSchema.parse({ revision: 7, values: [{ id: "value", name: "Private definition", kind: "integer", content: 42, resetDefault: 0, revision: 3, createdAt: "2026-10-08T12:00:00Z", updatedAt: "2026-10-08T12:00:00Z", resetGroupId: null }], goals: [], resetGroups: [], pinnedValueIds: [], canvases: [{ id: "canvas", name: "Private canvas", enabled: true, order: 0, targetProfileId: "landscape", outputs: { browser: true, desktop: true }, elements: [{ id: "text", order: 0, kind: "text", x: 0, y: 0, width: 100, height: 40, visible: true, binding: { kind: "value", valueId: "value" }, format: { prefix: "", suffix: "", thousandsSeparator: false, overflow: "wrap" }, style: { color: "#FFFFFFFF", fontSizePx: 24, fontWeight: 400, align: "left" } }, { id: "image", kind: "image", order: 1, x: 100, y: 0, width: 40, height: 40, visible: true, assetId: "asset", fit: "contain" }] }] });
const request = { recipientKind: "browser", moduleId: "data-overlays", overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape" } as const;
const projection = (snapshot: OverlayModuleSnapshot) => { if (snapshot.presentation?.kind !== "data-overlays") throw new Error("Expected data projection"); return snapshot.presentation.projection; };
afterEach(() => vi.useRealTimers());

it("fails closed on future and enormous stale timestamps without scheduling a timer loop", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const state = seed();
  const runtime = new DataOverlayOutputRuntime({ runtimeId: "runtime", getState: () => state, getEnabled: async () => true, outputPaused: () => false, resolveImage: async () => false });
  for (const staleSinceEpochMs of [1000, Number.MAX_VALUE]) {
    runtime.setSourceStatus("value", { state: "stale", staleSinceEpochMs });
    expect(vi.getTimerCount()).toBe(0);
    expect(projection(await runtime.getModuleSnapshot(request)).canvases[0]?.elements).toHaveLength(0);
  }
  runtime.close();
});

it("drops late private grants after hide/close and revokes replaced owners without syncing unrelated modules", async () => {
  const state = seed();
  const runtime = new DataOverlayOutputRuntime({ runtimeId: "runtime", getState: () => state, getEnabled: async () => true, outputPaused: () => false, resolveImage: async () => false });
  const snapshot = await runtime.getModuleSnapshot(request);
  if (snapshot.presentation?.kind !== "data-overlays") throw new Error("Missing projection");
  let visible = true;
  const syncModule = vi.fn(async (_command: DesktopModuleSync) => { void _command; });
  const releaseDataOwner = vi.fn(async () => {});
  let finish!: (value: { presentation: typeof snapshot.presentation; assets: []; ownerId: string }) => void;
  const resolveDataModule = vi.fn().mockResolvedValueOnce({ presentation: snapshot.presentation, assets: [], ownerId: "first" })
    .mockResolvedValueOnce({ presentation: snapshot.presentation, assets: [], ownerId: "second" })
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const sink = new DesktopModuleSnapshotSink({ transport: { syncModule },
    surfaces: { list: async () => [{ id: "desktop:primary", kind: "desktop", enabled: true, displayId: "display", displayLabel: "Display", autoFollowDisplayName: false, opacity: 1, layers: [{ moduleId: "data-overlays", visible }] }] },
    runtime: { getModuleSnapshot: async () => ({ moduleId: "timers", enabled: false, instructions: [] }) },
    assets: { resolveTimerModule: vi.fn() }, data: { runtime, assets: { resolveDataModule, releaseDataOwner } } });
  await sink.syncData(); await sink.syncData(); expect(releaseDataOwner).toHaveBeenCalledWith("first");
  const pending = sink.syncData(); await vi.waitFor(() => expect(resolveDataModule).toHaveBeenCalledTimes(3));
  visible = false; await sink.syncData(); expect(releaseDataOwner).toHaveBeenCalledWith("second");
  finish({ presentation: snapshot.presentation, assets: [], ownerId: "late" }); await pending;
  expect(releaseDataOwner).toHaveBeenCalledWith("late");
  expect(syncModule.mock.calls.every(call => call[0]?.moduleId === "data-overlays")).toBe(true);
  await sink.close(); runtime.close();
});

it("coalesces a ten-thousand command burst into one pending refresh behind slow asset resolution", async () => {
  let release!: () => void;
  const work = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
  const queue = createDataOutputRefreshQueue(work);
  const first = queue.enqueue(); await vi.waitFor(() => expect(work).toHaveBeenCalledOnce());
  const next = queue.enqueue(); for (let i = 0; i < 10000; i++) expect(queue.enqueue()).toBe(next);
  release(); await Promise.all([first, next]); await queue.drain(); expect(work).toHaveBeenCalledTimes(2);
});

it("projects scoped browser/desktop profiles and hides unavailable images without catalog leakage", async () => {
  const state = seed();
  const runtime = new DataOverlayOutputRuntime({ runtimeId: "runtime", getState: () => state, getEnabled: async () => true, outputPaused: () => false, resolveImage: async () => false });
  const result = projection(await runtime.getModuleSnapshot(request));
  expect(result.canvases[0]?.elements).toEqual([expect.objectContaining({ kind: "text", text: "42" })]);
  expect(JSON.stringify(result)).not.toMatch(/Private|resetDefault|valueId|storagePath/);
  expect(projection(await runtime.getModuleSnapshot({ ...request, targetProfileId: "vertical" })).canvases).toEqual([]);
  state.canvases[0]!.outputs.browser = false;
  expect(projection(await runtime.getModuleSnapshot(request)).canvases).toEqual([]);
  expect(projection(await runtime.getModuleSnapshot({ ...request, overlayId: "desktop:primary", scope: "unified", recipientKind: "desktop" })).canvases).toHaveLength(1);
  runtime.close();
});

it("retries late image completions against the latest committed value and output generation", async () => {
  let state = seed();
  let release!: (value: boolean) => void;
  const resolveImage = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { release = resolve; })).mockResolvedValue(true);
  const runtime = new DataOverlayOutputRuntime({ runtimeId: "runtime", getState: () => state, getEnabled: async () => true, outputPaused: () => false, resolveImage });
  const pending = runtime.getModuleSnapshot(request);
  await vi.waitFor(() => expect(resolveImage).toHaveBeenCalledOnce());
  const current = state.values[0]!; if (current.kind !== "integer") throw new Error("Expected integer fixture");
  state = { ...state, revision: 8, values: [{ ...current, content: 43 }] };
  runtime.refresh(); release(true);
  const result = projection(await pending);
  expect(result.revision).toBe(1);
  expect(result.canvases[0]?.elements[0]).toMatchObject({ text: "43" });
  runtime.close();
});

it("expires stale output at600001ms with a newer output revision and unchanged persisted catalog", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const state = seed();
  const runtime = new DataOverlayOutputRuntime({ runtimeId: "runtime", getState: () => state, getEnabled: async () => true, outputPaused: () => false, resolveImage: async () => false });
  const publish = vi.fn(); runtime.subscribe(publish);
  runtime.setSourceStatus("value", { state: "stale", staleSinceEpochMs: 0 });
  await vi.advanceTimersByTimeAsync(600000);
  expect(projection(await runtime.getModuleSnapshot(request)).canvases[0]?.elements).toHaveLength(1);
  const before = runtime.generation;
  await vi.advanceTimersByTimeAsync(1);
  expect(projection(await runtime.getModuleSnapshot(request)).canvases[0]?.elements).toHaveLength(0);
  expect(runtime.generation).toBeGreaterThan(before); expect(state.revision).toBe(7); expect(publish).toHaveBeenCalledTimes(2);
  runtime.setSourceStatus("value", null);
  expect(projection(await runtime.getModuleSnapshot(request)).canvases[0]?.elements).toHaveLength(1);
  runtime.close(); expect(vi.getTimerCount()).toBe(0);
});

it("retains current values through global suppression and disable/re-enable with increasing output revisions", async () => {
  const state = seed(); let enabled = true; let paused = false;
  const runtime = new DataOverlayOutputRuntime({ runtimeId: "runtime", getState: () => state, getEnabled: async () => enabled, outputPaused: () => paused, resolveImage: async () => false });
  const initial = projection(await runtime.getModuleSnapshot(request));
  paused = true; runtime.refresh(); expect(projection(await runtime.getModuleSnapshot(request)).canvases).toEqual([]);
  paused = false; enabled = false; runtime.refresh(); expect(projection(await runtime.getModuleSnapshot(request)).canvases).toEqual([]);
  enabled = true; runtime.refresh(); const resumed = projection(await runtime.getModuleSnapshot(request));
  expect(resumed.revision).toBeGreaterThan(initial.revision); expect(resumed.canvases[0]?.elements[0]).toMatchObject({ text: "42" }); expect(state.revision).toBe(7);
  runtime.close();
});
