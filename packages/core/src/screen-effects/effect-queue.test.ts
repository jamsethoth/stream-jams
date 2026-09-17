import { describe, expect, it } from "vitest";
import { defaultPlaybackSafetyState } from "../playback/types.js";
import {
  DefaultEffectQueue,
  comparePendingEffects,
  type EffectOccurrence
} from "./effect-queue.js";

function occurrence(
  id: string,
  options: { readonly priority?: number; readonly sequence?: number; readonly enqueuedAtMs?: number } = {}
): EffectOccurrence {
  return {
    id,
    moduleId: "screen-effects",
    trigger: null,
    content: {
      effectId: `effect-${id}`,
      effectName: `Effect ${id}`,
      priority: options.priority ?? 0,
      variant: {
        id: `variant-${id}`,
        name: "Default",
        enabled: true,
        weight: 1,
        visual: null,
        sound: { assetId: "tone", volume: 0.1 },
        animation: null,
        durationMs: 10_000,
        outputs: { browserSource: false, deviceRouteIds: ["headphones"] },
        visualOutputs: { browserSource: false, desktop: false }
      }
    },
    enqueuedAtMs: options.enqueuedAtMs ?? 1_000,
    sequence: options.sequence ?? 0,
    startedAtMs: null,
    completedAtMs: null,
    status: "queued"
  };
}

describe("DefaultEffectQueue", () => {
  it("orders pending work by priority then FIFO, without a global order", () => {
    const base = occurrence("base", { sequence: 1 });
    const later = occurrence("later", { sequence: 2 });
    const high = occurrence("high", { priority: 5, sequence: 2 });

    expect([later, high, base].sort(comparePendingEffects).map((item) => item.id)).toEqual([
      "high",
      "base",
      "later"
    ]);
  });

  it("caps pending work without evicting existing occurrences", () => {
    const queue = new DefaultEffectQueue({ maxPending: 2 });

    expect(queue.enqueue(occurrence("first"))).toBe("queued");
    expect(queue.enqueue(occurrence("second", { sequence: 1 }))).toBe("queued");
    expect(queue.enqueue(occurrence("overflow", { priority: 99, sequence: 2 }))).toBe("full");

    expect(queue.snapshot().queued.map((item) => item.id)).toEqual(["first", "second"]);
  });

  it("does not preempt current work and advances by priority then FIFO", () => {
    let now = 2_000;
    const queue = new DefaultEffectQueue({ now: () => now });
    queue.enqueue(occurrence("first", { sequence: 1 }));
    expect(queue.advance(defaultPlaybackSafetyState)?.id).toBe("first");

    queue.enqueue(occurrence("low", { priority: 1, sequence: 2 }));
    queue.enqueue(occurrence("high", { priority: 10, sequence: 3 }));
    expect(queue.advance(defaultPlaybackSafetyState)).toBeNull();
    expect(queue.snapshot().current?.id).toBe("first");

    now = 3_000;
    expect(queue.complete("first", "completed", now)).toBe(true);
    expect(queue.advance(defaultPlaybackSafetyState)?.id).toBe("high");
  });

  it("holds advancement for global pause, DND, and module pause but not mute", () => {
    const queue = new DefaultEffectQueue();
    queue.enqueue(occurrence("first"));

    expect(queue.advance({ paused: true, muted: false, doNotDisturb: false })).toBeNull();
    expect(queue.advance({ paused: false, muted: false, doNotDisturb: true })).toBeNull();
    queue.setModulePaused(true);
    expect(queue.advance(defaultPlaybackSafetyState)).toBeNull();
    queue.setModulePaused(false);

    expect(queue.advance({ paused: false, muted: true, doNotDisturb: false })?.id).toBe("first");
  });

  it("retains 25 recent outcomes, rejects stale completion, and starts empty after restart", () => {
    const queue = new DefaultEffectQueue({ recentLimit: 25 });
    for (let index = 0; index < 26; index += 1) {
      const item = occurrence(`item-${index}`, { sequence: index });
      queue.enqueue(item);
      queue.advance(defaultPlaybackSafetyState);
      expect(queue.complete(item.id, index % 2 === 0 ? "skipped" : "failed", index + 1)).toBe(true);
    }

    expect(queue.complete("missing", "completed", 100)).toBe(false);
    expect(queue.snapshot().recent).toHaveLength(25);
    expect(queue.snapshot().recent.at(0)).toMatchObject({ id: "item-25", status: "failed" });
    expect(queue.snapshot().recent.at(-1)?.id).toBe("item-1");
    expect(new DefaultEffectQueue().snapshot()).toMatchObject({ current: null, queued: [], recent: [] });
  });

  it("removes and clears only pending work", () => {
    const queue = new DefaultEffectQueue();
    queue.enqueue(occurrence("current"));
    queue.advance(defaultPlaybackSafetyState);
    queue.enqueue(occurrence("pending-a", { sequence: 1 }));
    queue.enqueue(occurrence("pending-b", { sequence: 2 }));

    expect(queue.remove("current")).toBe(false);
    expect(queue.remove("pending-a")).toBe(true);
    expect(queue.clearPending()).toBe(1);
    expect(queue.snapshot()).toMatchObject({ current: { id: "current" }, queued: [] });
  });

  it("returns deep snapshots that cannot retarget queued content", () => {
    const queue = new DefaultEffectQueue();
    queue.enqueue(occurrence("safe"));
    const snapshot = queue.snapshot();
    const routeIds = snapshot.queued[0]!.content.variant.outputs.deviceRouteIds as string[];
    routeIds.push("attacker-route");

    expect(queue.snapshot().queued[0]!.content.variant.outputs.deviceRouteIds).toEqual(["headphones"]);
  });
});
