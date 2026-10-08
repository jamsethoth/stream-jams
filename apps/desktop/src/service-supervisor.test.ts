import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import { ServiceSupervisor, type ServiceWorker } from "./service-supervisor.js";
import { randomUUID } from "node:crypto";
import { serializeException } from "@stream-jams/core";

class Worker extends EventEmitter implements ServiceWorker {
  readonly messages: Array<Record<string, unknown>> = [];
  kills = 0;
  postMessage(message: Record<string, unknown>): void { this.messages.push(message); }
  kill(): boolean { this.kills += 1; this.emit("exit", 1); return true; }
  reply(type: string, fields: Record<string, unknown> = {}): void {
    const request = this.messages.at(-1)!;
    const failure = type === "failed" || type === "command-failed"
      ? { referenceId: "err_worker_test", exception: serializeException(new Error(String(fields.message ?? "worker failure"))) }
      : {};
    this.emit("message", { generation: request.generation, requestId: request.requestId, type, ...failure, ...fields });
  }
}
afterEach(() => vi.useRealTimers());
function fixture() {
  const worker = new Worker();
  const supervisor = new ServiceSupervisor(() => worker);
  return { worker, supervisor };
}

it("routes overlay RPC separately, ignores stale leases, and clears visuals before shutdown", async () => {
  const worker = new Worker();
  const overlay = { beginOwnership: vi.fn(), refreshLease: vi.fn(), serviceLost: vi.fn(), handle: vi.fn(async () => ({ type: "ok" as const })) };
  const supervisor = new ServiceSupervisor(() => worker, () => {}, undefined, overlay);
  const ready = supervisor.start();
  const generation = worker.messages[0]!.generation as number;
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  await ready;
  expect(overlay.beginOwnership).toHaveBeenCalledOnce();
  worker.emit("message", { type: "overlay-lease", generation: generation + 1, requestId: null });
  expect(overlay.refreshLease).not.toHaveBeenCalled();
  worker.emit("message", { type: "overlay-lease", generation, requestId: null });
  expect(overlay.refreshLease).toHaveBeenCalledOnce();
  const requestId = randomUUID();
  worker.emit("message", { type: "overlay-request", generation, requestId, command: { type: "retry" } });
  await vi.waitFor(() => expect(worker.messages.at(-1)).toEqual({ type: "overlay-response", generation, requestId, result: { type: "ok" } }));
  const stop = supervisor.stop();
  expect(overlay.serviceLost).toHaveBeenCalledOnce();
  worker.emit("message", { type: "overlay-lease", generation, requestId: null });
  expect(overlay.refreshLease).toHaveBeenCalledOnce();
  worker.emit("message", { type: "overlay-request", generation, requestId, command: { type: "retry" } });
  await vi.waitFor(() => expect(worker.messages.at(-1)).toMatchObject({ type: "overlay-response", result: null }));
  expect(overlay.handle).toHaveBeenCalledOnce();
  const clearRequestId = randomUUID();
  const clearCommand = { type: "sync-module" as const, moduleId: "timers", revision: 1, presentation: null, assets: [] };
  worker.emit("message", { type: "overlay-request", generation, requestId: clearRequestId, command: clearCommand });
  await vi.waitFor(() => expect(worker.messages.at(-1)).toEqual({
    type: "overlay-response", generation, requestId: clearRequestId, result: { type: "ok" }
  }));
  expect(overlay.handle).toHaveBeenLastCalledWith(clearCommand);
  worker.emit("exit", 0);
  await stop;
});

it("preserves renderer failure provenance across the main-to-worker overlay response", async () => {
  const worker = new Worker();
  const diagnose = vi.fn();
  const exception = serializeException(new Error("video decode failed", { cause: new Error("invalid frame") }));
  const failure = {
    referenceId: "err_overlay_decode",
    stage: "decode" as const,
    message: "The alert video could not be decoded.",
    exception
  };
  const overlay = {
    beginOwnership: vi.fn(), refreshLease: vi.fn(), serviceLost: vi.fn(),
    handle: vi.fn(async () => { throw new Error("Desktop overlay is unavailable.", { cause: failure }); })
  };
  const supervisor = new ServiceSupervisor(() => worker, () => {}, undefined, overlay, diagnose);
  const ready = supervisor.start();
  const generation = worker.messages[0]!.generation;
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  await ready;
  const requestId = randomUUID();

  worker.emit("message", { type: "overlay-request", generation, requestId, command: { type: "retry" } });

  await vi.waitFor(() => expect(worker.messages.at(-1)).toEqual({
    type: "overlay-response", generation, requestId, result: null, failure
  }));
  expect(diagnose).toHaveBeenCalledWith(expect.objectContaining({
    source: "desktop.overlay.command-failed",
    referenceId: failure.referenceId,
    exception
  }));
  const stop = supervisor.stop(); worker.emit("exit", 0); await stop;
});

