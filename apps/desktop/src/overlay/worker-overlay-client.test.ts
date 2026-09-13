import { afterEach, expect, it, vi } from "vitest";
import { WorkerOverlayClient } from "./worker-overlay-client.js";
import type { OverlayWorkerMessage } from "./overlay-ipc.js";

afterEach(() => vi.useRealTimers());
const key = { surfaceId: "desktop:primary" as const, moduleId: "alerts", occurrenceId: "one", generation: 1 };
const config = { id: "desktop:primary" as const, kind: "desktop" as const, enabled: false, displayId: null, opacity: 1, layers: [] };
it("requests status and rejects wrong result types or a lost host safely", async () => {
  vi.useFakeTimers(); const messages: OverlayWorkerMessage[] = []; const client = new WorkerOverlayClient(3, message => messages.push(message));
  const status = { available: true, displays: [], state: "disabled", message: null };
  const result = client.getStatus(); const query = messages[0]!;
  expect(query).toMatchObject({ command: { type: "status" } });
  client.receive({ type: "overlay-response", generation: 3, requestId: query.requestId, result: { type: "status", status } });
  expect(await result).toEqual(status);
  const wrong = client.getStatus(); const rejection = expect(wrong).rejects.toThrow(/unavailable/i);
  client.receive({ type: "overlay-response", generation: 3, requestId: messages[1]!.requestId, result: { type: "ok" } }); await rejection;
  const lost = client.getStatus(); const lostRejection = expect(lost).rejects.toThrow(/unavailable/i); client.dispose(); await lostRejection;
  await expect(client.getStatus()).rejects.toThrow(/unavailable/i); expect(vi.getTimerCount()).toBe(0);
});
it("ignores malformed status authority and completes only with the validated response", async () => {
  vi.useFakeTimers(); const messages: OverlayWorkerMessage[] = []; const client = new WorkerOverlayClient(3, message => messages.push(message));
  const received = vi.fn(); const pending = client.getStatus().then(received); const query = messages[0]!;
  const status = { available: false, displays: [], state: "unavailable", message: "Start the desktop app." };
  client.receive({ type: "overlay-response", generation: 3, requestId: query.requestId, result: { type: "status", status: { ...status, audio: {} } } });
  await vi.advanceTimersByTimeAsync(0); expect(received).not.toHaveBeenCalled();
  client.receive({ type: "overlay-response", generation: 3, requestId: query.requestId, result: { type: "status", status } });
  await pending; expect(received).toHaveBeenCalledWith(status); client.dispose(); expect(vi.getTimerCount()).toBe(0);
});

it("sends a lease every two seconds and ignores stale or wrong-request replies", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(3, message => messages.push(message));
  const pending = client.configure(config);
  const request = messages[0]!;
  let settled = false;
  void pending.then(() => { settled = true; });
  client.receive({ type: "overlay-response", generation: 2, requestId: request.requestId, result: { type: "ok" } });
  await vi.advanceTimersByTimeAsync(2000);
  expect(settled).toBe(false);
  expect(messages[1]).toEqual({ type: "overlay-lease", generation: 3, requestId: null });
  client.receive({ type: "overlay-response", generation: 3, requestId: request.requestId, result: { type: "ok" } });
  await pending;
  client.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not complete a different occurrence or generation with a valid request ID", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(1, message => messages.push(message));
  const batch = { key, timing: { startsAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 1000 }, instructions: [], assets: [] };
  const pending = client.prepare(batch);
  const request = messages[0]!;
  client.receive({ type: "overlay-response", generation: 1, requestId: request.requestId, result: { type: "ready", key: { ...key, generation: 2 } } });
  let settled = false;
  void pending.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(1);
  expect(settled).toBe(false);
  client.receive({ type: "overlay-response", generation: 1, requestId: request.requestId, result: { type: "ready", key } });
  expect(await pending).toBe("ready");
  client.dispose();
});

