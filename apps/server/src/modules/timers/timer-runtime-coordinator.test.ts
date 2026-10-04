import { describe, expect, it, vi } from "vitest";
import type { OverlayModuleConfig, TimerDefinition } from "@stream-jams/core";
import {
  TimerRuntimeCoordinator,
  type TimerClock,
  type TimerCueSink,
  type TimerScheduler
} from "./timer-runtime-coordinator.js";
import { RuntimeMaintenanceGate } from "../backup/runtime-maintenance-gate.js";
import { normalizedStreamEventSchema, type TimerEventRule } from "@stream-jams/core";
import { TimerEventService } from "./timer-event-service.js";
import { snapshotTimerDefinition } from "./timer-management-service.js";

function definition(id: string, durationMs = 10_000): TimerDefinition {
  return {
    id,
    label: `Timer ${id}`,
    durationMs,
    iconAssetId: null,
    startAudioAssetId: null,
    endAudioAssetId: null,
    outputs: { browserSource: false, deviceRouteIds: [] },
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z"
  };
}

class FakeTime implements TimerClock, TimerScheduler {
  nowValue = 1_000;
  readonly scheduled: Array<{ at: number; callback: () => void; cancelled: boolean; delay: number }> = [];
  now(): number { return this.nowValue; }
  schedule(delayMs: number, callback: () => void) {
    const item = { at: this.nowValue + delayMs, callback, cancelled: false, delay: delayMs };
    this.scheduled.push(item);
    return { cancel: () => { item.cancelled = true; } };
  }
  async advance(ms: number): Promise<void> {
    const target = this.nowValue + ms;
    while (true) {
      const next = this.scheduled
        .filter(item => !item.cancelled && item.at <= target)
        .sort((left, right) => left.at - right.at)[0];
      if (next === undefined) break;
      next.cancelled = true;
      this.nowValue = next.at;
      next.callback();
      await Promise.resolve();
    }
    this.nowValue = target;
    await Promise.resolve();
  }
}

function setup(definitions = [definition("a"), definition("b", 5_000)], gate?: RuntimeMaintenanceGate, recovery?: import("./sqlite-timer-run-repository.js").TimerRunRepository, extra: Partial<ConstructorParameters<typeof TimerRuntimeCoordinator>[0]> = {}) {
  const time = new FakeTime();
  const records = new Map(definitions.map(item => [item.id, item]));
  const cueSink: TimerCueSink = { play: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) };
  let generation = 0;
  const config: OverlayModuleConfig = {
    moduleId: "timers",
    enabled: true,
    updatedAt: "2026-09-28T00:00:00.000Z",
    config: {
      profiles: {
        landscape: { layout: { x: 0, y: 0, width: 800, height: 400, zIndex: 1 }, orientation: "vertical", maxVisible: 4 },
        vertical: { layout: { x: 0, y: 0, width: 600, height: 800, zIndex: 1 }, orientation: "horizontal", maxVisible: 2 }
      }
    }
  };
  const coordinator = new TimerRuntimeCoordinator({
    ...extra,
    ...(recovery === undefined ? {} : { recovery }),
    ...(gate === undefined ? {} : { assertCommandAvailable: () => gate.runConfigurationMutation(() => undefined) }),
    definitions: { findById: id => records.get(id) ?? null },
    config: { getModuleConfig: vi.fn().mockResolvedValue(config) },
    clock: time,
    scheduler: time,
    cueSink,
    generateGeneration: () => `generation-${++generation}`
  });
  return { coordinator, cueSink, records, time };
}

