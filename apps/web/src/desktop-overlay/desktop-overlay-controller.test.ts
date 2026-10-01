import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PrivateDesktopModuleSync, PrivateDesktopVisualBatch, PrivateDesktopVisualCommand, DesktopVisualRendererRequest } from "@stream-jams/core";
import { DesktopOverlayController } from "./desktop-overlay-controller.js";
import type { DesktopOverlayControllerDependencies } from "./desktop-overlay-controller.js";

const config = { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "one", displayLabel: "Main monitor", autoFollowDisplayName: false, opacity: 1, layers: [{ moduleId: "alerts", visible: true }] } as const;
let sequence = 0;
const request = (command: PrivateDesktopVisualCommand, generation = 1): DesktopVisualRendererRequest => ({ protocolVersion: 1, generation, requestId: `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`, command });
function batch(moduleId = "alerts", media = false): PrivateDesktopVisualBatch {
  return { key: { surfaceId: "desktop:primary", moduleId, occurrenceId: moduleId, generation: 1 }, timing: { startsAtEpochMs: 1000, endsAtEpochMs: 3000 },
    instructions: [{ id: "one", moduleId, overlayId: "default", purpose: "live", scope: "module", durationMs: 2000, audio: null, tts: null, text: null,
      visual: media ? { assetId: "asset", mediaType: "image", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } : null }],
    assets: media ? [privateAsset("asset")] : [] };
}
function moduleSync(revision: number, icon = true): PrivateDesktopModuleSync {
  return { moduleId: "timers", revision, presentation: { kind: "timer-stack", stack: {
    targetProfileId: "landscape", region: { layout: { x: 0, y: 0, width: 320, height: 90, zIndex: 1 }, orientation: "vertical", maxVisible: 1 },
    cards: [{ definitionId: "mitts", generation: `g${revision}`, label: "Wear oven mitts", iconAssetId: icon ? "icon" : null, ...(icon ? { iconVersion: "a".repeat(64) } : {}),
      status: "paused", remainingMs: 5000, slot: { x: 0, y: 0, width: 320, height: 90, zIndex: 1 } }], overflowCount: 0
  } }, assets: icon ? [privateAsset("icon")] : [] };
}
function harness() {
  const report = vi.fn(); const changed = vi.fn(); const asset = { url: "blob:asset", dispose: vi.fn() };
  const prepareAsset = vi.fn<DesktopOverlayControllerDependencies["prepareAsset"]>(async () => asset);
  const controller = new DesktopOverlayController({ report, changed, prepareAsset });
  const send = (command: PrivateDesktopVisualCommand) => { const envelope = request(command); controller.receive(envelope); return envelope; };
  const configure = () => send({ type: "configure", config: { ...config, layers: [...config.layers] } });
  return { controller, report, changed, prepareAsset, asset, send, configure };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());
