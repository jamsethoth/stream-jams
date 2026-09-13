import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DesktopVisualBatch, DesktopVisualReply } from "@stream-jams/core";
import { OverlayHost, type OverlayRendererCallbacks } from "./overlay-host.js";
import type { OverlayRendererRequest } from "./overlay-ipc.js";
import { enumerateDesktopDisplays } from "./overlay-window.js";

vi.mock("electron", () => ({ BrowserWindow: class {}, screen: { getAllDisplays: () => [
  { id: 5, label: " Main display ", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
  { id: 6, label: " ", bounds: { x: -2560, y: -100, width: 2560, height: 1440 }, scaleFactor: 1.5 }
] } }));

const config = { id: "desktop:primary", kind: "desktop", enabled: true, displayId: "one", opacity: 1, layers: [] } as const;
function batch(id = "one"): DesktopVisualBatch {
  return { key: { surfaceId: "desktop:primary", moduleId: id, occurrenceId: id, generation: 1 }, timing: { startsAtEpochMs: 0, endsAtEpochMs: 1000 }, instructions: [], assets: [] };
}
function harness(load = async () => {}, missing = false) {
  const ports: { callbacks: OverlayRendererCallbacks; sent: OverlayRendererRequest[]; destroy: ReturnType<typeof vi.fn>; auto: boolean }[] = [];
  const host = new OverlayHost((_config, callbacks) => {
    if (missing) return null;
    const port = { callbacks, sent: [] as OverlayRendererRequest[], destroy: vi.fn(), auto: true };
    ports.push(port);
    return { load, destroy: port.destroy, send(request) {
      port.sent.push(request);
      if (port.auto && request.command.type !== "start") reply(port, request, request.command.type === "prepare" ? { type: "ready", key: request.command.batch.key } : { type: "ok" });
    } };
  });
  host.beginOwnership();
  return { host, ports };
}
function reply(port: { callbacks: OverlayRendererCallbacks }, request: OverlayRendererRequest, result: DesktopVisualReply) {
  port.callbacks.onReply({ generation: request.generation, requestId: request.requestId, result });
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => vi.useRealTimers());

it("requires explicit configuration and completes start only for its matching key", async () => {
  const { host, ports } = harness();
  expect(await host.prepare(batch())).toBe("unavailable");
  await host.configure({ ...config, layers: [] }); expect(ports).toHaveLength(0);
  expect(await host.prepare(batch())).toBe("ready");
  const done = vi.fn(); const playing = host.start(batch().key).then(done);
  await vi.advanceTimersByTimeAsync(0);
  const request = ports[0]!.sent.at(-1)!;
  reply(ports[0]!, request, { type: "complete", key: batch("wrong").key });
  await vi.advanceTimersByTimeAsync(0); expect(done).not.toHaveBeenCalled();
  reply(ports[0]!, request, { type: "complete", key: batch().key });
  await playing; expect(done).toHaveBeenCalledOnce(); await host.close();
});
it("settles loading immediately on cancellation and ignores a late load", async () => {
  let loaded!: () => void;
  const { host, ports } = harness(() => new Promise<void>(resolve => { loaded = resolve; }));
  await host.configure({ ...config, layers: [] });
  const preparing = host.prepare(batch());
  await host.stop(batch().key);
  expect(await preparing).toBe("unavailable"); expect(ports[0]!.destroy).toHaveBeenCalledOnce();
  loaded(); await vi.advanceTimersByTimeAsync(0);
  expect(ports[0]!.sent).toHaveLength(0); await host.close(); expect(vi.getTimerCount()).toBe(0);
});
it("bounds load to five seconds and permits one recreation then explicit Retry", async () => {
  const { host, ports } = harness(() => new Promise(() => {}));
  await host.configure({ ...config, layers: [] });
  const first = host.prepare(batch()); await vi.advanceTimersByTimeAsync(5000); expect(await first).toBe("unavailable");
  const second = host.prepare({ ...batch(), timing: { startsAtEpochMs: 5000, endsAtEpochMs: 15000 } }); host.refreshLease(); await vi.advanceTimersByTimeAsync(5000); expect(await second).toBe("unavailable");
  expect(await host.prepare(batch())).toBe("unavailable"); expect(ports).toHaveLength(2);
  const retry = host.retry().catch(() => {}); await vi.advanceTimersByTimeAsync(0); expect(ports).toHaveLength(3);
  await host.close(); await retry;
});
it("destroys synchronously on service loss and settles every active module", async () => {
  const { host, ports } = harness(); await host.configure({ ...config, layers: [] });
  await host.prepare(batch()); await host.prepare(batch("two"));
  const first = host.start(batch().key).catch(() => {}); const second = host.start(batch("two").key).catch(() => {});
  host.serviceLost(); expect(ports[0]!.destroy).toHaveBeenCalledOnce(); await Promise.all([first, second]);
  expect(vi.getTimerCount()).toBe(0);
});
it("expires ownership at 10000ms and has no timers after close", async () => {
  const { host } = harness(); await host.configure({ ...config, layers: [] });
  await vi.advanceTimersByTimeAsync(9999); await host.retry();
  await vi.advanceTimersByTimeAsync(1); await expect(host.retry()).rejects.toThrow();
  await host.close(); await host.close(); expect(vi.getTimerCount()).toBe(0);
});
it("rejects duplicates and expired starts and applies opacity without replay", async () => {
  const { host, ports } = harness(); await host.configure({ ...config, layers: [] });
  expect(await host.prepare(batch())).toBe("ready"); expect(await host.prepare(batch())).toBe("unavailable");
  await host.configure({ ...config, opacity: 0.5, layers: [] });
  expect(ports[0]!.sent.map(request => request.command.type)).toEqual(["configure", "prepare", "configure"]);
  await vi.advanceTimersByTimeAsync(1000); await expect(host.start(batch().key)).rejects.toThrow();
  expect(await host.prepare(batch("expired"))).toBe("unavailable"); await host.close();
});
it("destroys the failed renderer at absolute end plus 5000 without extending playback", async () => {
  const { host, ports } = harness(); await host.configure({ ...config, layers: [] }); await host.prepare(batch());
  const playing = host.start(batch().key).catch(() => {});
  await vi.advanceTimersByTimeAsync(5999); expect(ports[0]!.destroy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await playing; expect(ports[0]!.destroy).toHaveBeenCalledOnce(); await host.close();
});

it("ignores stale renderer callbacks after rebind and does not consume recovery for missing displays", async () => {
  const { host, ports } = harness(); await host.configure({ ...config, layers: [] }); await host.prepare(batch());
  await host.configure({ ...config, displayId: "two", layers: [] }); await host.prepare(batch());
  ports[0]!.callbacks.onDestroyed(); ports[0]!.callbacks.onUnavailable();
  const playing = host.start(batch().key); const request = ports[1]!.sent.at(-1)!;
  ports[0]!.callbacks.onReply({ generation: request.generation, requestId: request.requestId, result: { type: "complete", key: batch().key } });
  reply(ports[1]!, request, { type: "complete", key: batch().key }); await playing;
  for (let i = 0; i < 3; i++) { ports.at(-1)!.callbacks.onUnavailable(); expect(await host.prepare(batch())).toBe("ready"); }
  await host.close();
  const absent = harness(undefined, true); await absent.host.configure({ ...config, layers: [] });
  expect(await absent.host.prepare(batch())).toBe("unavailable"); await absent.host.close();
});

it("coalesces stop and keeps new same-key work safe from old start cleanup", async () => {
  const { host, ports } = harness(); await host.configure({ ...config, layers: [] }); await host.prepare(batch());
  const playing = host.start(batch().key).catch(() => {}); ports[0]!.auto = false;
  const first = host.stop(batch().key); const second = host.stop(batch().key);
  expect(first).toBe(second);
  const stopRequest = ports[0]!.sent.at(-1)!;
  reply(ports[0]!, stopRequest, { type: "ok" }); await first;
  ports[0]!.auto = true; expect(await host.prepare(batch())).toBe("ready"); await playing;
  const next = host.start(batch().key); reply(ports[0]!, ports[0]!.sent.at(-1)!, { type: "complete", key: batch().key }); await next;
  expect(ports[0]!.sent.filter(request => request.command.type === "stop")).toHaveLength(1); await host.close();
});

it("bounds admitted occurrences to 64 and releases capacity on stop", async () => {
  const { host } = harness(); await host.configure({ ...config, layers: [] });
  for (let i = 0; i < 64; i++) expect(await host.prepare(batch(String(i)))).toBe("ready");
  expect(await host.prepare(batch("overflow"))).toBe("unavailable");
  await host.stop(batch("0").key); expect(await host.prepare(batch("overflow"))).toBe("ready"); await host.close();
});

it("rejects audio payloads at the host boundary", async () => {
  const { host } = harness(); await host.configure({ ...config, layers: [] });
  await expect(host.handle({ type: "prepare", batch: { ...batch(), audio: {} } } as never)).rejects.toThrow(); await host.close();
});

it("retains a stopping occurrence until acknowledgement even when prepare replies first", async () => {
  const { host, ports } = harness(); await host.configure({ ...config, layers: [] }); await host.retry(); ports[0]!.auto = false;
  const preparing = host.prepare(batch()); await vi.advanceTimersByTimeAsync(0);
  const prepareRequest = ports[0]!.sent.at(-1)!;
  const stopped = host.stop(batch().key); const stopRequest = ports[0]!.sent.at(-1)!;
  reply(ports[0]!, prepareRequest, { type: "ready", key: batch().key }); expect(await preparing).toBe("unavailable");
  ports[0]!.auto = true; expect(await host.prepare(batch())).toBe("unavailable");
  reply(ports[0]!, stopRequest, { type: "ok" }); await stopped;
  expect(await host.prepare(batch())).toBe("ready"); await host.close();
});

it("reserves aggregate bytes across batches and releases them after stop", async () => {
  const { host } = harness(); await host.configure({ ...config, layers: [] });
  const media = (id: string): DesktopVisualBatch => ({ ...batch(id), instructions: [{ id: "video", overlayId: "default", moduleId: id, purpose: "live", scope: "module", durationMs: 1000, audio: null, tts: null, text: null,
    visual: { assetId: "asset", mediaType: "video", layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } }],
    assets: [{ assetId: "asset", mimeType: "video/webm", bytes: new Uint8Array(65 * 1024 * 1024) }] });
  expect(await host.prepare(media("first"))).toBe("ready");
  expect(await host.prepare(media("second"))).toBe("unavailable");
  await host.stop(batch("first").key); expect(await host.prepare(media("second"))).toBe("ready"); await host.close();
});

it("bounds initial configuration acknowledgement and never sends expired content after loading", async () => {
  let loaded!: () => void;
  const { host, ports } = harness(() => new Promise<void>(resolve => { loaded = resolve; }));
  await host.configure({ ...config, layers: [] }); const preparing = host.prepare(batch());
  await vi.advanceTimersByTimeAsync(1500); loaded(); await vi.advanceTimersByTimeAsync(0);
  expect(await preparing).toBe("unavailable"); expect(ports[0]!.sent.map(request => request.command.type)).toEqual(["configure"]);
  await host.close();
  vi.setSystemTime(0);
  const next = harness(); await next.host.configure({ ...config, layers: [] }); const pending = next.host.prepare(batch()); next.ports[0]!.auto = false;
  await vi.advanceTimersByTimeAsync(1999); expect(next.ports[0]!.destroy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(await pending).toBe("unavailable"); expect(next.ports[0]!.destroy).toHaveBeenCalledOnce(); await next.host.close();
});

it("disabling output settles active work and requires enabled configuration before recreation", async () => {
  const { host, ports } = harness(); await host.configure({ ...config, layers: [] }); await host.prepare(batch());
  const playing = host.start(batch().key).catch(() => {});
  await host.configure({ ...config, enabled: false, layers: [] }); await playing;
  expect(ports[0]!.destroy).toHaveBeenCalledOnce(); expect(await host.prepare(batch())).toBe("unavailable");
  await host.configure({ ...config, layers: [] }); expect(ports).toHaveLength(1);
  expect(await host.prepare(batch())).toBe("ready"); await host.close();
});
it("reports ownership and lazy display capability without creating a renderer", async () => {
  const create = vi.fn(() => null);
  const displays = [{ id: "one", label: "Display one", bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }];
  const host = new OverlayHost(create, () => ({ available: true, displays }));
  expect((await host.getStatus()).state).toBe("unavailable"); host.beginOwnership();
  expect((await host.getStatus()).state).toBe("disabled"); await host.configure({ ...config, layers: [] });
  expect((await host.handle({ type: "status" }))).toMatchObject({ type: "status", status: { available: true, state: "ready", displays } });
  expect(create).not.toHaveBeenCalled(); displays.length = 0;
  expect(await host.getStatus()).toMatchObject({ state: "unavailable", message: expect.stringMatching(/display/i) });
  expect(create).not.toHaveBeenCalled(); await host.close(); expect((await host.getStatus()).state).toBe("unavailable");
  const unsupported = new OverlayHost(create); unsupported.beginOwnership(); expect(await unsupported.getStatus()).toMatchObject({ available: false, state: "unavailable", displays: [] }); await unsupported.close();
});
it("status preserves the crash budget and reports explicit Retry recovery", async () => {
  const callbacks: OverlayRendererCallbacks[] = [];
  const host = new OverlayHost((_config, callback) => {
    callbacks.push(callback);
    return { load: async () => {}, destroy() {}, send(request) {
      callback.onReply({ generation: request.generation, requestId: request.requestId, result: request.command.type === "prepare" ? { type: "ready", key: request.command.batch.key } : { type: "ok" } });
    } };
  }, () => ({ available: true, displays: [{ id: "one", label: "One", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }] }));
  host.beginOwnership(); await host.configure({ ...config, layers: [] }); await host.prepare(batch()); callbacks[0]!.onDestroyed();
  expect((await host.getStatus()).state).toBe("ready"); await host.prepare(batch()); callbacks[1]!.onDestroyed();
  expect(await host.getStatus()).toMatchObject({ state: "failed", message: expect.stringMatching(/retry/i) });
  expect((await host.getStatus()).state).toBe("failed"); expect(callbacks).toHaveLength(2);
  await host.retry(); expect((await host.getStatus()).state).toBe("ready"); await host.close();
});
it("enumerates current Electron display labels, fallback identity and mixed-DPI bounds", () => {
  expect(enumerateDesktopDisplays()).toEqual([
    { id: "5", label: "Main display", bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: "6", label: "Display 6", bounds: { x: -2560, y: -100, width: 2560, height: 1440 }, scaleFactor: 1.5 }
  ]);
});
it("returns safe capability failure without exposing callback errors or opening media", async () => {
  const create = vi.fn(() => null); const host = new OverlayHost(create, () => { throw new Error("private callback details"); });
  host.beginOwnership(); expect(await host.getStatus()).toMatchObject({ available: false, displays: [], state: "unavailable" });
  expect((await host.getStatus()).message).not.toContain("private"); expect(create).not.toHaveBeenCalled(); await host.close();
});
