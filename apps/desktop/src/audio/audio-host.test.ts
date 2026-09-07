import { afterEach, expect, it, vi } from "vitest";
import { AudioHost, type AudioRendererCallbacks } from "./audio-host.js";
import type { AudioRendererRequest } from "./audio-ipc.js";

afterEach(() => vi.useRealTimers());
const payload = { batch: { playbackId: "one", documentId: "alert", durationMs: 1000, muted: false, layers: [], destinations: [] }, assets: [], startDeadlineMs: 5000, deadlineMs: 10000 };
function harness() {
  const ports: { callbacks: AudioRendererCallbacks; destroy: ReturnType<typeof vi.fn>; sent: AudioRendererRequest[]; reply: boolean }[] = [];
  const host = new AudioHost(callbacks => {
    const port = { callbacks, destroy: vi.fn(), sent: [] as AudioRendererRequest[], reply: true };
    ports.push(port);
    return { load: async () => undefined, destroy: port.destroy, send: (request: AudioRendererRequest) => {
      port.sent.push(request);
      if (port.reply && request.command.type !== "play") callbacks.onReply({ generation: request.generation, requestId: request.requestId,
        result: request.command.type === "enumerate" ? { type: "devices", devices: [] } : { type: "ok" } });
    } };
  });
  host.beginOwnership();
  return { host, ports };
}
it("destroys only its own renderer when stop acknowledgement exceeds two seconds", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { host, ports } = harness();
  await host.listOutputDevices();
  const playing = host.play(payload).catch(() => undefined);
  await vi.advanceTimersByTimeAsync(0);
  ports[0]!.reply = false;
  const stopped = host.stop("one");
  await vi.advanceTimersByTimeAsync(1999);
  expect(ports[0]!.destroy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  await stopped; await playing;
  expect(ports[0]!.destroy).toHaveBeenCalledOnce();
  await host.close();
});
it("permits one automatic recreation, rejects stale replies and needs explicit retry after the second crash", async () => {
  const { host, ports } = harness();
  await host.listOutputDevices();
  ports[0]!.callbacks.onDestroyed();
  await host.listOutputDevices();
  expect(ports).toHaveLength(2);
  ports[1]!.callbacks.onDestroyed();
  await expect(host.listOutputDevices()).rejects.toThrow();
  await host.retry();
  expect(ports).toHaveLength(3);
  await host.close();
});
it("expires the service lease after ten seconds and never recreates until new ownership", async () => {
  vi.useFakeTimers();
  const { host, ports } = harness();
  await host.listOutputDevices();
  await vi.advanceTimersByTimeAsync(9000); host.refreshLease();
  await vi.advanceTimersByTimeAsync(9999); expect(ports[0]!.destroy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1001); expect(ports[0]!.destroy).toHaveBeenCalledOnce();
  await expect(host.retry()).rejects.toThrow();
  await host.close();
});

it("rejects stale and malformed replies without allowing them to complete current work", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { host, ports } = harness();
  await host.listOutputDevices();
  const playing = host.play(payload);
  await vi.advanceTimersByTimeAsync(0);
  const request = ports[0]!.sent.at(-1)!;
  const done = vi.fn(); void playing.then(done);
  ports[0]!.callbacks.onReply({ generation: request.generation - 1, requestId: request.requestId, result: { type: "played", failedRouteIds: [] } });
  ports[0]!.callbacks.onReply({ generation: request.generation, requestId: request.requestId, result: { type: "played", failedRouteIds: [], path: "secret" } });
  await vi.advanceTimersByTimeAsync(0); expect(done).not.toHaveBeenCalled();
  ports[0]!.callbacks.onReply({ generation: request.generation, requestId: request.requestId, result: { type: "played", failedRouteIds: [] } });
  expect(await playing).toEqual({ failedRouteIds: [] });
  await host.close();
});

it("never sends a delayed play after cancellation during renderer loading", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  let loaded!: () => void;
  const send = vi.fn(); const destroy = vi.fn();
  const host = new AudioHost(() => ({ load: () => new Promise<void>(resolve => { loaded = resolve; }), send, destroy }));
  host.beginOwnership();
  const playing = host.play(payload).catch(() => undefined);
  const stopped = host.stop("one");
  await vi.advanceTimersByTimeAsync(2000); await stopped;
  loaded(); await playing;
  expect(send.mock.calls.some(([request]) => request.command.type === "play")).toBe(false);
  expect(destroy).toHaveBeenCalledOnce();
  await host.close();
});

it("initializes every new renderer with authoritative mute and destroys stalled terminal work", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { host, ports } = harness();
  await host.setMuted(true); await host.listOutputDevices();
  expect(ports[0]!.sent[0]!.command).toEqual({ type: "initialize", muted: true });
  const playing = host.play({ ...payload, deadlineMs: 1000 }).catch(() => undefined);
  await vi.advanceTimersByTimeAsync(6000); await playing;
  expect(ports[0]!.destroy).toHaveBeenCalledOnce();
  await host.listOutputDevices();
  expect(ports[1]!.sent[0]!.command).toEqual({ type: "initialize", muted: true });
  host.serviceLost();
  expect(ports[1]!.destroy).toHaveBeenCalledOnce();
});
