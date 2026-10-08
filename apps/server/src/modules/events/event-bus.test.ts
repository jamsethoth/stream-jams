import type { BusEvent, EffectTrigger, NormalizedStreamEvent } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, type StreamJamsDatabase } from "../db/database.js";
import { EventBus, type EventBusConsumer, type EventBusDeliveryFailureReport, type EventBusOptions } from "./event-bus.js";
import { EventIngestionService } from "./event-ingestion-service.js";
import { SqliteEventBusJournalRepository } from "./sqlite-event-bus-journal-repository.js";

describe("EventBus", () => {
  it("journals an accepted event before delivering it to every consumer", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const journal = new SqliteEventBusJournalRepository(database.connection);
    const seenHeads: number[] = [];
    const alerts = recordingConsumer("alerts", () => { seenHeads.push(journal.headSequence()); });
    const timers = recordingConsumer("timers");
    const bus = createBus(database, [alerts, timers]);

    await expect(bus.handleEvent(follow("follow-1"), [])).resolves.toEqual({ status: "accepted" });

    expect(seenHeads).toEqual([1]);
    expect(alerts.events.map(eventIdOf)).toEqual(["follow-1"]);
    expect(timers.events.map(eventIdOf)).toEqual(["follow-1"]);
    expect(alerts.events[0]).toMatchObject({ kind: "canonical", sequence: 1, sourceKind: "twitch", effectTriggers: [] });
    expect(journal.getCursor("alerts")).toBe(1);
    expect(journal.getCursor("timers")).toBe(1);
  });

  it("publishes Streamer.bot trigger-only events as external bus events", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const effects = recordingConsumer("screen-effects");
    const bus = createBus(database, [effects]);

    await bus.handleTriggers([customTrigger("streamerbot:custom-1")]);

    expect(effects.events).toEqual([expect.objectContaining({
      kind: "external", eventId: "streamerbot:custom-1", sourceKind: "streamerbot", effectTriggers: [customTrigger("streamerbot:custom-1")]
    })]);
  });

  it("keeps delivering to other consumers when one consumer fails", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const failures: EventBusDeliveryFailureReport[] = [];
    const effects: EventBusConsumer = { id: "screen-effects", maxAttempts: 1, async handle() { throw new Error("Effect queue unavailable"); } };
    const alerts = recordingConsumer("alerts");
    const bus = createBus(database, [effects, alerts], { onDeliveryFailure: (failure) => { failures.push(failure); } });

    await expect(bus.handleEvent(follow("follow-1"), [])).resolves.toEqual({ status: "accepted" });
    await bus.handleEvent(follow("follow-2"), []);

    expect(alerts.events.map(eventIdOf)).toEqual(["follow-1", "follow-2"]);
    expect(failures.map((failure) => [failure.consumerId, failure.sequence, failure.attempts, failure.referenceId])).toEqual([
      ["screen-effects", 1, 1, "ref-1"],
      ["screen-effects", 2, 1, "ref-2"]
    ]);
    expect(database.connection.prepare("SELECT sequence, consumer_id, attempts, error_message, reference_id FROM event_bus_delivery_failures ORDER BY sequence").all())
      .toEqual([
        { sequence: 1, consumer_id: "screen-effects", attempts: 1, error_message: "Effect queue unavailable", reference_id: "ref-1" },
        { sequence: 2, consumer_id: "screen-effects", attempts: 1, error_message: "Effect queue unavailable", reference_id: "ref-2" }
      ]);
    expect(new SqliteEventBusJournalRepository(database.connection).getCursor("screen-effects")).toBe(2);
  });

  it("retries a failing consumer with backoff, then records the event as failed and moves on", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const delays: number[] = [];
    let attempts = 0;
    const flaky: EventBusConsumer = {
      id: "flaky",
      async handle(event) {
        attempts += 1;
        if (eventIdOf(event) === "follow-1") throw new Error("still failing");
      }
    };
    const bus = createBus(database, [flaky], { sleep: async (delayMs) => { delays.push(delayMs); } });

    await bus.handleEvent(follow("follow-1"), []);
    await bus.handleEvent(follow("follow-2"), []);

    expect(attempts).toBe(4);
    expect(delays).toEqual([50, 200]);
    expect(database.connection.prepare("SELECT attempts FROM event_bus_delivery_failures").all()).toEqual([{ attempts: 3 }]);
  });

  it("succeeds on a retry without recording a failure", async () => {
    using database = createInMemoryStreamJamsDatabase();
    let attempts = 0;
    const consumer: EventBusConsumer = { id: "retrying", async handle() { attempts += 1; if (attempts === 1) throw new Error("temporary"); } };
    const bus = createBus(database, [consumer], { sleep: async () => {} });

    await bus.handleEvent(follow("follow-1"), []);

    expect(attempts).toBe(2);
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM event_bus_delivery_failures").get()).toEqual({ count: 0 });
  });

  it("delivers to each consumer in journal order when publishes overlap", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow: EventBusConsumer = {
      id: "slow",
      async handle(event) {
        if (eventIdOf(event) === "follow-1") await gate;
        order.push(eventIdOf(event));
      }
    };
    const bus = createBus(database, [slow]);

    const first = bus.handleEvent(follow("follow-1"), []);
    const second = bus.handleEvent(follow("follow-2"), []);
    release();
    await Promise.all([first, second]);

    expect(order).toEqual(["follow-1", "follow-2"]);
  });

  it("treats a same-source redelivery inside the window as a duplicate, including after restart", async () => {
    using database = createInMemoryStreamJamsDatabase();
    let currentTime = new Date("2026-10-08T12:00:00.000Z");
    const consumer = recordingConsumer("alerts");
    const options = { now: () => currentTime };
    await createBus(database, [consumer], options).handleEvent(follow("follow-1"), []);

    const restarted = createBus(database, [consumer], options);
    await restarted.start();
    currentTime = new Date("2026-10-08T12:09:59.000Z");
    await expect(restarted.handleEvent(follow("follow-1"), [])).resolves.toEqual({ status: "duplicate" });
    await expect(restarted.handleEvent(follow("follow-1", "streamerbot"), [])).resolves.toEqual({ status: "accepted" });
    currentTime = new Date("2026-10-08T12:10:01.000Z");
    await expect(restarted.handleEvent(follow("follow-1"), [])).resolves.toEqual({ status: "accepted" });

    expect(consumer.events.map((event) => [eventIdOf(event), event.sourceKind])).toEqual([
      ["follow-1", "twitch"], ["follow-1", "streamerbot"], ["follow-1", "twitch"]
    ]);
  });

  it("rejects publishing and delivers nothing when the journal write fails", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const journal = new SqliteEventBusJournalRepository(database.connection);
    const consumer = recordingConsumer("alerts");
    const bus = new EventBus({
      journal: Object.assign(Object.create(journal) as SqliteEventBusJournalRepository, {
        append() { throw new Error("database is locked"); }
      }),
      consumers: [consumer],
      generateReferenceId: () => "ref-1"
    });

    await expect(bus.handleEvent(follow("follow-1"), [])).rejects.toThrow("database is locked");
    expect(consumer.events).toEqual([]);
  });

  it("skips and reports events a consumer had not received before restart", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const journal = new SqliteEventBusJournalRepository(database.connection);
    journal.setCursor("alerts", 0, "2026-10-08T12:00:00.000Z");
    journal.setCursor("retired-module", 0, "2026-10-08T12:00:00.000Z");
    for (const id of ["follow-1", "follow-2"]) {
      journal.append({
        kind: "canonical", event: follow(id), eventId: id, sourceKind: "twitch", sourceRegistrationId: null,
        receivedAt: "2026-10-08T12:00:00.000Z", effectTriggers: []
      }, `bus-${id}`, 0);
    }
    const skipped: Array<[string, number]> = [];
    const alerts = recordingConsumer("alerts");
    const timers = recordingConsumer("timers");
    const bus = createBus(database, [alerts, timers], { onReplaySkipped: (consumerId, count) => { skipped.push([consumerId, count]); } });

    await bus.start();
    await bus.drain();

    expect(skipped).toEqual([["alerts", 2]]);
    expect(alerts.events).toEqual([]);
    expect(timers.events).toEqual([]);
    expect(journal.getCursor("alerts")).toBe(2);
    expect(journal.getCursor("timers")).toBe(2);
    expect(journal.getCursor("retired-module")).toBeNull();
  });

  it("records an unreadable journal row as failed and keeps the consumer moving", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const failures: EventBusDeliveryFailureReport[] = [];
    const consumer = recordingConsumer("alerts");
    const bus = createBus(database, [consumer], { onDeliveryFailure: (failure) => { failures.push(failure); } });
    await bus.start();
    database.connection.prepare(`INSERT INTO event_bus_journal
      (bus_id, event_id, source_kind, source_registration_id, kind, received_at, received_at_ms, payload_json)
      VALUES ('bus-bad', 'bad', 'twitch', NULL, 'canonical', '2026-10-08T12:00:00.000Z', 0, '{not json')`).run();

    await bus.handleEvent(follow("follow-1"), []);

    expect(failures.map((failure) => [failure.sequence, failure.event])).toEqual([[1, null]]);
    expect(consumer.events.map(eventIdOf)).toEqual(["follow-1"]);
  });

  it("keeps advancing when failure reporting itself fails", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const failing: EventBusConsumer = { id: "failing", maxAttempts: 1, async handle() { throw new Error("boom"); } };
    const bus = createBus(database, [failing], { onDeliveryFailure: () => { throw new Error("logger down"); } });

    await expect(bus.handleEvent(follow("follow-1"), [])).resolves.toEqual({ status: "accepted" });
    expect(new SqliteEventBusJournalRepository(database.connection).getCursor("failing")).toBe(1);
  });

  it("prunes only rows every consumer has passed, bounded by age and row count", async () => {
    using database = createInMemoryStreamJamsDatabase();
    let currentTime = new Date("2026-10-01T12:00:00.000Z");
    const bus = createBus(database, [recordingConsumer("alerts")], { now: () => currentTime, retentionRows: 2 });
    for (const id of ["follow-1", "follow-2", "follow-3"]) await bus.handleEvent(follow(id), []);
    expect(storedEventIds(database)).toEqual(["follow-1", "follow-2", "follow-3"]);

    expect(bus.prune()).toBe(1);
    expect(storedEventIds(database)).toEqual(["follow-2", "follow-3"]);

    currentTime = new Date("2026-10-08T12:00:01.000Z");
    const journal = new SqliteEventBusJournalRepository(database.connection);
    journal.setCursor("alerts", 2, currentTime.toISOString());
    expect(bus.prune()).toBe(1);
    expect(storedEventIds(database)).toEqual(["follow-3"]);
    expect(journal.headSequence()).toBe(3);
  });

  it("rejects duplicate consumer IDs", () => {
    using database = createInMemoryStreamJamsDatabase();
    expect(() => createBus(database, [recordingConsumer("alerts"), recordingConsumer("alerts")])).toThrow("unique");
  });

  it("lets ingestion report a journal duplicate after restart instead of accepting it", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const consumer = recordingConsumer("alerts");
    const options = { now: () => new Date("2026-10-08T12:00:00.000Z") };
    const first = new EventIngestionService({ sink: createBus(database, [consumer], options) });
    await expect(first.ingestNormalizedEvent(follow("follow-1"))).resolves.toMatchObject({ status: "accepted" });

    const afterRestart = new EventIngestionService({ sink: createBus(database, [consumer], options) });
    await expect(afterRestart.ingestNormalizedEvent(follow("follow-1"))).resolves.toEqual({ status: "duplicate", messageId: "follow-1" });
    expect(afterRestart.getStatus()).toMatchObject({ state: "ready", duplicateCount: 1, acceptedCount: 0 });
    expect(consumer.events).toHaveLength(1);
  });
});

