import type { CheerEvent } from "../events/types.js";
import type { OverlayInstruction } from "../overlays/types.js";
import type { ResolvedAlert } from "./types.js";
import { describe, expect, it } from "vitest";
import { playbackQueueSnapshotSchema } from "./schemas.js";
import { DefaultPlaybackQueue, PlaybackQueueItemNotFoundError } from "./playback-queue.js";

describe("DefaultPlaybackQueue", () => {
  it("enqueues all resolved alerts from one event as one playing queue item", () => {
    const clock = new MutableClock("2026-05-30T12:00:00.000Z");
    const queue = createQueue(clock);
    const sourceEvent = createCheerEvent();
    const alerts = [createResolvedAlert("alert-1"), createResolvedAlert("alert-2")];

    const snapshot = queue.enqueue({
      sourceEvent,
      alerts,
      priority: 5
    });

    expect(snapshot.current).toMatchObject({
      id: "queue-item-1",
      sourceEvent,
      alerts,
      priority: 5,
      status: "playing",
      enqueuedAt: "2026-05-30T12:00:00.000Z",
      startedAt: "2026-05-30T12:00:00.000Z",
      completedAt: null
    });
    expect(snapshot.queued).toEqual([]);
    expect(playbackQueueSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("orders queued items by priority while preserving FIFO order for ties", () => {
    const clock = new MutableClock("2026-05-30T12:00:00.000Z");
    const queue = createQueue(clock);
    queue.pause();

    queue.enqueue({ sourceEvent: createCheerEvent({ id: "low" }), alerts: [createResolvedAlert("low")], priority: 1 });
    queue.enqueue({ sourceEvent: createCheerEvent({ id: "high" }), alerts: [createResolvedAlert("high")], priority: 10 });
    queue.enqueue({ sourceEvent: createCheerEvent({ id: "tie" }), alerts: [createResolvedAlert("tie")], priority: 10 });

    expect(queue.getSnapshot().queued.map((item) => item.sourceEvent.id)).toEqual(["high", "tie", "low"]);

    queue.resume();

    expect(queue.getSnapshot().current?.sourceEvent.id).toBe("high");
    expect(queue.getSnapshot().queued.map((item) => item.sourceEvent.id)).toEqual(["tie", "low"]);
  });

  it("updates playback flags and does not auto-start while paused or in do-not-disturb", () => {
    const clock = new MutableClock("2026-05-30T12:00:00.000Z");
    const queue = createQueue(clock);

    queue.pause();
    queue.mute();
    queue.enqueue({ sourceEvent: createCheerEvent({ id: "paused" }), alerts: [createResolvedAlert("paused")], priority: 0 });

    expect(queue.getSnapshot()).toMatchObject({
      current: null,
      paused: true,
      muted: true
    });

    queue.resume();
    expect(queue.getSnapshot().current?.sourceEvent.id).toBe("paused");

    queue.enqueue({ sourceEvent: createCheerEvent({ id: "blocked" }), alerts: [createResolvedAlert("blocked")], priority: 0 });
    queue.setDoNotDisturb(true);
    clock.set("2026-05-30T12:00:01.000Z");
    queue.completeCurrent();

    expect(queue.getSnapshot()).toMatchObject({
      current: null,
      doNotDisturb: true,
      muted: true
    });
    expect(queue.getSnapshot().queued.map((item) => item.sourceEvent.id)).toEqual(["blocked"]);

    queue.unmute();
    queue.setDoNotDisturb(false);
    expect(queue.getSnapshot()).toMatchObject({
      current: {
        sourceEvent: {
          id: "blocked"
        }
      },
      doNotDisturb: false,
      muted: false
    });
  });

  it("records completed and skipped items, replays known recent items, and rejects unknown replay IDs", () => {
    const clock = new MutableClock("2026-05-30T12:00:00.000Z");
    const queue = createQueue(clock);

    queue.enqueue({ sourceEvent: createCheerEvent({ id: "first" }), alerts: [createResolvedAlert("first")], priority: 0 });
    clock.set("2026-05-30T12:00:01.000Z");
    queue.completeCurrent();
    queue.enqueue({ sourceEvent: createCheerEvent({ id: "second" }), alerts: [createResolvedAlert("second")], priority: 0 });
    clock.set("2026-05-30T12:00:02.000Z");
    queue.skipCurrent();

    expect(queue.getSnapshot().recent.map((item) => [item.sourceEvent.id, item.status])).toEqual([
      ["second", "skipped"],
      ["first", "completed"]
    ]);
    expect(() => queue.replayRecent("missing")).toThrow(new PlaybackQueueItemNotFoundError("missing"));

    clock.set("2026-05-30T12:00:03.000Z");
    queue.replayRecent("queue-item-1");

    expect(queue.getSnapshot().current).toMatchObject({
      id: "queue-item-3",
      sourceEvent: {
        id: "first"
      },
      status: "playing",
      enqueuedAt: "2026-05-30T12:00:03.000Z",
      startedAt: "2026-05-30T12:00:03.000Z"
    });
  });

  it("returns defensive snapshots that cannot mutate queue internals", () => {
    const queue = createQueue(new MutableClock("2026-05-30T12:00:00.000Z"));
    queue.enqueue({
      sourceEvent: createCheerEvent({ id: "immutable" }),
      alerts: [createResolvedAlert("immutable")],
      priority: 0
    });

    const snapshot = queue.getSnapshot();
    if (snapshot.current === null) {
      throw new Error("Expected current item");
    }

    (snapshot.current.alerts as ResolvedAlert[]).push(createResolvedAlert("mutated"));
    (snapshot.current.sourceEvent as { id: string }).id = "mutated-event";

    const nextSnapshot = queue.getSnapshot();

    expect(nextSnapshot.current?.sourceEvent.id).toBe("immutable");
    expect(nextSnapshot.current?.alerts.map((alert) => alert.id)).toEqual(["immutable"]);
  });

  it("ignores empty alert batches", () => {
    const queue = createQueue(new MutableClock("2026-05-30T12:00:00.000Z"));

    expect(queue.enqueue({ sourceEvent: createCheerEvent(), alerts: [], priority: 0 })).toEqual(queue.getSnapshot());
  });
});

function createQueue(clock: MutableClock): DefaultPlaybackQueue {
  let nextId = 1;
  return new DefaultPlaybackQueue({
    clock: () => clock.now(),
    generateId: () => `queue-item-${nextId++}`
  });
}

class MutableClock {
  #value: string;

  constructor(initialValue: string) {
    this.#value = initialValue;
  }

  set(value: string): void {
    this.#value = value;
  }

  now(): Date {
    return new Date(this.#value);
  }
}

function createCheerEvent(overrides: Partial<CheerEvent> = {}): CheerEvent {
  return {
    id: "event-cheer",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    occurredAt: "2026-05-30T11:59:59.000Z",
    type: "cheer",
    actor: {
      id: "viewer-1",
      displayName: "Viewer"
    },
    message: null,
    amount: 100,
    metadata: {},
    ...overrides
  };
}

function createResolvedAlert(id: string): ResolvedAlert {
  return {
    id,
    sourceEventId: "event-cheer",
    ruleId: `rule-${id}`,
    variantId: `variant-${id}`,
    overlayInstruction: createOverlayInstruction(id)
  };
}

function createOverlayInstruction(id: string): OverlayInstruction {
  return {
    id: `instruction-${id}`,
    overlayId: "overlay-1",
    moduleId: "alerts",
    purpose: "live",
    scope: "module",
    visual: null,
    audio: null,
    text: {
      text: `Alert ${id}`,
      layout: {
        x: 0,
        y: 0,
        width: 320,
        height: 180,
        zIndex: 1
      }
    },
    tts: null,
    durationMs: 3000
  };
}