it("returns the original active media failure once and keeps future occurrences usable", async () => {
  const { controller, report, send, configure } = harness(); configure();
  const value = batch(); send({ type: "prepare", batch: value });
  const started = send({ type: "start", key: value.key });
  await vi.advanceTimersByTimeAsync(1000);
  const failure = { referenceId: "err-seek", stage: "seek" as const, message: "Video seek failed", exception: {
    type: "TimedMediaPreparationError", message: "seek mismatch", stack: null, code: null, cause: null, thrownValue: null
  } };
  controller.fail(value.key, failure);
  controller.fail(value.key, failure);
  expect(report.mock.calls.filter(call => call[0].requestId === started.requestId)).toEqual([
    [{ protocolVersion: 1, generation: 1, requestId: started.requestId, result: { type: "error", key: value.key }, failure }]
  ]);
  expect(controller.getSnapshot().occurrences).toHaveLength(0);
  const next = { ...batch(), key: { ...value.key, occurrenceId: "next", generation: 2 } };
  send({ type: "prepare", batch: next }); send({ type: "start", key: next.key });
  expect(controller.getSnapshot().occurrences).toHaveLength(1);
  controller.dispose();
});
it.each(["clear", "replace", "reconfigure"])("acknowledges superseded module icon loads immediately on %s", async action => {
  const { controller, report, send, configure, prepareAsset, asset } = harness(); configure();
  let finish!: (value: typeof asset) => void;
  prepareAsset.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const old = send({ type: "sync-module", ...moduleSync(1) });
  if (action === "reconfigure") send({ type: "configure", config: { ...config, enabled: false, layers: [] } });
  else send({ type: "sync-module", ...moduleSync(2, false), ...(action === "clear" ? { presentation: null } : {}) });
  expect(report.mock.calls.filter(call => call[0].requestId === old.requestId)).toEqual([
    [{ protocolVersion: 1, generation: 1, requestId: old.requestId, result: { type: "ok" } }]
  ]);
  finish(asset); await vi.advanceTimersByTimeAsync(6000);
  expect(report.mock.calls.filter(call => call[0].requestId === old.requestId)).toHaveLength(1);
  expect(asset.dispose).toHaveBeenCalledOnce();
  expect(controller.getSnapshot().modules.map(module => module.revision)).toEqual(action === "replace" ? [2] : []);
  controller.dispose();
});
it("waits for mounted media readiness and retains it while committing a fresh full interval", async () => {
  const { controller, report, send, configure, asset } = harness(); configure();
  const value = { ...batch("alerts", true), deferredStart: true };
  const preparing = send({ type: "prepare", batch: value });
  await vi.advanceTimersByTimeAsync(2000);
  expect(report.mock.calls.some(call => call[0].requestId === preparing.requestId)).toBe(false);
  const view = controller.getSnapshot().occurrences[0]!;
  expect(view.preparing).toBe(true);
  controller.ready(value.key, value.instructions[0]!.id);
  expect(report.mock.lastCall?.[0]).toMatchObject({ requestId: preparing.requestId, result: { type: "ready" } });
  send({ type: "start", key: value.key, timing: { startsAtEpochMs: 2200, endsAtEpochMs: 4200 } });
  expect(controller.getSnapshot().occurrences[0]).toMatchObject({ preparing: false, timing: { startsAtEpochMs: 2200, endsAtEpochMs: 4200 } });
  expect(controller.getSnapshot().occurrences[0]!.assetUrls).toBe(view.assetUrls);
  await vi.advanceTimersByTimeAsync(2199); expect(asset.dispose).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(171); expect(asset.dispose).not.toHaveBeenCalled();
  const diagnostics = { preparationDurationMs: 1800, scheduledStartEpochMs: 2200, actualStartEpochMs: 2370, terminalOutcome: "completed" as const, completionReason: "configured-duration" as const };
  controller.complete(value.key, value.instructions[0]!.id, diagnostics);
  expect(report.mock.lastCall?.[0]).toMatchObject({ result: { type: "complete", diagnostics } });
  expect(asset.dispose).toHaveBeenCalledOnce();
  controller.dispose(); expect(vi.getTimerCount()).toBe(0);
});

it("prepares assets, waits for shared start, then completes exactly at the shared end", async () => {
  const { controller, report, send, configure, asset } = harness(); configure();
  const prepared = send({ type: "prepare", batch: batch("alerts", true) }); await vi.advanceTimersByTimeAsync(0);
  expect(report).toHaveBeenLastCalledWith({ protocolVersion: 1, generation: 1, requestId: prepared.requestId, result: { type: "ready", key: batch().key } });
  const started = send({ type: "start", key: batch().key });
  expect(controller.getSnapshot().occurrences).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1000); expect(controller.getSnapshot().occurrences).toHaveLength(1);
  expect(controller.getSnapshot().occurrences[0]!.instructions[0]).toMatchObject({ targetProfileId: "landscape", timing: { startsAtEpochMs: 1000, endsAtEpochMs: 3000 } });
  expect(controller.getSnapshot().occurrences[0]!.assetUrls.get("asset")).toBe("blob:asset");
  await vi.advanceTimersByTimeAsync(2000);
  expect(report).toHaveBeenLastCalledWith({ protocolVersion: 1, generation: 1, requestId: started.requestId, result: { type: "complete", key: batch().key } });
  expect(controller.getSnapshot().occurrences).toHaveLength(0); expect(asset.dispose).toHaveBeenCalledOnce();
  controller.dispose(); expect(vi.getTimerCount()).toBe(0);
});