it("routes only owned validated audio RPC and tears audio down with service loss", async () => {
  const worker = new Worker();
  const audio = { beginOwnership: vi.fn(), refreshLease: vi.fn(), serviceLost: vi.fn(), handle: vi.fn(async () => ({ type: "devices" as const, devices: [] })) };
  const supervisor = new ServiceSupervisor(() => worker, () => {}, audio);
  const ready = supervisor.start();
  const generation = worker.messages[0]!.generation;
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false }); await ready;
  expect(audio.beginOwnership).toHaveBeenCalledOnce();
  worker.emit("message", { type: "audio-lease", generation, requestId: null });
  expect(audio.refreshLease).toHaveBeenCalledOnce();
  const requestId = randomUUID();
  worker.emit("message", { type: "audio-request", generation, requestId, command: { type: "enumerate" } });
  await vi.waitFor(() => expect(worker.messages.at(-1)).toEqual({ type: "audio-response", generation, requestId, result: { type: "devices", devices: [] } }));
  worker.emit("exit", 1);
  expect(audio.serviceLost).toHaveBeenCalled();
  expect(supervisor.state).toBe("failed");
});

it("ignores audio ownership leases while the worker is stopping", async () => {
  const worker = new Worker();
  const audio = { beginOwnership: vi.fn(), refreshLease: vi.fn(), serviceLost: vi.fn(), handle: vi.fn(async () => ({ type: "ok" as const })) };
  const supervisor = new ServiceSupervisor(() => worker, () => {}, audio);
  const ready = supervisor.start();
  const generation = worker.messages[0]!.generation;
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false }); await ready;
  worker.emit("message", { type: "audio-lease", generation, requestId: null });
  expect(audio.refreshLease).toHaveBeenCalledOnce();

  const stop = supervisor.stop();
  worker.emit("message", { type: "audio-lease", generation, requestId: null });

  expect(audio.refreshLease).toHaveBeenCalledOnce();
  worker.emit("exit", 0);
  await stop;
});

