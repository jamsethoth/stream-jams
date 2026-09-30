import { afterEach, expect, it, vi } from "vitest";
import { AudioHost, type AudioRendererCallbacks } from "./audio-host.js";
import { audioRendererReplySchema, type AudioRendererRequest } from "./audio-ipc.js";
import { serializeException } from "@stream-jams/core";

afterEach(() => vi.useRealTimers());
const payload = { batch: { playbackId: "one", documentId: "alert", durationMs: 1000, muted: false, layers: [], destinations: [] }, assets: [], startDeadlineMs: 5000, deadlineMs: 10000 };
function harness() {
  const ports: { callbacks: AudioRendererCallbacks; destroy: ReturnType<typeof vi.fn>; sent: AudioRendererRequest[]; reply: boolean }[] = [];
  const host = new AudioHost(callbacks => {
    const port = { callbacks, destroy: vi.fn(), sent: [] as AudioRendererRequest[], reply: true };
    ports.push(port);
    return { load: async () => undefined, destroy: port.destroy, send: (request: AudioRendererRequest) => {
      port.sent.push(request);
      if (port.reply && request.command.type !== "play" && request.command.type !== "start") callbacks.onReply({ generation: request.generation, requestId: request.requestId,
        result: request.command.type === "prepare" ? { type: "prepared", token: request.command.token } : request.command.type === "enumerate" ? { type: "devices", devices: [] } : { type: "ok" } });
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
it("permits immediate first recreation and explicit retry during repeated crash cooldown", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { host, ports } = harness();
  await host.listOutputDevices();
  ports[0]!.callbacks.onDestroyed();
  await host.listOutputDevices();
  expect(ports).toHaveLength(2);
  ports[1]!.callbacks.onDestroyed();
  await host.retry();
  expect(ports).toHaveLength(3);
  await host.close();
});
it("recovers repeatedly after bounded cooldown without replaying interrupted audio", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { host, ports } = harness();
  await host.listOutputDevices();
  for (const delay of [0, 1000, 2000, 4000, 5000, 5000]) {
    const playing = host.play({ ...payload, startDeadlineMs: Date.now() + 1000, deadlineMs: Date.now() + 2000 });
    const rejected = expect(playing).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    const count = ports.length;
    ports.at(-1)!.callbacks.onDestroyed();
    await rejected;
    if (delay > 0) {
      const recovering = host.listOutputDevices().catch((error: unknown) => error);
      host.refreshLease();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(ports).toHaveLength(count);
      await vi.advanceTimersByTimeAsync(1);
      expect(await recovering).toEqual([]);
    }
    await Promise.all([host.listOutputDevices(), host.listOutputDevices()]);
    expect(ports).toHaveLength(count + 1);
    expect(ports.at(-1)!.sent.some(request => request.command.type === "play")).toBe(false);
  }
  ports.at(-1)!.callbacks.onDestroyed();
  const cancelled = expect(host.listOutputDevices()).rejects.toThrow();
  await host.close();
  await cancelled;
  await vi.advanceTimersByTimeAsync(5000);
  await expect(host.listOutputDevices()).rejects.toThrow();
  expect(vi.getTimerCount()).toBe(0);
});
it("restores timed-out ownership from a later lease without changing mute state or eagerly recreating", async () => {
  vi.useFakeTimers();
  const { host, ports } = harness();
  await host.setMuted(false);
  await host.listOutputDevices();
  await vi.advanceTimersByTimeAsync(9000); host.refreshLease();
  await vi.advanceTimersByTimeAsync(9999); expect(ports[0]!.destroy).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1001); expect(ports[0]!.destroy).toHaveBeenCalledOnce();
  await expect(host.retry()).rejects.toThrow();
  host.refreshLease();
  expect(ports).toHaveLength(1);
  await host.listOutputDevices();
  expect(ports).toHaveLength(2);
  expect(ports[1]!.sent[0]!.command).toEqual({ type: "initialize", muted: false });
  await host.close();
});

it("preserves recovery cooldown when a late lease restores ownership", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { host, ports } = harness();
  await host.listOutputDevices();
  ports[0]!.callbacks.onDestroyed();
  await host.listOutputDevices();
  ports[1]!.callbacks.onDestroyed();
  host.serviceLost();

  host.refreshLease();

  const recovering = host.listOutputDevices().catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(999); expect(ports).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(1); expect(await recovering).toEqual([]);
  expect(ports).toHaveLength(3);
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

it("preserves a renderer command exception as the host rejection cause", async () => {
  const { host, ports } = harness();
  await host.listOutputDevices();
  ports[0]!.reply = false;
  const pending = host.listOutputDevices();
  await vi.waitFor(() => expect(ports[0]!.sent).toHaveLength(3));
  const request = ports[0]!.sent.at(-1)!;
  const exception = serializeException(new Error("device enumeration failed", { cause: new Error("audio service unavailable") }));
  const reply = { generation: request.generation, requestId: request.requestId, result: null, exception };
  expect(audioRendererReplySchema.safeParse(reply).success).toBe(true);
  ports[0]!.callbacks.onReply(reply);
  const rejected = await pending.catch((error: unknown) => error);
  const serialized = JSON.stringify(serializeException(rejected));
  expect(serialized).toContain("device enumeration failed");
  expect(serialized).toContain("audio service unavailable");
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

it("carries per-route failures through renderer and host command replies without recreating the renderer", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { host, ports } = harness();
  await host.listOutputDevices();
  const playing = host.handle({ type: "play", payload });
  await vi.advanceTimersByTimeAsync(0);
  const request = ports[0]!.sent.at(-1)!;
  const result = { type: "played" as const, failedRouteIds: ["selected"], failures: [{ routeIds: ["selected"], layerId: "video", assetId: "clip", stage: "seek" as const, exception: serializeException(new Error("seek fixture")) }] };
  ports[0]!.callbacks.onReply({ generation: request.generation, requestId: request.requestId, result });
  expect(await playing).toEqual(result);
  expect(ports[0]!.destroy).not.toHaveBeenCalled();
  await host.listOutputDevices();
  expect(ports).toHaveLength(1);
  await host.close();
});

it("forwards prepared batches without replaying handles after renderer loss", async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const { host, ports } = harness();
  const prepared = await host.prepare(payload);
  expect(ports[0]!.sent.map(request => request.command.type)).toEqual(["initialize", "prepare"]);
  const playing = prepared.start(1500);
  const request = ports[0]!.sent.at(-1)!;
  expect(request.command).toMatchObject({ type: "start", startsAtEpochMs: 1500, durationMs: 1000 });
  ports[0]!.callbacks.onReply({ generation: request.generation, requestId: request.requestId, result: { type: "played", failedRouteIds: [] } });
  expect(await playing).toEqual({ failedRouteIds: [] });
  const interrupted = await host.prepare(payload);
  ports[0]!.callbacks.onDestroyed();
  await expect(interrupted.start(1600)).rejects.toThrow();
  const next = await host.prepare(payload);
  expect(ports).toHaveLength(2);
  expect(ports[1]!.sent.map(item => item.command.type)).toEqual(["initialize", "prepare"]);
  await host.stop("one");
  await expect(next.start(1700)).rejects.toThrow();
  await host.close();
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves renderer timing across the audio host boundary", async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const { host, ports } = harness();
  const playing = host.play(payload);
  await vi.advanceTimersByTimeAsync(0);
  const request = ports[0]!.sent.find(value => value.command.type === "play")!;
  const diagnostics = { preparationDurationMs: 20, scheduledStartEpochMs: 100, actualStartEpochMs: 104, terminalOutcome: "completed" };
  const outputDiagnostics = [{ routeIds: ["selected"], layerId: "intro", assetId: "clip", diagnostics }];
  ports[0]!.callbacks.onReply({ generation: request.generation, requestId: request.requestId, result: { type: "played", failedRouteIds: [], diagnostics, outputDiagnostics } });
  expect(await playing).toEqual({ failedRouteIds: [], diagnostics, outputDiagnostics });
  await host.close();
});