it("keeps stable snapshots and asset URLs through hidden/reordered configuration", async () => {
  const { controller, send, configure, asset, changed } = harness(); configure();
  const initial = controller.getSnapshot(); expect(controller.getSnapshot()).toBe(initial);
  send({ type: "prepare", batch: batch("alerts", true) }); await vi.advanceTimersByTimeAsync(1000); send({ type: "start", key: batch().key });
  const active = controller.getSnapshot().occurrences[0]!;
  send({ type: "configure", config: { ...config, opacity: 0.5, layers: [{ moduleId: "future", visible: true }, { moduleId: "alerts", visible: false }] } });
  expect(controller.getSnapshot().occurrences[0]).toBe(active); expect(asset.dispose).not.toHaveBeenCalled();
  expect(controller.getSnapshot().config.layers[1]?.visible).toBe(false); expect(changed).toHaveBeenCalled(); controller.dispose();
});
it("cancels preparation immediately and disposes its late asset without reviving it", async () => {
  const { controller, report, send, configure, asset, prepareAsset } = harness(); configure();
  let finish!: (value: typeof asset) => void; prepareAsset.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const preparing = send({ type: "prepare", batch: batch("alerts", true) });
  const stopped = send({ type: "stop", key: batch().key });
  expect(report).toHaveBeenCalledWith({ protocolVersion: 1, generation: 1, requestId: preparing.requestId, result: { type: "error", key: batch().key } });
  expect(report).toHaveBeenLastCalledWith({ protocolVersion: 1, generation: 1, requestId: stopped.requestId, result: { type: "ok" } });
  finish(asset); await vi.advanceTimersByTimeAsync(0); expect(asset.dispose).toHaveBeenCalledOnce();
  expect(controller.getSnapshot().occurrences).toHaveLength(0); controller.dispose(); expect(vi.getTimerCount()).toBe(0);
});
it("starts late at the shared timing and expires prepared content even without start", async () => {
  const { controller, report, send, configure } = harness(); configure();
  send({ type: "prepare", batch: batch() }); await vi.advanceTimersByTimeAsync(2000); send({ type: "start", key: batch().key });
  expect(controller.getSnapshot().occurrences[0]?.timing.startsAtEpochMs).toBe(1000);
  await vi.advanceTimersByTimeAsync(1000); expect(controller.getSnapshot().occurrences).toHaveLength(0);
  send({ type: "start", key: batch().key }); expect(report.mock.lastCall?.[0].result.type).toBe("error");
  controller.dispose();
  vi.setSystemTime(0); const next = harness(); next.configure(); next.send({ type: "prepare", batch: batch("alerts", true) });
  await vi.advanceTimersByTimeAsync(3000); expect(next.asset.dispose).toHaveBeenCalledOnce();
  next.send({ type: "start", key: batch().key }); expect(next.report.mock.lastCall?.[0].result.type).toBe("error"); next.controller.dispose();
});
it.each(["disable", "rebind", "retry", "close"])("clears active work on %s without replay", async action => {
  const { controller, report, send, configure, asset } = harness(); configure(); send({ type: "prepare", batch: batch("alerts", true) });
  await vi.advanceTimersByTimeAsync(1000); const start = send({ type: "start", key: batch().key });
  if (action === "retry" || action === "close") send({ type: action });
  else send({ type: "configure", config: { ...config, enabled: action !== "disable", displayId: action === "rebind" ? "two" : "one", layers: [...config.layers] } });
  expect(controller.getSnapshot().occurrences).toHaveLength(0); expect(asset.dispose).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledWith({ protocolVersion: 1, generation: 1, requestId: start.requestId, result: { type: "error", key: batch().key } });
  await vi.advanceTimersByTimeAsync(4000); expect(controller.getSnapshot().occurrences).toHaveLength(0); controller.dispose(); expect(vi.getTimerCount()).toBe(0);
});
it("ignores invalid/stale envelopes and duplicate requests without admitting extra work", async () => {
  const { controller, report, send, configure, prepareAsset } = harness();
  send({ type: "prepare", batch: batch("alerts", true) }); expect(prepareAsset).not.toHaveBeenCalled();
  configure(); report.mockClear(); controller.receive({ protocolVersion: 1, generation: 1, requestId: "invalid", command: { type: "retry" } });
  controller.receive(request({ type: "configure", config: { ...config, layers: [] } }, 2)); expect(report).not.toHaveBeenCalled();
  const prepared = send({ type: "prepare", batch: batch("alerts", true) }); controller.receive(prepared); await vi.advanceTimersByTimeAsync(0);
  expect(prepareAsset).toHaveBeenCalledOnce(); expect(report).toHaveBeenCalledTimes(1); controller.dispose();
});
it("bounds preparation to five seconds and retains canceled reservations until the loader settles", async () => {
  const { controller, report, send, configure, prepareAsset } = harness(); configure(); prepareAsset.mockImplementation(() => new Promise(() => {}));
  const long = (id: string) => ({ ...batch(id, true), timing: { startsAtEpochMs: 0, endsAtEpochMs: 10000 }, instructions: batch(id, true).instructions.map(instruction => ({ ...instruction, durationMs: 10000 })) });
  for (let i = 0; i < 64; i++) send({ type: "prepare", batch: long(String(i)) });
  expect(prepareAsset).toHaveBeenCalledTimes(64); await vi.advanceTimersByTimeAsync(5000);
  expect(report.mock.calls.filter(call => call[0].result?.type === "error")).toHaveLength(64);
  send({ type: "retry" }); send({ type: "prepare", batch: long("overflow") }); expect(prepareAsset).toHaveBeenCalledTimes(64);
  expect(report.mock.lastCall?.[0].result.type).toBe("error"); controller.dispose(); expect(vi.getTimerCount()).toBe(0);
});
it("isolates a failed preparation while preserving its exception transport", async () => {
  const { controller, send, configure, prepareAsset, report } = harness(); configure();
  send({ type: "prepare", batch: batch() }); await vi.advanceTimersByTimeAsync(1000); send({ type: "start", key: batch().key });
  prepareAsset.mockRejectedValueOnce(new Error("broken media", { cause: new Error("decode failed") }));
  const failed = send({ type: "prepare", batch: batch("other", true) });
  await vi.advanceTimersByTimeAsync(0);
  expect(report).toHaveBeenCalledWith(expect.objectContaining({
    requestId: failed.requestId,
    result: { type: "error", key: batch("other").key },
    failure: expect.objectContaining({ stage: "source-load", exception: expect.objectContaining({ message: "broken media", cause: expect.objectContaining({ message: "decode failed" }) }) })
  }));
  expect(controller.getSnapshot().occurrences.map(occurrence => occurrence.key.moduleId)).toEqual(["alerts"]); controller.dispose();
});
it("reports rendering failure through the original start and disposes only the affected occurrence", async () => {
  const { controller, report, send, configure, asset } = harness(); configure();
  send({ type: "prepare", batch: batch("alerts", true) }); send({ type: "prepare", batch: batch("other") });
  await vi.advanceTimersByTimeAsync(1000); const start = send({ type: "start", key: batch().key }); send({ type: "start", key: batch("other").key });
  controller.fail(batch().key); controller.fail(batch().key);
  expect(report.mock.calls.filter(call => call[0].requestId === start.requestId)).toEqual([[{ protocolVersion: 1, generation: 1, requestId: start.requestId, result: { type: "error", key: batch().key } }]]);
  expect(controller.getSnapshot().occurrences.map(occurrence => occurrence.key.moduleId)).toEqual(["other"]); expect(asset.dispose).toHaveBeenCalledOnce(); controller.dispose();
});
it("does not mutate published snapshot data when an occurrence is removed", async () => {
  const { controller, send, configure } = harness(); configure(); send({ type: "prepare", batch: batch("alerts", true) });
  await vi.advanceTimersByTimeAsync(1000); send({ type: "start", key: batch().key }); const published = controller.getSnapshot();
  send({ type: "stop", key: batch().key }); expect(controller.getSnapshot()).not.toBe(published);
  expect(published.occurrences[0]!.assetUrls.get("asset")).toBe("blob:asset"); controller.dispose();
});
it("admits multiple large media references without an aggregate body budget", async () => {
  const { controller, send, configure, prepareAsset } = harness(); configure();
  const video = (id: string): PrivateDesktopVisualBatch => {
    const value = batch(id, true); value.instructions[0]!.visual!.mediaType = "video";
    const asset = privateAsset("asset"); asset.reference.snapshot.mimeType = "video/webm";
    asset.reference.snapshot.sizeBytes = 100 * 1024 * 1024; value.assets = [asset]; return value;
  };
  send({ type: "prepare", batch: video("alerts") }); await vi.advanceTimersByTimeAsync(0);
  send({ type: "prepare", batch: video("other") }); await vi.advanceTimersByTimeAsync(0);
  expect(prepareAsset).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(prepareAsset.mock.calls).length).toBeLessThan(2000);
  controller.dispose();
});