function createBus(
  database: StreamJamsDatabase,
  consumers: readonly EventBusConsumer[],
  options: Partial<Omit<EventBusOptions, "journal" | "consumers">> = {}
): EventBus {
  let nextReference = 1;
  let nextBusId = 1;
  return new EventBus({
    journal: new SqliteEventBusJournalRepository(database.connection),
    consumers,
    generateReferenceId: () => `ref-${nextReference++}`,
    generateBusId: () => `bus-${Date.now()}-${nextBusId++}-${Math.random()}`,
    now: () => new Date("2026-10-08T12:00:00.000Z"),
    ...options
  });
}

function recordingConsumer(id: string, onEvent: (event: BusEvent) => void = () => {}): EventBusConsumer & { readonly events: BusEvent[] } {
  const events: BusEvent[] = [];
  return { id, events, async handle(event) { onEvent(event); events.push(event); } };
}

function eventIdOf(event: BusEvent): string {
  return event.eventId;
}

function storedEventIds(database: StreamJamsDatabase): string[] {
  return database.connection.prepare("SELECT event_id FROM event_bus_journal ORDER BY sequence").all().map((row) => String(row.event_id));
}

function follow(id: string, ingestProvider: "twitch" | "streamerbot" = "twitch"): NormalizedStreamEvent {
  return {
    id,
    type: "follow",
    providerId: "twitch",
    sourcePlatform: "twitch",
    ingestProvider,
    occurredAt: "2026-10-08T12:00:00.000Z",
    actor: { id: "viewer-1", displayName: "Viewer" },
    message: null,
    amount: null,
    metadata: {}
  };
}

function customTrigger(eventId: string): EffectTrigger {
  return {
    kind: "streamerbot-event",
    eventId,
    occurredAt: "2026-10-08T12:00:00.000Z",
    providerId: "provider-streamerbot",
    sourceKey: "General",
    eventType: "Custom",
    summary: "Custom event"
  };
}
