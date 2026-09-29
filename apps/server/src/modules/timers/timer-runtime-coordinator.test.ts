import { describe, expect, it, vi } from "vitest";
import type { OverlayModuleConfig, TimerDefinition } from "@stream-jams/core";
import {
  TimerRuntimeCoordinator,
  type TimerClock,
  type TimerCueSink,
  type TimerScheduler
} from "./timer-runtime-coordinator.js";

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

function setup(definitions = [definition("a"), definition("b", 5_000)]) {
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
  it("starts independent timers with immutable definition snapshots and publishes revisions", async () => {
    const { coordinator, cueSink, records } = setup();
    const revisions: number[] = [];
    const unsubscribe = coordinator.subscribe(revision => revisions.push(revision));

    const first = await coordinator.start("a");
    records.set("a", { ...records.get("a")!, label: "Edited", durationMs: 1_000 });
    const second = await coordinator.start("b");

    expect(first).toMatchObject({ changed: true, state: { status: "running", definitionId: "a", generation: "generation-1", endsAtEpochMs: 11_000 } });
    expect(second).toMatchObject({ changed: true, state: { status: "running", definitionId: "b", generation: "generation-2", endsAtEpochMs: 6_000 } });
    expect(coordinator.getState("a")?.snapshot.label).toBe("Timer a");
    expect(coordinator.listStates()).toHaveLength(2);
    expect(revisions).toEqual([1, 2]);
    expect(cueSink.play).toHaveBeenCalledTimes(2);
    unsubscribe();
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
