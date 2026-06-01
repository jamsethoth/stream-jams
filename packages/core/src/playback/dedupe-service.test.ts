import type { CheerEvent } from "../events/types.js";
import { describe, expect, it } from "vitest";
import { DefaultPlaybackDedupeService } from "./dedupe-service.js";

describe("DefaultPlaybackDedupeService", () => {
  it("rejects repeated provider event IDs inside the dedupe window", () => {
    const clock = new MutableClock("2026-05-30T12:00:00.000Z");
    const dedupe = new DefaultPlaybackDedupeService({
      clock: () => clock.now(),
      windowMs: 60_000
    });

    expect(dedupe.accept(createCheerEvent({ id: "event-1" }))).toBe(true);
    expect(dedupe.accept(createCheerEvent({ id: "event-1" }))).toBe(false);
    expect(dedupe.accept(createCheerEvent({ id: "event-2" }))).toBe(true);
  });

  it("allows repeated provider event IDs after the dedupe window expires", () => {
    const clock = new MutableClock("2026-05-30T12:00:00.000Z");
    const dedupe = new DefaultPlaybackDedupeService({
      clock: () => clock.now(),
      windowMs: 60_000
    });

    expect(dedupe.accept(createCheerEvent({ id: "event-1" }))).toBe(true);
    clock.set("2026-05-30T12:01:01.000Z");

    expect(dedupe.accept(createCheerEvent({ id: "event-1" }))).toBe(true);
  });
});

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