it("allows concurrent duration groups in one module while rejecting duplicate full occurrence keys", async () => {
  const { controller, send, configure, report } = harness(); configure(); send({ type: "prepare", batch: batch() });
  send({ type: "prepare", batch: batch() }); expect(report.mock.lastCall?.[0].result.type).toBe("error");
  const second = batch(); second.key.occurrenceId = "second"; second.timing.endsAtEpochMs = 4000; second.instructions[0]!.durationMs = 3000;
  send({ type: "prepare", batch: second }); expect(report.mock.lastCall?.[0].result.type).toBe("ready");
  await vi.advanceTimersByTimeAsync(1000); send({ type: "start", key: batch().key }); send({ type: "start", key: second.key });
  expect(controller.getSnapshot().occurrences).toHaveLength(2); await vi.advanceTimersByTimeAsync(2000);
  expect(controller.getSnapshot().occurrences.map(occurrence => occurrence.key.occurrenceId)).toEqual(["second"]); controller.dispose();
});

it("publishes only complete newer module snapshots and clears their owned URLs", async () => {
  const { controller, send, configure, report, asset, prepareAsset } = harness(); configure();
  const first = send({ type: "sync-module", ...moduleSync(1) }); await vi.advanceTimersByTimeAsync(0);
  expect(controller.getSnapshot().modules[0]).toMatchObject({ moduleId: "timers", revision: 1, presentation: moduleSync(1).presentation });
  expect(controller.getSnapshot().modules[0]!.assetUrls.get(JSON.stringify(["icon", "a".repeat(64)]))).toBe("blob:asset");
  expect(report).toHaveBeenCalledWith({ protocolVersion: 1, generation: 1, requestId: first.requestId, result: { type: "ok" } });
  send({ type: "sync-module", ...moduleSync(0, false) }); await vi.advanceTimersByTimeAsync(0);
  expect(controller.getSnapshot().modules[0]!.revision).toBe(1); expect(asset.dispose).not.toHaveBeenCalled();
  const replacement = { url: "blob:new", dispose: vi.fn() }; prepareAsset.mockResolvedValueOnce(replacement);
  send({ type: "sync-module", ...moduleSync(2) }); await vi.advanceTimersByTimeAsync(0);
  expect(controller.getSnapshot().modules[0]!.revision).toBe(2); expect(asset.dispose).toHaveBeenCalledOnce();
  send({ type: "sync-module", ...{ ...moduleSync(3, false), presentation: null } }); await vi.advanceTimersByTimeAsync(0);
  expect(controller.getSnapshot().modules).toEqual([]); expect(replacement.dispose).toHaveBeenCalledOnce(); controller.dispose();
});