it("settles disconnected and timed-out requests and prevents sending after disposal", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(1, message => messages.push(message));
  const pending = client.configure(config);
  const rejection = expect(pending).rejects.toThrow(/unavailable/i);
  await vi.advanceTimersByTimeAsync(5000);
  await rejection;
  client.dispose();
  const count = messages.length;
  await expect(client.configure(config)).rejects.toThrow(/unavailable/i);
  await client.close();
  expect(messages).toHaveLength(count);
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans all pending work when sending fails", async () => {
  vi.useFakeTimers();
  const client = new WorkerOverlayClient(1, () => { throw new Error("closed port"); });
  await expect(client.configure(config)).rejects.toThrow(/unavailable/i);
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels prepare before a late ready reply and never starts cancelled content", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(1, message => messages.push(message));
  const pending = client.prepare({ key, timing: { startsAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 1000 }, instructions: [], assets: [] });
  const prepare = messages[0]!;
  const stopped = client.stop(key);
  const stop = messages[1]!;
  client.receive({ type: "overlay-response", generation: 1, requestId: prepare.requestId, result: { type: "ready", key } });
  client.receive({ type: "overlay-response", generation: 1, requestId: stop.requestId, result: { type: "ok" } });
  expect(await pending).toBe("unavailable");
  await stopped;
  await expect(client.start(key)).rejects.toThrow(/unavailable/i);
  client.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it("starts admitted content only once and releases it on completion", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(1, message => messages.push(message));
  const preparing = client.prepare({ key, timing: { startsAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 1000 }, instructions: [], assets: [] });
  await expect(client.start(key)).rejects.toThrow(/unavailable/i);
  client.receive({ type: "overlay-response", generation: 1, requestId: messages[0]!.requestId, result: { type: "ready", key } });
  await preparing;
  const playing = client.start(key);
  await expect(client.start(key)).rejects.toThrow(/unavailable/i);
  client.receive({ type: "overlay-response", generation: 1, requestId: messages[1]!.requestId, result: { type: "complete", key } });
  await playing;
  await expect(client.start(key)).rejects.toThrow(/unavailable/i);
  client.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds aggregate admitted visual bytes and releases the reservation on cancellation", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(1, message => messages.push(message));
  const batch = { key, timing: { startsAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 1000 },
    instructions: [{ id: "layer", overlayId: "default", moduleId: "alerts", purpose: "live" as const, scope: "module" as const,
      durationMs: 1000, audio: null, tts: null, text: null,
      visual: { assetId: "video", mediaType: "video" as const, layout: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 } } }],
    assets: [{ assetId: "video", mimeType: "video/webm" as const, bytes: new Uint8Array(65 * 1024 * 1024) }] };
  const first = client.prepare(batch);
  const second = client.prepare({ ...batch, key: { ...key, occurrenceId: "two" } });
  try {
    expect(messages).toHaveLength(1);
    expect(await second).toBe("unavailable");
    const stopped = client.stop(key);
    client.receive({ type: "overlay-response", generation: 1, requestId: messages[1]!.requestId, result: { type: "ok" } });
    await stopped;
    expect(await first).toBe("unavailable");
    const retry = client.prepare({ ...batch, key: { ...key, occurrenceId: "three" } });
    expect(messages).toHaveLength(3);
    client.dispose();
    expect(await retry).toBe("unavailable");
  } finally { client.dispose(); await Promise.all([first, second]); }
});

it("bounds pending requests and rejects all of them on disposal", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(1, message => messages.push(message));
  const pending = Array.from({ length: 64 }, () => client.configure(config).catch(error => error as Error));
  await expect(client.configure(config)).rejects.toThrow(/unavailable/i);
  expect(messages).toHaveLength(64);
  client.dispose();
  expect((await Promise.all(pending)).every(result => result instanceof Error)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("settles missing completion at the occurrence end plus five seconds", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(1, message => messages.push(message));
  const ready = client.prepare({ key, timing: { startsAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 1000 }, instructions: [], assets: [] });
  client.receive({ type: "overlay-response", generation: 1, requestId: messages[0]!.requestId, result: { type: "ready", key } });
  await ready;
  const completion = client.start(key);
  let rejected = false;
  const checked = completion.catch(error => { rejected = true; return error as Error; });
  await vi.advanceTimersByTimeAsync(5999);
  expect(rejected).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await checked).toBeInstanceOf(Error);
  await expect(client.start(key)).rejects.toThrow(/unavailable/i);
  client.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not admit a ready reply after the occurrence has already expired", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(1, message => messages.push(message));
  const ready = client.prepare({ key, timing: { startsAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 1000 }, instructions: [], assets: [] });
  await vi.advanceTimersByTimeAsync(1000);
  client.receive({ type: "overlay-response", generation: 1, requestId: messages[0]!.requestId, result: { type: "ready", key } });
  try { expect(await ready).toBe("unavailable"); }
  finally { client.dispose(); }
});

it("does not use the completion grace period to start expired content", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(1, message => messages.push(message));
  const ready = client.prepare({ key, timing: { startsAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 1000 }, instructions: [], assets: [] });
  client.receive({ type: "overlay-response", generation: 1, requestId: messages[0]!.requestId, result: { type: "ready", key } });
  await ready;
  await vi.advanceTimersByTimeAsync(1000);
  const start = client.start(key).catch(error => error as Error);
  try { expect(messages).toHaveLength(1); }
  finally { client.dispose(); }
  expect(await start).toBeInstanceOf(Error);
});

it("coalesces overlapping stops without releasing the occurrence before acknowledgement", async () => {
  vi.useFakeTimers();
  const messages: OverlayWorkerMessage[] = [];
  const client = new WorkerOverlayClient(1, message => messages.push(message));
  const batch = { key, timing: { startsAtEpochMs: Date.now(), endsAtEpochMs: Date.now() + 1000 }, instructions: [], assets: [] };
  const ready = client.prepare(batch);
  client.receive({ type: "overlay-response", generation: 1, requestId: messages[0]!.requestId, result: { type: "ready", key } });
  await ready;
  const first = client.stop(key).catch(error => error as Error);
  const second = client.stop(key).catch(error => error as Error);
  try {
    await vi.advanceTimersByTimeAsync(1);
    expect(await client.prepare(batch)).toBe("unavailable");
    expect(messages).toHaveLength(2);
    client.receive({ type: "overlay-response", generation: 1, requestId: messages[1]!.requestId, result: { type: "ok" } });
    expect(await first).toBeUndefined();
    expect(await second).toBeUndefined();
    const next = client.prepare({ ...batch, key: { ...key, occurrenceId: "next" } });
    client.receive({ type: "overlay-response", generation: 1, requestId: messages[2]!.requestId, result: { type: "ready", key: { ...key, occurrenceId: "next" } } });
    expect(await next).toBe("ready");
  } finally { client.dispose(); await Promise.all([first, second]); }
});