it("starts one worker, accepts only its generation, and applies persisted mute state", async () => {
  const { worker, supervisor } = fixture();
  const ready = supervisor.start();
  expect(supervisor.start()).toBe(ready);
  const first = worker.messages[0]!;
  worker.emit("message", { ...first, generation: -1, type: "ready", url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  expect(supervisor.state).toBe("starting");
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  expect(await ready).toEqual({ url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  const muted = supervisor.setMuted(true);
  expect(supervisor.snapshot?.muted).toBe(false);
  worker.reply("playback-state-changed", { muted: true });
  await muted;
  expect(supervisor.snapshot?.muted).toBe(true);
  const stop = supervisor.stop();
  expect(supervisor.stop()).toBe(stop);
  worker.reply("stopped");
  expect(supervisor.state).toBe("stopping");
  worker.emit("exit", 0);
  await stop;
  expect(supervisor.state).toBe("stopped");
  expect(worker.kills).toBe(0);
});

it("bounds startup and terminates only the unresponsive owned worker", async () => {
  vi.useFakeTimers();
  const { worker, supervisor } = fixture();
  const started = supervisor.start();
  const failure = expect(started).rejects.toThrow(/20 seconds/);
  await vi.advanceTimersByTimeAsync(20_000);
  await failure;
  expect(worker.kills).toBe(1);
  expect(supervisor.state).toBe("failed");
});

it("kills the owned worker after the graceful-stop deadline and reports abnormal shutdown", async () => {
  vi.useFakeTimers();
  const { worker, supervisor } = fixture();
  const ready = supervisor.start();
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: false, muted: true });
  await ready;
  const stop = supervisor.stop();
  const failure = expect(stop).rejects.toThrow(/10 seconds/);
  await vi.advanceTimersByTimeAsync(10_000);
  await failure;
  expect(worker.kills).toBe(1);
});

it("reports an unexpected exit without automatically starting another worker", async () => {
  const { worker, supervisor } = fixture();
  const ready = supervisor.start();
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  await ready;
  worker.emit("exit", 1);
  expect(supervisor.state).toBe("failed");
  expect(supervisor.snapshot).toBeNull();
  expect(worker.messages.filter((message) => message.type === "start")).toHaveLength(1);
});

it("surfaces an occupied-port startup failure and terminates only its injected worker", async () => {
  const occupiedPortOwner = new Worker();
  const worker = new Worker();
  const supervisor = new ServiceSupervisor(() => worker);
  const start = supervisor.start();
  const failure = expect(start).rejects.toThrow("Port 39187 is already in use");
  worker.reply("failed", { message: "Port 39187 is already in use. Stop the other service or update the configured port." });
  await failure;
  expect(supervisor.state).toBe("failed");
  expect(worker.kills).toBe(1);
  expect(occupiedPortOwner.kills).toBe(0);
});

it("preserves worker startup exception provenance and reports it with the same reference", async () => {
  const worker = new Worker();
  const diagnose = vi.fn();
  const supervisor = new ServiceSupervisor(() => worker, () => {}, undefined, undefined, diagnose);
  const start = supervisor.start();
  const exception = serializeException(new Error("database open failed", { cause: new Error("access denied") }));

  worker.reply("failed", { message: "The local service could not start.", referenceId: "err_worker_start", exception });

  await expect(start).rejects.toMatchObject({ name: "ServiceWorkerError", cause: exception });
  expect(diagnose).toHaveBeenCalledWith(expect.objectContaining({
    referenceId: "err_worker_start",
    source: "desktop.worker.failed",
    exception: expect.objectContaining({ cause: exception })
  }));
});

it("records native spawn and abnormal worker exit failures", async () => {
  const diagnose = vi.fn();
  const spawnError = new Error("fork denied");
  const spawnFailure = new ServiceSupervisor(() => { throw spawnError; }, () => {}, undefined, undefined, diagnose);
  await expect(spawnFailure.start()).rejects.toBe(spawnError);
  expect(diagnose).toHaveBeenCalledWith(expect.objectContaining({ source: "desktop.worker.failed", exception: spawnError }));

  const worker = new Worker();
  const supervisor = new ServiceSupervisor(() => worker, () => {}, undefined, undefined, diagnose);
  const ready = supervisor.start();
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  await ready;
  worker.emit("exit", 7);
  expect(diagnose).toHaveBeenCalledWith(expect.objectContaining({ source: "desktop.worker.exit", exitCode: 7 }));
});

it("sends validated diagnostics only while the worker is owned", async () => {
  const { worker, supervisor } = fixture();
  const report = {
    referenceId: "err_desktop_test",
    component: "desktop",
    source: "desktop.test",
    message: "test diagnostic",
    exception: null,
    reason: null,
    exitCode: null,
    occurredAt: "2026-09-28T00:00:00.000Z"
  };

  expect(supervisor.recordDiagnostic(report)).toBe(false);
  const ready = supervisor.start();
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  await ready;
  expect(supervisor.recordDiagnostic(report)).toBe(true);
  expect(worker.messages.at(-1)).toMatchObject({ type: "record-diagnostic", report });
  worker.reply("diagnostic-recorded");
});

it("falls back with the original report when runtime diagnostic persistence fails", async () => {
  const worker = new Worker();
  const fallback = vi.fn();
  const supervisor = new ServiceSupervisor(() => worker, () => {}, undefined, undefined, undefined, fallback);
  const ready = supervisor.start();
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  await ready;
  const report = {
    referenceId: "err_desktop_fallback",
    component: "renderer",
    source: "desktop.renderer.gone",
    message: "renderer failed",
    exception: null,
    reason: "crashed",
    exitCode: 7,
    occurredAt: "2026-09-28T00:00:00.000Z"
  };
  expect(supervisor.recordDiagnostic(report)).toBe(true);
  worker.reply("command-failed", { message: "The desktop diagnostic could not be written to the runtime log.", referenceId: report.referenceId });
  expect(fallback).toHaveBeenCalledExactlyOnceWith(report);
});

it("shares repeated shutdown requests and ignores stale messages after retry", async () => {
  const first = new Worker();
  const second = new Worker();
  let spawns = 0;
  const supervisor = new ServiceSupervisor(() => ++spawns === 1 ? first : second);
  const firstStart = supervisor.start();
  first.reply("failed", { message: "First startup failed" });
  await expect(firstStart).rejects.toThrow("First startup failed");
  first.emit("exit", 1);

  const secondStart = supervisor.start();
  first.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  expect(supervisor.state).toBe("starting");
  second.reply("ready", { url: "http://127.0.0.1:39188", closeToTray: false, muted: true });
  await expect(secondStart).resolves.toMatchObject({ url: "http://127.0.0.1:39188" });

  const firstStop = supervisor.stop();
  expect(supervisor.stop()).toBe(firstStop);
  expect(second.messages.filter((message) => message.type === "stop")).toHaveLength(1);
  second.emit("exit", 0);
  await firstStop;
});

it("ignores unknown command replies and retains the prior mute state on persistence failure", async () => {
  const { worker, supervisor } = fixture();
  const ready = supervisor.start();
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  await ready;
  const command = supervisor.setMuted(true);
  const rejected = expect(command).rejects.toThrow("Preference could not be saved");
  worker.reply("playback-state-changed", { requestId: "00000000-0000-4000-8000-000000000001", muted: true });
  expect(supervisor.snapshot?.muted).toBe(false);
  worker.reply("command-failed", { message: "Preference could not be saved" });
  await rejected;
  expect(supervisor.snapshot?.muted).toBe(false);
  const stop = supervisor.stop(); worker.emit("exit", 0); await stop;
});

it("cancels startup without accepting late readiness", async () => {
  const { worker, supervisor } = fixture();
  const start = supervisor.start();
  const request = worker.messages[0]!;
  const cancelled = expect(start).rejects.toThrow("cancelled by shutdown");
  const stop = supervisor.stop();
  worker.emit("message", { ...request, type: "ready", url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  expect(supervisor.snapshot).toBeNull();
  worker.emit("exit", 0);
  await Promise.all([cancelled, stop]);
});

it("rejects malformed messages and permits explicit retry only after the owned worker exits", async () => {
  const first = new Worker();
  const second = new Worker();
  vi.spyOn(first, "kill").mockReturnValue(true); // Termination is asynchronous in Electron.
  let spawns = 0;
  const supervisor = new ServiceSupervisor(() => ++spawns === 1 ? first : second);
  const start = supervisor.start();
  const invalid = expect(start).rejects.toThrow("invalid desktop message");
  first.reply("ready", { url: "https://example.com", closeToTray: true, muted: false });
  await invalid;
  await expect(supervisor.start()).rejects.toThrow("previous service");
  first.emit("exit", 1);
  const retry = supervisor.start();
  first.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  expect(supervisor.state).toBe("starting");
  second.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: false, muted: true });
  expect((await retry).muted).toBe(true);
  const stop = supervisor.stop(); second.emit("exit", 0); await stop;
});

it("routes the Videos player transport: leases, validated commands and events, and silence on service loss", async () => {
  const worker = new Worker();
  let sink: ((event: import("@stream-jams/core/videos").DesktopVideoEvent) => void) | undefined;
  const video = { beginOwnership: vi.fn(), refreshLease: vi.fn(), serviceLost: vi.fn(), handle: vi.fn(), onEvent: vi.fn((value: typeof sink) => { sink = value; }) };
  const supervisor = new ServiceSupervisor(() => worker, () => {}, undefined, undefined, undefined, undefined, video);
  // Events before a worker exists go nowhere.
  sink!({ type: "status", available: true });
  expect(worker.messages).toEqual([]);
  const ready = supervisor.start();
  const generation = worker.messages[0]!.generation as number;
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  await ready;
  expect(video.beginOwnership).toHaveBeenCalledOnce();
  worker.emit("message", { type: "video-lease", generation, requestId: null });
  expect(video.refreshLease).toHaveBeenCalledOnce();
  const command = { type: "pause", purpose: "live", itemId: "a" };
  worker.emit("message", { type: "video-command", generation, requestId: null, command });
  expect(video.handle).toHaveBeenCalledWith(command);
  sink!({ type: "status", available: true });
  expect(worker.messages.at(-1)).toEqual({ type: "video-event", generation, requestId: null, event: { type: "status", available: true } });
  const stop = supervisor.stop();
  expect(video.serviceLost).toHaveBeenCalledOnce();
  worker.emit("message", { type: "video-command", generation, requestId: null, command });
  expect(video.handle).toHaveBeenCalledOnce();
  worker.emit("message", { type: "video-command", generation, requestId: null, command: { type: "stop", purpose: "live" } });
  expect(video.handle).toHaveBeenCalledTimes(2);
  worker.emit("exit", 0);
  await stop;
});

it("fails the service on a malformed video command instead of reaching the player", async () => {
  const worker = new Worker();
  const video = { beginOwnership: vi.fn(), refreshLease: vi.fn(), serviceLost: vi.fn(), handle: vi.fn(), onEvent: vi.fn() };
  const supervisor = new ServiceSupervisor(() => worker, () => {}, undefined, undefined, undefined, undefined, video);
  const ready = supervisor.start();
  const generation = worker.messages[0]!.generation as number;
  worker.reply("ready", { url: "http://127.0.0.1:39187", closeToTray: true, muted: false });
  await ready;
  worker.emit("message", { type: "video-command", generation, requestId: null, command: { type: "load", purpose: "live", itemId: "a", source: { provider: "direct", url: "http://insecure.example.com/a.mp4" }, positionMs: 0, paused: false } });
  expect(video.handle).not.toHaveBeenCalled();
  expect(supervisor.state).toBe("failed");
  expect(video.serviceLost).toHaveBeenCalled();
});
