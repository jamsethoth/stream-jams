import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DesktopVideoEvent } from "@stream-jams/core/videos";
import type { WorkerMessage } from "../desktop-ipc.js";
import { WorkerVideoClient } from "./worker-video-client.js";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it("leases the host only after start and becomes available when the host announces itself", () => {
  const sent: WorkerMessage[] = [];
  const client = new WorkerVideoClient(3, message => { sent.push(message); });
  const events: DesktopVideoEvent[] = [];
  client.subscribe(event => events.push(event));
  expect(sent).toEqual([]);
  client.start();
  expect(sent).toEqual([{ type: "video-lease", generation: 3, requestId: null }]);
  vi.advanceTimersByTime(4000);
  expect(sent).toHaveLength(3);
  expect(client.available).toBe(false);
  client.receive({ type: "video-event", generation: 2, requestId: null, event: { type: "status", available: true } });
  client.receive({ type: "video-event", generation: 3, requestId: null, event: { type: "status", available: "yes" } });
  expect(client.available).toBe(false);
  client.receive({ type: "video-event", generation: 3, requestId: null, event: { type: "status", available: true } });
  expect(client.available).toBe(true);
  expect(events).toEqual([{ type: "status", available: true }]);
  client.dispose();
});

it("validates commands before posting them and withdraws availability on dispose", () => {
  const sent: WorkerMessage[] = [];
  const client = new WorkerVideoClient(1, message => { sent.push(message); });
  const events: DesktopVideoEvent[] = [];
  client.subscribe(event => events.push(event));
  client.send({ type: "stop", purpose: "live" });
  expect(sent).toEqual([{ type: "video-command", generation: 1, requestId: null, command: { type: "stop", purpose: "live" } }]);
  expect(() => client.send({ type: "seek", purpose: "live", itemId: "a", positionMs: -1 })).toThrow();
  client.receive({ type: "video-event", generation: 1, requestId: null, event: { type: "status", available: true } });
  client.dispose();
  expect(client.available).toBe(false);
  expect(events.at(-1)).toEqual({ type: "status", available: false });
  client.send({ type: "stop", purpose: "live" });
  expect(sent).toHaveLength(1);
});

it("stops leasing when the parent port is gone", () => {
  let fail = false;
  const client = new WorkerVideoClient(1, () => { if (fail) throw new Error("closed"); });
  client.start();
  fail = true;
  vi.advanceTimersByTime(2000);
  vi.advanceTimersByTime(10_000);
  expect(client.available).toBe(false);
});
