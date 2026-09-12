import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DesktopVisualBatch, DesktopVisualCommand, DesktopVisualRendererRequest } from "@stream-jams/core";
import { DesktopOverlayController } from "./desktop-overlay-controller.js";
import type { DesktopOverlayControllerDependencies } from "./desktop-overlay-controller.js";

const config = { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "one", opacity: 1, layers: [{ moduleId: "alerts", visible: true }] } as const;
let sequence = 0;
const request = (command: DesktopVisualCommand, generation = 1): DesktopVisualRendererRequest => ({ generation, requestId: `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`, command });
function batch(moduleId = "alerts", media = false): DesktopVisualBatch {
  return { key: { surfaceId: "desktop:primary", moduleId, occurrenceId: moduleId, generation: 1 }, timing: { startsAtEpochMs: 1000, endsAtEpochMs: 3000 },
    instructions: [{ id: "one", moduleId, overlayId: "default", purpose: "live", scope: "module", durationMs: 2000, audio: null, tts: null, text: null,
      visual: media ? { assetId: "asset", mediaType: "image", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } : null }],
    assets: media ? [{ assetId: "asset", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) }] : [] };
}
function harness() {
  const report = vi.fn(); const changed = vi.fn(); const asset = { url: "blob:asset", dispose: vi.fn() };
  const prepareAsset = vi.fn<DesktopOverlayControllerDependencies["prepareAsset"]>(async () => asset);
  const controller = new DesktopOverlayController({ report, changed, prepareAsset });
  const send = (command: DesktopVisualCommand) => { const envelope = request(command); controller.receive(envelope); return envelope; };
  const configure = () => send({ type: "configure", config: { ...config, layers: [...config.layers] } });
  return { controller, report, changed, prepareAsset, asset, send, configure };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());
it("prepares assets, waits for shared start, then completes exactly at the shared end", async () => {
  const { controller, report, send, configure, asset } = harness(); configure();
  const prepared = send({ type: "prepare", batch: batch("alerts", true) }); await vi.advanceTimersByTimeAsync(0);
  expect(report).toHaveBeenLastCalledWith({ generation: 1, requestId: prepared.requestId, result: { type: "ready", key: batch().key } });
  const started = send({ type: "start", key: batch().key });
  expect(controller.getSnapshot().occurrences).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1000); expect(controller.getSnapshot().occurrences).toHaveLength(1);
  expect(controller.getSnapshot().occurrences[0]!.instructions[0]).toMatchObject({ targetProfileId: "landscape", timing: { startsAtEpochMs: 1000, endsAtEpochMs: 3000 } });
  expect(controller.getSnapshot().occurrences[0]!.assetUrls.get("asset")).toBe("blob:asset");
  await vi.advanceTimersByTimeAsync(2000);
  expect(report).toHaveBeenLastCalledWith({ generation: 1, requestId: started.requestId, result: { type: "complete", key: batch().key } });
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
  expect(report).toHaveBeenCalledWith({ generation: 1, requestId: preparing.requestId, result: { type: "error", key: batch().key } });
  expect(report).toHaveBeenLastCalledWith({ generation: 1, requestId: stopped.requestId, result: { type: "ok" } });
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
  expect(report).toHaveBeenCalledWith({ generation: 1, requestId: start.requestId, result: { type: "error", key: batch().key } });
  await vi.advanceTimersByTimeAsync(4000); expect(controller.getSnapshot().occurrences).toHaveLength(0); controller.dispose(); expect(vi.getTimerCount()).toBe(0);
});
it("ignores invalid/stale envelopes and duplicate requests without admitting extra work", async () => {
  const { controller, report, send, configure, prepareAsset } = harness();
  send({ type: "prepare", batch: batch("alerts", true) }); expect(prepareAsset).not.toHaveBeenCalled();
  configure(); report.mockClear(); controller.receive({ generation: 1, requestId: "invalid", command: { type: "retry" } });
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
it("isolates a failed preparation while other modules continue", async () => {
  const { controller, send, configure, prepareAsset } = harness(); configure();
  send({ type: "prepare", batch: batch() }); await vi.advanceTimersByTimeAsync(1000); send({ type: "start", key: batch().key });
  prepareAsset.mockRejectedValueOnce(new Error("broken media")); send({ type: "prepare", batch: batch("other", true) }); await vi.advanceTimersByTimeAsync(0);
  expect(controller.getSnapshot().occurrences.map(occurrence => occurrence.key.moduleId)).toEqual(["alerts"]); controller.dispose();
});
it("reports rendering failure through the original start and disposes only the affected occurrence", async () => {
  const { controller, report, send, configure, asset } = harness(); configure();
  send({ type: "prepare", batch: batch("alerts", true) }); send({ type: "prepare", batch: batch("other") });
  await vi.advanceTimersByTimeAsync(1000); const start = send({ type: "start", key: batch().key }); send({ type: "start", key: batch("other").key });
  controller.fail(batch().key); controller.fail(batch().key);
  expect(report.mock.calls.filter(call => call[0].requestId === start.requestId)).toEqual([[{ generation: 1, requestId: start.requestId, result: { type: "error", key: batch().key } }]]);
  expect(controller.getSnapshot().occurrences.map(occurrence => occurrence.key.moduleId)).toEqual(["other"]); expect(asset.dispose).toHaveBeenCalledOnce(); controller.dispose();
});
it("does not mutate published snapshot data when an occurrence is removed", async () => {
  const { controller, send, configure } = harness(); configure(); send({ type: "prepare", batch: batch("alerts", true) });
  await vi.advanceTimersByTimeAsync(1000); send({ type: "start", key: batch().key }); const published = controller.getSnapshot();
  send({ type: "stop", key: batch().key }); expect(controller.getSnapshot()).not.toBe(published);
  expect(published.occurrences[0]!.assetUrls.get("asset")).toBe("blob:asset"); controller.dispose();
});
it("reserves the aggregate byte budget across ready and active modules and releases on settlement", async () => {
  const { controller, send, configure, prepareAsset, report } = harness(); configure();
  const video = (id: string): DesktopVisualBatch => {
    const value = batch(id, true); value.instructions[0]!.visual!.mediaType = "video";
    value.assets = [{ assetId: "asset", mimeType: "video/webm", bytes: new Uint8Array(65 * 1024 * 1024) }]; return value;
  };
  send({ type: "prepare", batch: video("alerts") }); await vi.advanceTimersByTimeAsync(1000); send({ type: "start", key: batch().key });
  send({ type: "prepare", batch: video("other") }); expect(report.mock.lastCall?.[0].result.type).toBe("error"); expect(prepareAsset).toHaveBeenCalledOnce();
  send({ type: "stop", key: batch().key }); send({ type: "prepare", batch: video("other") }); await vi.advanceTimersByTimeAsync(0);
  expect(report.mock.lastCall?.[0].result.type).toBe("ready"); expect(prepareAsset).toHaveBeenCalledTimes(2); controller.dispose();
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