describe("TimerRuntimeCoordinator", () => {
  it("does not resurrect activation during pending replacement cleanup", async () => {
    const { coordinator, time, cueSink } = setup([definition("a", 1000)]);
    await coordinator.start("a"); await time.advance(1000);
    let release: (() => void) | undefined;
    vi.mocked(cueSink.stop).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const pending = coordinator.activate("a", "generation-1");
    await coordinator.stopActive("a", "generation-2");
    release?.(); await pending;
    expect(coordinator.getState("a")).toBeNull();
    await coordinator.close();
  });
  it("keeps a later management replacement during guarded stop cleanup", async () => {
    const { coordinator, cueSink } = setup();
    await coordinator.start("a");
    let release: (() => void) | undefined;
    vi.mocked(cueSink.stop).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const pending = coordinator.stopActive("a", "generation-1");
    await coordinator.start("a"); const replacement = coordinator.getState("a");
    release?.(); await pending;
    expect(coordinator.getState("a")).toEqual(replacement);
    await coordinator.close();
  });
  it("resets running deadlines and rejects invalid active adjustments", async () => {
    const { coordinator, records, time } = setup();
    await coordinator.start("a"); time.nowValue += 500;
    records.set("a", definition("a", 2000));
    expect((await coordinator.reset("a", "generation-1")).state).toMatchObject({ status: "running", startedAtEpochMs: 1500, endsAtEpochMs: 3500 });
    for (const input of [{ action: "set", amountMs: 1000 }, { action: "increment", amountMs: 0 }, { action: "increment", amountMs: 1.5 }, { action: "increment", amountMs: 2592000001 }] as const) {
      await expect(coordinator.adjustActive("a", input, "generation-1")).rejects.toThrow();
    }
    await time.advance(2000);
    expect(coordinator.getState("a")?.status).toBe("completed");
    await coordinator.close();
  });
  it("toggles recovered paused runs without offline deduction or start cues", async () => {
    let saved: readonly import("@stream-jams/core").TimerRunState[] = [{ status: "paused", definitionId: "a", generation: "recovered", snapshot: snapshotTimerDefinition(definition("a")), remainingMs: 4321 }];
    const { coordinator, cueSink } = setup(undefined, undefined, { list: () => saved, replace: states => { saved = structuredClone(states); } });
    await coordinator.restore();
    expect((await coordinator.togglePaused()).states).toEqual([expect.objectContaining({ status: "running", generation: "recovered", endsAtEpochMs: 5321 })]);
    expect(cueSink.play).not.toHaveBeenCalled();
    await coordinator.togglePaused();
    expect(saved).toEqual([expect.objectContaining({ status: "paused", remainingMs: 4321 })]);
    await coordinator.stopActive("a", "recovered");
    expect(await coordinator.togglePaused()).toEqual({ changed: false, states: [] });
    await coordinator.close();
  });
  it("keeps completed stop inactive and guards reset and adjustment replacements", async () => {
    const { coordinator, time } = setup([definition("a", 1000)]);
    await coordinator.start("a"); await time.advance(1000);
    expect((await coordinator.stopActive("a", "generation-1")).changed).toBe(false);
    await coordinator.restart("a");
    await expect(coordinator.reset("a", "generation-1")).rejects.toThrow("generation");
    await expect(coordinator.adjustActive("a", { action: "increment", amountMs: 1000 }, "generation-1")).rejects.toThrow("generation");
    expect(coordinator.getState("a")?.generation).toBe("generation-2");
    await coordinator.close();
  });
  it("activates running to paused and paused to running without replaying start cues", async () => {
    const { coordinator, cueSink, time } = setup();
    expect((await coordinator.activate("a", null)).state?.status).toBe("running");
    time.nowValue += 500;
    expect((await coordinator.activate("a", "generation-1")).state).toMatchObject({ status: "paused", remainingMs: 9500 });
    time.nowValue += 1000;
    expect((await coordinator.activate("a", "generation-1")).state).toMatchObject({ status: "running", endsAtEpochMs: 12000 });
    expect(cueSink.play).toHaveBeenCalledTimes(1);
    await coordinator.close();
  });
  it("guards replacements and leaves inactive commands unchanged", async () => {
    const { coordinator } = setup();
    expect(await coordinator.reset("a", "old")).toEqual({ changed: false, state: null });
    await coordinator.activate("a", null);
    await expect(coordinator.stopActive("a", "old")).rejects.toThrow("generation");
    await expect(coordinator.activate("a", null)).rejects.toThrow("generation");
    await coordinator.close();
  });
  it("resets only duration and timing silently from the latest saved definition", async () => {
    const { coordinator, records, cueSink } = setup();
    await coordinator.start("a"); await coordinator.pause("a");
    const before = coordinator.getState("a")!;
    records.set("a", { ...definition("a", 20000), label: "Changed" });
    const result = await coordinator.reset("a", before.generation);
    expect(result.state).toEqual({ ...before, snapshot: { ...before.snapshot, durationMs: 20000 }, remainingMs: 20000 });
    expect(cueSink.play).toHaveBeenCalledTimes(1);
    await coordinator.close();
  });
  it("resolves overdue deadlines before reset, adjustment and activation", async () => {
    const { coordinator, time, cueSink } = setup([definition("a", 1000)]);
    await coordinator.start("a"); time.nowValue += 1000;
    expect((await coordinator.reset("a", "generation-1")).changed).toBe(false);
    expect((await coordinator.adjustActive("a", { action: "increment", amountMs: 1000 }, "generation-1")).changed).toBe(false);
    expect((await coordinator.activate("a", "generation-1")).state).toMatchObject({ status: "running", generation: "generation-2" });
    expect(vi.mocked(cueSink.play).mock.calls.map(([input]) => input.cue)).toEqual(["start", "end", "start"]);
    await coordinator.close();
  });
  it("bulk toggles mixed runs and completes paused subtraction once", async () => {
    const { coordinator, cueSink } = setup();
    await coordinator.start("a"); await coordinator.start("b"); await coordinator.pause("b");
    expect((await coordinator.togglePaused()).states.every(state => state.status === "paused")).toBe(true);
    expect((await coordinator.togglePaused()).states.every(state => state.status === "running")).toBe(true);
    await coordinator.pause("a");
    await coordinator.adjustActive("a", { action: "decrement", amountMs: 10000 }, "generation-1");
    await coordinator.adjustActive("a", { action: "decrement", amountMs: 10000 }, "generation-1");
    expect(vi.mocked(cueSink.play).mock.calls.filter(([input]) => input.cue === "end")).toHaveLength(1);
    await coordinator.close();
  });
  it("keeps completion live on a failed recovery write and retries removal without running timers", async () => {
    let saved: readonly import("@stream-jams/core").TimerRunState[] = [];
    const replace = vi.fn((states: typeof saved) => { saved = structuredClone(states); });
    const failure = new Error("disk unavailable");
    const onRecoveryError = vi.fn();
    const { coordinator, time, cueSink } = setup([definition("a", 1000)], undefined, { list: () => saved, replace }, { onRecoveryError });
    const listener = vi.fn(); coordinator.subscribe(listener);
    await coordinator.start("a");
    replace.mockImplementationOnce(() => { throw failure; });
    await expect(time.advance(1000)).resolves.toBeUndefined();
    expect(coordinator.getState("a")?.status).toBe("completed");
    expect(saved).toHaveLength(1);
    expect(onRecoveryError).toHaveBeenCalledWith(failure);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(cueSink.play).toHaveBeenLastCalledWith(expect.objectContaining({ cue: "end" }));
    await time.advance(1000); expect(saved).toEqual([]);
    await time.advance(2000); expect(coordinator.getState("a")).toBeNull();
    await coordinator.close();
  });
  it.each(["stop", "restart", "close"] as const)("does not apply an older idle adjustment after %s", async command => {
    let release: (() => void) | undefined;
    const acquire = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; })).mockResolvedValue(undefined);
    const media = { acquire, release: vi.fn().mockResolvedValue(undefined) } as unknown as import("../assets/local-media-service.js").LocalMediaService;
    const { coordinator } = setup(undefined, undefined, undefined, { localMediaService: media });
    const adjustment = coordinator.adjust("a", { action: "set", amountMs: 2000 });
    if (command === "close") await coordinator.close();
    else await coordinator[command]("a");
    if (command === "stop") await coordinator.start("a");
    const replacement = coordinator.getState("a");
    release?.(); await adjustment;
    expect(coordinator.getState("a")).toEqual(replacement);
    await coordinator.close();
  });
  it("reserves a completed-run adjustment before cue cleanup and never replaces a newer start", async () => {
    const { coordinator, time, cueSink } = setup([definition("a", 1000)]);
    await coordinator.start("a"); await time.advance(1000);
    let release: (() => void) | undefined;
    vi.mocked(cueSink.stop).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const pending = coordinator.adjust("a", { action: "set", amountMs: 2000 });
    await coordinator.stop("a"); await coordinator.start("a");
    const replacement = coordinator.getState("a");
    release?.(); await pending;
    expect(coordinator.getState("a")).toEqual(replacement);
    await coordinator.close();
  });
  it.each(["stop", "adjust"] as const)("retries failed %s persistence while preserving transitions and cleanup", async command => {
    let saved: readonly import("@stream-jams/core").TimerRunState[] = [];
    const replace = vi.fn((states: typeof saved) => { saved = structuredClone(states); });
    const { coordinator, time, cueSink } = setup(undefined, undefined, { list: () => saved, replace });
    await coordinator.start("a"); await coordinator.pause("a");
    replace.mockImplementationOnce(() => { throw new Error("disk unavailable"); });
    if (command === "stop") {
      await coordinator.stop("a"); expect(coordinator.getState("a")).toBeNull();
      expect(cueSink.stop).toHaveBeenCalledWith("generation-1");
    } else {
      await coordinator.adjust("a", { action: "set", amountMs: 2000 });
      expect(coordinator.getState("a")).toMatchObject({ status: "paused", remainingMs: 2000 });
    }
    expect(saved[0]).toMatchObject({ remainingMs: 10000 });
    await time.advance(1000);
    if (command === "stop") expect(saved).toEqual([]);
    else expect(saved[0]).toMatchObject({ remainingMs: 2000 });
    await coordinator.close();
  });
  it("finishes shutdown cleanup before reporting a failed final recovery write", async () => {
    const replace = vi.fn();
    const { coordinator, cueSink, time } = setup(undefined, undefined, { list: () => [], replace });
    await coordinator.start("a");
    const failure = new Error("disk unavailable"); replace.mockImplementationOnce(() => { throw failure; });
    await expect(coordinator.close()).rejects.toBe(failure);
    expect(coordinator.listStates()).toEqual([]);
    expect(cueSink.stop).toHaveBeenCalledWith("generation-1");
    const calls = replace.mock.calls.length;
    await time.advance(20000); expect(replace).toHaveBeenCalledTimes(calls);
    await expect(coordinator.start("a")).rejects.toThrow();
  });
  it.each([
    { type: "subscription", amount: 1, tier: "2000", quantityUnit: null, added: 2000 },
    { type: "resubscription", amount: 24, tier: "2000", streakMonths: 12, quantityUnit: null, added: 2000 },
    { type: "gift_subscription", amount: 1, tier: "2000", recipient: { id: "r", displayName: "Recipient" }, gifter: null, quantityUnit: 1, added: 2000 },
    { type: "community_gift", amount: 5, tier: "2000", cumulativeTotal: null, anonymous: true, quantityUnit: 2, added: 4000 }
  ])("applies $type tier/quantity rules with ordered actions and both idle alternatives", async ({ quantityUnit, added, ...fields }) => {
    const { coordinator, records } = setup();
    const event = normalizedStreamEventSchema.parse({ ...fields, id: "event", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "streamerbot", occurredAt: "2026-10-01T00:00:00Z", actor: { id: "u", displayName: "Viewer" }, message: null, metadata: {} });
    const rule: TimerEventRule = { enabled: true, ingestProvider: "streamerbot", eventType: event.type, rewardId: null, tier: "2000", action: "increment", amountMs: 2000, quantityUnit, inactiveBehavior: "paused" };
    const setRules = (...rules: TimerEventRule[]) => records.set("a", { ...definition("a"), eventRules: rules });
    const service = new TimerEventService({ list: () => [...records.values()] }, coordinator);
    setRules(rule);
    await service.handleEvent({ ...event, tier: "1000" } as typeof event);
    expect(coordinator.getState("a")).toBeNull();
    await service.handleEvent(event);
    expect(coordinator.getState("a")).toMatchObject({ status: "paused", remainingMs: 10000 + added });
    setRules({ ...rule, action: "decrement" }); await service.handleEvent(event);
    expect(coordinator.getState("a")).toMatchObject({ status: "paused", remainingMs: 10000 });
    setRules({ ...rule, action: "restart" }, rule); await service.handleEvent(event);
    const restarted = coordinator.getState("a");
    expect(restarted).toMatchObject({ status: "running", endsAtEpochMs: 11000 + added });
    setRules({ ...rule, action: "start" }); await service.handleEvent(event);
    expect(coordinator.getState("a")).toEqual(restarted);
    setRules({ ...rule, action: "stop" }); await service.handleEvent(event);
    expect(coordinator.getState("a")).toBeNull();
    setRules({ ...rule, inactiveBehavior: "start" }); await service.handleEvent(event);
    expect(coordinator.getState("a")).toMatchObject({ status: "running", endsAtEpochMs: 11000 + added });
    await coordinator.close();
  });
  it("reports a failed checkpoint, retains the last successful save, and retries", async () => {
    let saved: readonly import("@stream-jams/core").TimerRunState[] = [];
    const failure = new Error("disk unavailable");
    const replace = vi.fn((states: typeof saved) => { saved = structuredClone(states); });
    const recovery = { list: () => structuredClone(saved), replace };
    const onRecoveryError = vi.fn();
    const { coordinator, time } = setup(undefined, undefined, recovery, { onRecoveryError });
    await coordinator.start("a");
    replace.mockImplementationOnce(() => { throw failure; });
    await time.advance(1000);
    expect(onRecoveryError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(saved[0]).toMatchObject({ remainingMs: 10000 });
    const crashed = setup(undefined, undefined, recovery);
    await crashed.coordinator.restore();
    expect(crashed.coordinator.getState("a")).toMatchObject({ status: "paused", remainingMs: 10000 });
    await time.advance(1000);
    expect(saved[0]).toMatchObject({ remainingMs: 8000 });
    expect(coordinator.getState("a")?.status).toBe("running");
    await coordinator.close();
  });
  it("does not restore stopped or completed runs, including completion hold", async () => {
    let saved: readonly import("@stream-jams/core").TimerRunState[] = [];
    const recovery = { list: () => structuredClone(saved), replace: (states: typeof saved) => { saved = structuredClone(states); } };
    const first = setup(undefined, undefined, recovery);
    await first.coordinator.start("a"); await first.coordinator.start("b");
    await first.coordinator.stop("a");
    await first.time.advance(5000);
    expect(first.coordinator.getState("b")?.status).toBe("completed");
    expect(saved).toEqual([]);
    const reopened = setup(undefined, undefined, recovery);
    await reopened.coordinator.restore();
    expect(reopened.coordinator.listStates()).toEqual([]);
    expect(reopened.cueSink.play).not.toHaveBeenCalled();
    await first.coordinator.close(); await reopened.coordinator.close();
  });
  it("preserves recovered time and hides the icon when retained media is missing", async () => {
    const snapshot = { ...snapshotTimerDefinition(definition("a")), iconAssetId: "missing-icon" };
    const recovery = { list: () => [{ status: "paused" as const, definitionId: "a", generation: "old", snapshot, remainingMs: 4321 }], replace: vi.fn() };
    const failure = new Error("asset missing");
    const acquire = vi.fn().mockRejectedValue(failure);
    const onRecoveryError = vi.fn();
    const media = { acquire, release: vi.fn().mockResolvedValue(undefined) } as unknown as import("../assets/local-media-service.js").LocalMediaService;
    const { coordinator, cueSink, time } = setup(undefined, undefined, recovery, { localMediaService: media, onRecoveryError });
    await coordinator.restore(); await time.advance(100000);
    expect(coordinator.getState("a")).toMatchObject({ status: "paused", remainingMs: 4321 });
    expect(onRecoveryError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(cueSink.play).not.toHaveBeenCalled();
    const projected = await coordinator.getModuleSnapshot({ moduleId: "timers", overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape" });
    expect(JSON.stringify(projected)).not.toContain("missing-icon");
    await coordinator.close();
  });
  it("checkpoints crash recovery and saves exact graceful-close time, restoring paused without cues", async () => {
    let saved: readonly import("@stream-jams/core").TimerRunState[] = [];
    const recovery = { list: () => structuredClone(saved), replace: (states: typeof saved) => { saved = structuredClone(states); } };
    const first = setup(undefined, undefined, recovery);
    await first.coordinator.start("a");
    await first.time.advance(2500);
    expect(saved[0]).toMatchObject({ status: "paused", remainingMs: 8000 });
    const crash = setup(undefined, undefined, recovery);
    crash.time.nowValue = 1_000_000;
    await crash.coordinator.restore();
    expect(crash.coordinator.getState("a")).toMatchObject({ status: "paused", remainingMs: 8000 });
    expect(crash.cueSink.play).not.toHaveBeenCalled();
    await first.coordinator.close();
    expect(saved[0]).toMatchObject({ status: "paused", remainingMs: 7500 });
    const reopened = setup(undefined, undefined, recovery);
    await reopened.coordinator.restore();
    await reopened.coordinator.stop("a");
    expect(saved).toEqual([]);
  });
  it("keeps a paused timer paused even when an event uses start-if-inactive", async () => {
    const { coordinator } = setup();
    await coordinator.start("a"); await coordinator.pause("a");
    expect(await coordinator.adjust("a", { action: "increment", amountMs: 1000 }, "start")).toMatchObject({ state: { status: "paused", remainingMs: 11000 } });
    expect(await coordinator.adjust("b", { action: "increment", amountMs: 1000 }, "start")).toMatchObject({ state: { status: "running" } });
  });
  it("adjusts running deadlines without an old completion and completes paused subtraction at zero", async () => {
    const { coordinator, time } = setup();
    await coordinator.start("a");
    await time.advance(8_000);
    await coordinator.adjust("a", { action: "increment", amountMs: 5_000 });
    await time.advance(2_000);
    expect(coordinator.getState("a")?.status).toBe("running");
    await coordinator.pause("a");
    expect(await coordinator.adjust("a", { action: "decrement", amountMs: 20_000 })).toMatchObject({ state: { status: "completed" } });
    expect(await coordinator.adjust("b", { action: "increment", amountMs: 1000 })).toEqual({ changed: false, state: null });
    expect(await coordinator.adjust("b", { action: "set", amountMs: 1000 })).toMatchObject({ state: { status: "paused", remainingMs: 1000 } });
    await expect(coordinator.adjust("b", { action: "set", amountMs: -1 })).rejects.toThrow();
  });
  it("rejects new commands during configuration replacement without changing timer state", async () => {
    const gate = new RuntimeMaintenanceGate();
    const { coordinator } = setup(undefined, gate);
    await gate.runMaintenance(async () => {
      await expect(coordinator.start("a")).rejects.toThrow("maintenance");
      await expect(coordinator.restart("a")).rejects.toThrow("maintenance");
      expect(coordinator.listStates()).toEqual([]);
    });
    await expect(coordinator.start("a")).resolves.toMatchObject({ changed: true });
  });
  it("commits restart before asynchronous cue cleanup so Start, Stop and close cannot resurrect it", async () => {
    const { coordinator, cueSink } = setup();
    await coordinator.start("a");
    let release!: () => void;
    vi.mocked(cueSink.stop).mockReturnValue(new Promise<void>(resolve => { release = resolve; }));
    const restarting = coordinator.restart("a");
    expect(coordinator.getState("a")?.generation).toBe("generation-2");
    expect(await coordinator.start("a")).toMatchObject({ changed: false, state: { generation: "generation-2" } });
    const stopping = coordinator.stop("a");
    expect(coordinator.getState("a")).toBeNull();
    await coordinator.close();
    release();
    await Promise.all([restarting, stopping]);
    expect(coordinator.getState("a")).toBeNull();
    expect(cueSink.play).toHaveBeenCalledTimes(2);
  });

  it("uses identical ID tie breaks for API state and overlay projection, including completed holds", async () => {
    const { coordinator, time } = setup([
      { ...definition("a", 2_000), label: "Zulu" },
      { ...definition("b", 1_000), label: "Alpha" }
    ]);
    await coordinator.start("a");
    await coordinator.start("b");
    await time.advance(2_000);
    expect(coordinator.listStates().map(state => state.definitionId)).toEqual(["a", "b"]);
    const snapshot = await coordinator.getModuleSnapshot({ moduleId: "timers", overlayId: "default", purpose: "live", scope: "module", targetProfileId: "landscape" });
    expect(snapshot.presentation?.stack.cards.map(card => card.definitionId)).toEqual(["a", "b"]);
  });
  it("starts independent timers with immutable definition snapshots and publishes revisions", async () => {
    const { coordinator, cueSink, records } = setup();
    const revisions: number[] = [];
    const unsubscribe = coordinator.subscribe(revision => revisions.push(revision));

    const first = await coordinator.start("a");
    records.set("a", {
      ...records.get("a")!,
      label: "Edited",
      durationMs: 1_000,
      outputs: { browserSource: true, deviceRouteIds: ["route-edited"] }
    });
    const second = await coordinator.start("b");

    expect(first).toMatchObject({ changed: true, state: { status: "running", definitionId: "a", generation: "generation-1", endsAtEpochMs: 11_000 } });
    expect(second).toMatchObject({ changed: true, state: { status: "running", definitionId: "b", generation: "generation-2", endsAtEpochMs: 6_000 } });
    expect(coordinator.getState("a")?.snapshot.label).toBe("Timer a");
    expect(coordinator.getState("a")?.snapshot.outputs).toEqual({ browserSource: false, deviceRouteIds: [] });
    expect(coordinator.listStates().map(state => state.definitionId)).toEqual(["b", "a"]);
    expect(revisions).toEqual([1, 2]);
    expect(cueSink.play).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("uses edited output routes only for the next run generation", async () => {
    const { coordinator, records } = setup();
    await coordinator.start("a");
    records.set("a", { ...records.get("a")!, outputs: { browserSource: false, deviceRouteIds: ["route-new"] } });
    expect(coordinator.getState("a")?.snapshot.outputs.deviceRouteIds).toEqual([]);

    await coordinator.restart("a");
    expect(coordinator.getState("a")?.snapshot.outputs.deviceRouteIds).toEqual(["route-new"]);
  });

  it("orders active state for Operator by completed, running deadline, then paused remaining", async () => {
    const { coordinator, time } = setup(); await coordinator.start("a"); await coordinator.start("b");
    await coordinator.pause("b"); expect(coordinator.listStates().map(state => state.definitionId)).toEqual(["a", "b"]);
    await time.advance(10_000); expect(coordinator.listStates().map(state => state.definitionId)).toEqual(["a", "b"]);
  });

  it("makes lifecycle commands idempotent and only cues start and completion", async () => {
    const { coordinator, cueSink, time } = setup();
    expect(await coordinator.pause("a")).toEqual({ changed: false, state: null });
    await coordinator.start("a");
    expect((await coordinator.start("a")).changed).toBe(false);
    await time.advance(2_500);
    expect(await coordinator.pause("a")).toMatchObject({ changed: true, state: { status: "paused", remainingMs: 7_500 } });
    expect((await coordinator.pause("a")).changed).toBe(false);
    await time.advance(20_000);
    expect(coordinator.getState("a")?.status).toBe("paused");
    expect(await coordinator.resume("a")).toMatchObject({ changed: true, state: { status: "running", endsAtEpochMs: 31_000 } });
    expect((await coordinator.resume("a")).changed).toBe(false);
    await time.advance(7_500);
    expect(coordinator.getState("a")?.status).toBe("completed");
    expect(cueSink.play).toHaveBeenCalledTimes(2);
    expect(cueSink.play).toHaveBeenLastCalledWith(expect.objectContaining({ cue: "end", run: expect.objectContaining({ status: "completed" }) }));
    await time.advance(2_999);
    expect(coordinator.getState("a")?.status).toBe("completed");
    await time.advance(1);
    expect(coordinator.getState("a")).toBeNull();
    expect(await coordinator.stop("a")).toEqual({ changed: false, state: null });
  });

  it("stops without an end cue and restart replaces the generation", async () => {
    const { coordinator, cueSink, time } = setup();
    await coordinator.start("a");
    const restarted = await coordinator.restart("a");
    expect(restarted).toMatchObject({ changed: true, state: { generation: "generation-2", endsAtEpochMs: 11_000 } });
    expect(cueSink.stop).toHaveBeenCalledWith("generation-1");
    await time.advance(10_000);
    expect(cueSink.play).toHaveBeenCalledTimes(3);
    expect(await coordinator.stop("a")).toEqual({ changed: true, state: null });
    expect(cueSink.stop).toHaveBeenLastCalledWith("generation-2");
    expect(cueSink.play).toHaveBeenCalledTimes(3);
  });

  it("ignores stale callbacks and chunks delays below the platform limit", async () => {
    const durationMs = 2_147_483_647 * 2 + 25;
    const { coordinator, cueSink, time } = setup([definition("long", durationMs)]);
    await coordinator.start("long");
    const firstCallback = time.scheduled[0]!.callback;
    expect(time.scheduled[0]!.delay).toBe(2_147_483_647);
    await coordinator.restart("long");
    firstCallback();
    expect(coordinator.getState("long")?.generation).toBe("generation-2");
    await time.advance(2_147_483_647);
    expect(time.scheduled.at(-1)!.delay).toBe(2_147_483_647);
    await time.advance(2_147_483_647 + 25);
    expect(coordinator.getState("long")?.status).toBe("completed");
    expect(cueSink.play).toHaveBeenCalledTimes(3);
  });

  it("projects active states for the requested profile without timer ticks", async () => {
    const { coordinator, time } = setup();
    await coordinator.start("a");
    await time.advance(1_000);
    await coordinator.start("b");
    const snapshot = await coordinator.getModuleSnapshot({
      moduleId: "timers", overlayId: "default", purpose: "live", scope: "module", targetProfileId: "vertical"
    });
    expect(snapshot).toMatchObject({
      moduleId: "timers",
      enabled: true,
      instructions: [],
      presentation: { kind: "timer-stack", stack: { targetProfileId: "vertical", region: { orientation: "horizontal" } } }
    });
    expect(snapshot.presentation?.stack.cards.map(card => card.definitionId)).toEqual(["b", "a"]);
  });

  it("starts empty, rejects missing definitions, swallows cue failures, and closes owned work", async () => {
    const { coordinator, cueSink } = setup();
    expect(coordinator.listStates()).toEqual([]);
    await expect(coordinator.start("missing")).rejects.toThrow('Timer "missing" was not found');
    vi.mocked(cueSink.play).mockRejectedValueOnce(new Error("speaker failed"));
    await expect(coordinator.start("a")).resolves.toMatchObject({ changed: true });
    await coordinator.start("b");
    await coordinator.close();
    expect(coordinator.listStates()).toEqual([]);
    expect(cueSink.stop).toHaveBeenCalledWith("generation-1");
    expect(cueSink.stop).toHaveBeenCalledWith("generation-2");
    await expect(coordinator.start("a")).rejects.toThrow("closed");
  });
});
