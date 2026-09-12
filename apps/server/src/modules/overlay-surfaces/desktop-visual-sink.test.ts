import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DesktopOverlayTransport, DesktopVisualBatch, OverlayInstruction, SurfaceRepository } from "@stream-jams/core";
import { DesktopVisualSink } from "./desktop-visual-sink.js";

function instruction(durationMs = 3000): OverlayInstruction {
  return { id: "text", moduleId: "alerts", overlayId: "default", targetProfileId: "landscape", purpose: "live", scope: "module", durationMs, visual: null, audio: { assetId: "sound", volume: 1 }, tts: null,
    text: { text: "Hello", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } };
}
function harness() {
  const config = { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "one", opacity: 1, layers: [{ moduleId: "alerts", visible: true }] } as const;
  const list = vi.fn<SurfaceRepository["list"]>(async () => [{ ...config, layers: [...config.layers] }]);
  const resolve = vi.fn<(input: Omit<DesktopVisualBatch, "assets">) => Promise<DesktopVisualBatch>>(async input => ({ ...input, assets: [] }));
  const transport = { configure: vi.fn<DesktopOverlayTransport["configure"]>(async () => {}), prepare: vi.fn<DesktopOverlayTransport["prepare"]>(async () => "ready"),
    start: vi.fn<DesktopOverlayTransport["start"]>(async () => {}), stop: vi.fn<DesktopOverlayTransport["stop"]>(async () => {}), retry: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  const sink = new DesktopVisualSink({ transport, surfaces: { list }, assets: { resolve } });
  return { sink, transport, resolve, list, config };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());
it("invalidates pending assets across rebind away and back, blocking intake during apply", async () => {
  const { sink, transport, config, resolve } = harness();
  await sink.configure({ ...config, layers: [...config.layers] });
  let loaded!: (batch: DesktopVisualBatch) => void;
  resolve.mockImplementationOnce(() => new Promise(done => { loaded = done; }));
  const playing = sink.play("old", [instruction()], 0).catch(() => {});
  await vi.advanceTimersByTimeAsync(0);
  let applied!: () => void;
  transport.configure.mockImplementationOnce(() => new Promise(done => { applied = done; }));
  const applying = sink.configure({ ...config, displayId: "two", layers: [...config.layers] });
  await vi.advanceTimersByTimeAsync(0);
  await expect(sink.play("during", [instruction()], 0)).rejects.toThrow();
  applied(); await applying;
  await sink.configure({ ...config, layers: [...config.layers] });
  loaded({ ...resolve.mock.calls[0]![0], assets: [] });
  await playing; await vi.advanceTimersByTimeAsync(0);
  expect(transport.prepare).not.toHaveBeenCalled();
  await sink.close();
});
it("projects editor layout metadata into the strict visual-only transport", async () => {
  const { sink, resolve } = harness();
  const original = instruction();
  const layout = { ...original.text!.layout, layerId: "editor-layer" };
  await sink.play("queue", [{ ...original, text: { ...original.text!, layout } }], 0);
  expect(resolve.mock.calls[0]![0].instructions[0]?.text?.layout).toEqual(original.text!.layout);
  await sink.close();
});
it("cannot overwrite an explicit rebind or start late preparation on its replacement display", async () => {
  const { sink, list, resolve, transport, config } = harness();
  let finish!: (batch: DesktopVisualBatch) => void;
  resolve.mockImplementationOnce(() => new Promise(done => { finish = done; }));
  const playing = sink.play("queue", [instruction()], 0);
  const failed = playing.then(() => false, () => true);
  await vi.advanceTimersByTimeAsync(0);
  list.mockResolvedValue([{ ...config, displayId: "replacement", layers: [...config.layers] }]);
  finish({ ...resolve.mock.calls[0]![0], assets: [] });
  await vi.advanceTimersByTimeAsync(0);
  expect(await failed).toBe(true);
  expect(transport.configure).not.toHaveBeenCalled();
  expect(transport.prepare).not.toHaveBeenCalled();
  expect(transport.start).not.toHaveBeenCalled();
  await sink.close();
});
it("delivers text-only groups with shared timing and waits for all completions", async () => {
  const { sink, transport, resolve } = harness(); const completions: (() => void)[] = [];
  transport.start.mockImplementation(() => new Promise<void>(done => completions.push(done)));
  const originals = [instruction(1000), instruction(2000)]; const finished = vi.fn(); const playing = sink.play("queue", originals, 0).then(finished);
  await vi.advanceTimersByTimeAsync(0);
  expect(resolve).toHaveBeenCalledTimes(2); const first = resolve.mock.calls[0]![0]; const second = resolve.mock.calls[1]![0];
  expect(first.timing).toEqual({ startsAtEpochMs: 0, endsAtEpochMs: 1000 }); expect(second.timing).toEqual({ startsAtEpochMs: 0, endsAtEpochMs: 2000 });
  expect(first.key.occurrenceId).toBe("queue"); expect(first.key.generation).not.toBe(second.key.generation);
  expect(first.instructions[0]?.audio).toBeNull(); expect(originals[0]?.audio).not.toBeNull();
  completions[0]!(); await vi.advanceTimersByTimeAsync(0); expect(finished).not.toHaveBeenCalled();
  completions[1]!(); await playing; expect(finished).toHaveBeenCalledOnce(); await sink.close(); expect(vi.getTimerCount()).toBe(0);
});
it.each(["missing", "hidden", "unbound", "disabled"])("does not resolve assets or dispatch for %s output", async state => {
  const { sink, transport, resolve, list, config } = harness();
  list.mockResolvedValue(state === "missing" ? [] : [{ ...config, enabled: state !== "disabled" && state !== "unbound", displayId: state === "unbound" ? null : "one", layers: [{ moduleId: "alerts", visible: state !== "hidden" }] }]);
  await sink.play("queue", [instruction()], 0); expect(resolve).not.toHaveBeenCalled(); expect(transport.prepare).not.toHaveBeenCalled(); expect(transport.start).not.toHaveBeenCalled(); await sink.close();
});
it("fails only desktop and stops sibling groups when prepare is unavailable", async () => {
  const { sink, transport } = harness(); transport.start.mockImplementation(() => new Promise(() => {}));
  transport.prepare.mockResolvedValueOnce("ready").mockResolvedValueOnce("unavailable");
  await expect(sink.play("queue", [instruction(1000), instruction(2000)], 0)).rejects.toThrow();
  expect(transport.stop).toHaveBeenCalledTimes(2); expect(transport.start).toHaveBeenCalledTimes(1); await sink.close();
});
it("rejects asset failures without preparing transport", async () => {
  const { sink, transport, resolve } = harness(); resolve.mockRejectedValueOnce(new Error("missing media"));
  await expect(sink.play("queue", [instruction()], 0)).rejects.toThrow(); expect(transport.prepare).not.toHaveBeenCalled(); await sink.close();
});
it("cancels pending configuration lookup and ignores its late result", async () => {
  const { sink, list, resolve, transport, config } = harness(); let loaded!: (value: Awaited<ReturnType<SurfaceRepository["list"]>>) => void;
  list.mockImplementationOnce(() => new Promise(done => { loaded = done; }));
  const playing = sink.play("queue", [instruction()], 0).catch(() => {}); await sink.stop("queue"); await playing;
  loaded([{ ...config, layers: [...config.layers] }]); await vi.advanceTimersByTimeAsync(0);
  expect(resolve).not.toHaveBeenCalled(); expect(transport.prepare).not.toHaveBeenCalled(); await sink.close();
});
it("bounds hanging asset resolution and never starts late results after stop or timeout", async () => {
  const { sink, resolve, transport } = harness(); let loaded!: (batch: DesktopVisualBatch) => void;
  resolve.mockImplementationOnce(() => new Promise(done => { loaded = done; }));
  const playing = sink.play("queue", [instruction(10000)], 0).catch(() => {}); await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(5000); await playing;
  const replacement = sink.play("queue", [instruction(10000)], 5000).catch(() => {}); await vi.advanceTimersByTimeAsync(0);
  expect(resolve).toHaveBeenCalledOnce(); loaded({ ...resolve.mock.calls[0]![0], assets: [] }); await vi.advanceTimersByTimeAsync(0);
  await replacement; expect(transport.prepare).toHaveBeenCalledTimes(1); expect(transport.prepare.mock.calls[0]![0].key.generation).not.toBe(resolve.mock.calls[0]![0].key.generation);
  await sink.close(); expect(vi.getTimerCount()).toBe(0);
});
it("close cancels pending assets, blocks new work, and never dispatches the late result", async () => {
  const { sink, resolve, transport } = harness(); let loaded!: (batch: DesktopVisualBatch) => void;
  resolve.mockImplementationOnce(() => new Promise(done => { loaded = done; }));
  const playing = sink.play("queue", [instruction()], 0).catch(() => {}); await vi.advanceTimersByTimeAsync(0);
  await sink.close(); await sink.close(); await playing;
  await expect(sink.play("next", [instruction()], 0)).rejects.toThrow();
  loaded({ ...resolve.mock.calls[0]![0], assets: [] }); await vi.advanceTimersByTimeAsync(0); expect(transport.prepare).not.toHaveBeenCalled(); expect(transport.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it("filters non-Landscape/nonvisual modules, replaces stale timing, and makes duplicate layer IDs unique", async () => {
  const { sink, resolve } = harness();
  const original = { ...instruction(), timing: { startsAtEpochMs: 500, endsAtEpochMs: 3500 } };
  await sink.play("queue", [original, original, { ...instruction(), targetProfileId: "vertical" }, { ...instruction(), moduleId: "other" }, { ...instruction(), text: null }], 0);
  const batch = resolve.mock.calls[0]![0]; expect(batch.instructions).toHaveLength(2);
  expect(new Set(batch.instructions.map(value => value.id)).size).toBe(2);
  expect(batch.instructions[0]?.timing).toEqual({ startsAtEpochMs: 0, endsAtEpochMs: 3000 }); expect(original.timing.startsAtEpochMs).toBe(500); await sink.close();
});
it("never starts after cancellation during transport prepare", async () => {
  const { sink, transport } = harness(); let prepared!: (value: "ready") => void;
  transport.prepare.mockImplementationOnce(() => new Promise(done => { prepared = done; }));
  const playing = sink.play("queue", [instruction()], 0).catch(() => {}); await vi.advanceTimersByTimeAsync(0); await sink.stop("queue"); await playing;
  prepared("ready"); await vi.advanceTimersByTimeAsync(0); expect(transport.start).not.toHaveBeenCalled(); await sink.close();
});
it("expires preparation at the occurrence end when sooner than five seconds", async () => {
  const { sink, resolve, transport } = harness(); resolve.mockImplementationOnce(() => new Promise(() => {}));
  const rejected = vi.fn(); const playing = sink.play("queue", [instruction(1000)], 0).catch(rejected);
  await vi.advanceTimersByTimeAsync(999); expect(rejected).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1); await playing;
  expect(rejected).toHaveBeenCalledOnce(); expect(transport.start).not.toHaveBeenCalled(); await sink.close();
});
it("bounds admission while a resolver hangs and releases queued cancellations", async () => {
  const { sink, resolve } = harness(); resolve.mockImplementation(() => new Promise(() => {}));
  const plays = Array.from({ length: 64 }, (_, index) => sink.play(String(index), [instruction(10000)], 0).catch(() => {}));
  await vi.advanceTimersByTimeAsync(0); await expect(sink.play("overflow", [instruction(10000)], 0)).rejects.toThrow(); expect(resolve).toHaveBeenCalledOnce();
  await sink.stop("1"); const replacement = sink.play("replacement", [instruction(10000)], 0).catch(() => {});
  await expect(sink.play("still-overflow", [instruction(10000)], 0)).rejects.toThrow();
  await sink.close(); await Promise.all([...plays, replacement]); expect(vi.getTimerCount()).toBe(0);
});
it("does not leak admission when start throws synchronously", async () => {
  const { sink, transport } = harness(); transport.start.mockImplementation(() => { throw new Error("sync failure"); });
  for (let i = 0; i < 65; i++) await expect(sink.play(String(i), [instruction()], 0)).rejects.toThrow();
  expect(transport.start).toHaveBeenCalledTimes(65); await sink.close();
});
it("waits for every stop acknowledgement before rejecting failed playback and coalesces explicit stops", async () => {
  const { sink, transport } = harness(); const acknowledge: (() => void)[] = [];
  transport.start.mockImplementation(() => new Promise(() => {}));
  transport.prepare.mockResolvedValueOnce("ready").mockResolvedValueOnce("unavailable");
  transport.stop.mockImplementation(() => new Promise<void>(resolve => acknowledge.push(resolve)));
  const rejected = vi.fn(); const playing = sink.play("queue", [instruction(1000), instruction(2000)], 0).catch(rejected);
  await vi.advanceTimersByTimeAsync(0); expect(transport.stop).toHaveBeenCalledTimes(2); expect(rejected).not.toHaveBeenCalled();
  const first = sink.stop("queue"); const second = sink.stop("queue"); expect(first).toBe(second);
  acknowledge[0]!(); await vi.advanceTimersByTimeAsync(0); expect(rejected).not.toHaveBeenCalled();
  acknowledge[1]!(); await first; await playing; expect(rejected).toHaveBeenCalledOnce(); await sink.close();
});
