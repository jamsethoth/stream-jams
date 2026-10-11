import { DefaultPlaybackQueue, type NormalizedStreamEvent } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { toAlertOwnerSnapshot, toEffectOwnerSnapshot } from "./playback-queue-owners.js";

describe("toAlertOwnerSnapshot", () => {
  it("projects the immutable enqueue sequence after priority reorders the queue", () => {
    let nextId = 1;
    const queue = new DefaultPlaybackQueue({
      clock: () => new Date("2026-09-13T12:00:00.000Z"),
      generateId: () => `item-${nextId++}`
    });
    queue.pause();
    queue.enqueue({ sourceEvent: event("early-low"), alerts: [], audio: [audio()], priority: 1 });
    queue.enqueue({ sourceEvent: event("later-high"), alerts: [], audio: [audio()], priority: 10 });

    const snapshot = toAlertOwnerSnapshot(queue.getSnapshot(), false);

    expect(snapshot.queued.map((item) => [item.occurrenceId, item.sequence, item.moduleQueuePosition])).toEqual([
      ["item-2", 1, 1],
      ["item-1", 0, 2]
    ]);
  });

  it("names the delivering source, keeps it on replay, and leaves editor tests without one", () => {
    let nextId = 1;
    const queue = new DefaultPlaybackQueue({ clock: () => new Date("2026-09-13T12:00:00.000Z"), generateId: () => `item-${nextId++}` });
    queue.enqueue({ sourceEvent: event("live"), alerts: [], audio: [audio()], deliveredBy: "streamerbot" });
    queue.completeCurrent();
    queue.pause();
    queue.replayRecent("item-1");
    queue.enqueue({ sourceEvent: event("editor-test"), alerts: [], audio: [audio()] });

    const snapshot = toAlertOwnerSnapshot(queue.getSnapshot(), false);

    expect(snapshot.recent.map((item) => item.source)).toEqual(["streamerbot"]);
    expect(snapshot.queued.map((item) => [item.occurrenceId, item.source])).toEqual([["item-2", "streamerbot"], ["item-3", null]]);
  });
});

describe("toEffectOwnerSnapshot", () => {
  it("names the delivering source, or none for a manual test", () => {
    const base = { moduleId: "screen-effects" as const, trigger: null, content: { effectId: "e", effectName: "Effect", priority: 0 } as never, enqueuedAtMs: 1, startedAtMs: null, completedAtMs: null, status: "queued" as const };
    const snapshot = toEffectOwnerSnapshot({
      current: null,
      queued: [{ ...base, id: "live", sequence: 0, sourceKind: "twitch" }, { ...base, id: "test", sequence: 1, sourceKind: null }],
      recent: [],
      modulePaused: false
    });
    expect(snapshot.queued.map((item) => [item.occurrenceId, item.source])).toEqual([["live", "twitch"], ["test", null]]);
  });
});

function event(id: string): NormalizedStreamEvent {
  return {
    id,
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider: "twitch",
    occurredAt: "2026-09-13T12:00:00.000Z",
    type: "cheer",
    actor: { id: "viewer", displayName: "Viewer" },
    message: null,
    amount: 100,
    metadata: {}
  } as NormalizedStreamEvent;
}

function audio() {
  return {
    documentId: "alert",
    durationMs: 1_000,
    outputs: { browserSource: true, deviceRouteIds: [] },
    layers: [{ sourceKind: "audio" as const, layerId: "sound", assetId: "tone", volume: 0.5 }]
  };
}