it("does not replace a module snapshot when its next icon fails to load", async () => {
  const { controller, send, configure, prepareAsset, report } = harness(); configure();
  send({ type: "sync-module", ...moduleSync(1, false) }); await vi.advanceTimersByTimeAsync(0);
  prepareAsset.mockRejectedValueOnce(new Error("bad icon")); const failed = send({ type: "sync-module", ...moduleSync(2) });
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.getSnapshot().modules[0]!.revision).toBe(1);
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ requestId: failed.requestId, result: null,
    failure: expect.objectContaining({ stage: "source-load", message: "Desktop timer icons could not be prepared." }) }));
  controller.dispose();
});

function privateAsset(assetId: string): import("@stream-jams/core").PrivateDesktopMediaAsset {
  return { assetId, reference: { protocolVersion: 1, handle: `private_${"a".repeat(43)}`, snapshot: { assetId, version: "a".repeat(64), mimeType: "image/png", sizeBytes: 3, durationMs: null } } };
}

it("preserves two versions of one timer icon and keeps stable sources through same-revision refresh", async () => {
  const { controller, configure, send, prepareAsset } = harness(); configure();
  const sync = moduleSync(1);
  sync.presentation!.stack.region.maxVisible = 2;
  const first = privateAsset("icon");
  const second = privateAsset("icon");
  second.reference.snapshot.version = "b".repeat(64);
  second.reference.handle = `private_${"b".repeat(43)}`;
  sync.assets = [first, second];
  const card = sync.presentation!.stack.cards[0]!;
  sync.presentation!.stack.cards.push({ ...card, definitionId: "other", generation: "other", iconVersion: second.reference.snapshot.version });
  prepareAsset.mockImplementation(async asset => ({ url: `stream-jams-overlay://surface/media/${asset.reference.handle}`, dispose: vi.fn() }));
  send({ type: "sync-module", ...sync });
  await vi.advanceTimersByTimeAsync(0);
  const urls = controller.getSnapshot().modules[0]!.assetUrls;
  expect(urls.size).toBe(2);
  expect(urls.get(JSON.stringify(["icon", "a".repeat(64)]))).not.toBe(urls.get(JSON.stringify(["icon", "b".repeat(64)])));
  send({ type: "sync-module", ...sync });
  await vi.advanceTimersByTimeAsync(0);
  expect(prepareAsset).toHaveBeenCalledTimes(2);
  expect(controller.getSnapshot().modules[0]!.assetUrls).toBe(urls);
  controller.dispose();
});
