import { externalEventPayloadMaxBytes, type BusEvent, type EffectTrigger, type NormalizedStreamEvent } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase, runInTransaction, type StreamJamsDatabase } from "../db/database.js";
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

  it("records the registration in use for each source kind", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const alerts = recordingConsumer("alerts");
    const registrations = { twitch: "provider-twitch", streamerbot: "provider-streamerbot" } as const;
    const bus = createBus(database, [alerts], { resolveSourceRegistrationId: async (kind) => registrations[kind] });

    await bus.handleEvent(follow("eventsub-1"), []);
    await bus.handleEvent({ ...follow("streamerbot-1", "streamerbot"), actor: { id: "viewer-2", displayName: "Other" } }, []);
    await bus.handleTriggers([customTrigger("streamerbot:custom-1")]);

    expect(alerts.events.map((event) => [event.sourceKind, event.sourceRegistrationId])).toEqual([
      ["twitch", "provider-twitch"], ["streamerbot", "provider-streamerbot"], ["streamerbot", "provider-streamerbot"]
    ]);
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

  it("journals an external payload only for identities a consumer registered, within the size limit", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const video = { ...recordingConsumer("video"), externalPayloads: [{ providerKind: "streamerbot", sourceKey: "general", eventType: "Custom" }] as const };
    const bus = createBus(database, [video]);
    const payload = { source: "StreamJams", nested: { value: 1 } };

    await bus.handleTriggers([customTrigger("wanted")], payload);
    await bus.handleTriggers([{ ...customTrigger("other-type"), eventType: "Other" }], payload);
    await bus.handleTriggers([customTrigger("not-object")], ["array"]);
    await bus.handleTriggers([customTrigger("oversized")], { text: "x".repeat(externalEventPayloadMaxBytes) });
    await bus.handleTriggers([customTrigger("absent")]);

    expect(bus.externalPayloadIdentities()).toEqual(video.externalPayloads);
    expect(video.events.map((event) => [event.eventId, event.kind === "external" ? event.payload : "canonical"])).toEqual([
      ["wanted", payload], ["other-type", undefined], ["not-object", undefined], ["oversized", undefined], ["absent", undefined]
    ]);
    // The payload survives the journal round trip that later deliveries read.
    const [stored] = new SqliteEventBusJournalRepository(database.connection).readAfter(0, 1);
    expect(stored?.event).toMatchObject({ eventId: "wanted", payload });
    expect(database.connection.prepare("SELECT payload_json FROM event_bus_journal WHERE event_id = 'other-type'").get())
      .toEqual({ payload_json: JSON.stringify({ effectTriggers: [{ ...customTrigger("other-type"), eventType: "Other" }] }) });
  });

  it("lets a consumer checkpoint inside its own transaction so each event applies exactly once", async () => {
    using database = createInMemoryStreamJamsDatabase();
    database.connection.exec("CREATE TEMP TABLE applied (event_id TEXT NOT NULL)");
    const failures: EventBusDeliveryFailureReport[] = [];
    let call = 0;
    const consumer: EventBusConsumer = {
      id: "data",
      async handle(event, { checkpoint }) {
        call += 1;
        runInTransaction(database.connection, () => {
          database.connection.prepare("INSERT INTO applied VALUES (?)").run(event.eventId);
          checkpoint();
          // First call: fail inside the transaction, so the state change and the checkpoint roll back together.
          if (call === 1) throw new Error("Interrupted before commit");
        });
        // Second call: the transaction committed, then the handler failed; the event must not be applied again.
        if (call === 2) throw new Error("Failed after commit");
      }
    };
    const bus = createBus(database, [consumer], { onDeliveryFailure: (failure) => { failures.push(failure); }, sleep: async () => {} });

    await bus.handleEvent(follow("follow-1"), []);

    expect(call).toBe(2);
    expect(database.connection.prepare("SELECT event_id FROM applied").all()).toEqual([{ event_id: "follow-1" }]);
    expect(new SqliteEventBusJournalRepository(database.connection).getCursor("data")).toBe(1);
    expect(failures).toEqual([]);
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
    const otherViewer = { ...follow("follow-1", "streamerbot"), actor: { id: "viewer-2", displayName: "Other" } };
    await expect(restarted.handleEvent(otherViewer, [])).resolves.toEqual({ status: "accepted" });
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

  it("replays events pending before restart within the replay age and expires older ones", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const journal = new SqliteEventBusJournalRepository(database.connection);
    journal.setCursor("alerts", 0, "2026-10-08T11:00:00.000Z");
    journal.setCursor("audit", 0, "2026-10-08T11:00:00.000Z");
    journal.setCursor("retired-module", 0, "2026-10-08T11:00:00.000Z");
    appendFollow(journal, "follow-old", "2026-10-08T11:50:00.000Z");
    appendFollow(journal, "follow-recent", "2026-10-08T11:59:30.000Z");
    const expired: Array<[string, number]> = [];
    const alerts = recordingConsumer("alerts");
    const audit = { ...recordingConsumer("audit"), expiresAfterReplayAge: false };
    const timers = recordingConsumer("timers");
    const bus = createBus(database, [alerts, audit, timers], {
      getReplayAgeMs: () => 120_000,
      onExpired: (consumerId, count) => { expired.push([consumerId, count]); }
    });

    await bus.start();
    expect(alerts.events).toEqual([]);
    await bus.resume();

    expect(expired).toEqual([["alerts", 1]]);
    expect(alerts.events.map(eventIdOf)).toEqual(["follow-recent"]);
    expect(audit.events.map(eventIdOf)).toEqual(["follow-old", "follow-recent"]);
    // A consumer registered for the first time starts at the head.
    expect(timers.events).toEqual([]);
    expect(journal.getCursor("alerts")).toBe(2);
    expect(journal.getCursor("timers")).toBe(2);
    expect(journal.getCursor("retired-module")).toBeNull();
    expect(storedOutcomes(database)).toEqual([
      [1, "alerts", "expired"], [1, "audit", "admitted"], [2, "alerts", "admitted"], [2, "audit", "admitted"]
    ]);
  });

  it("never expires live events, however old their receipt time", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const alerts = recordingConsumer("alerts");
    const bus = createBus(database, [alerts], { getReplayAgeMs: () => 0, now: () => new Date("2026-10-08T12:00:00.000Z") });
    await bus.start();

    await bus.publish({
      kind: "canonical", event: follow("follow-late"), eventId: "follow-late", sourceKind: "twitch", sourceRegistrationId: null,
      receivedAt: "2026-10-08T11:00:00.000Z", correlationKey: null, effectTriggers: []
    });

    expect(alerts.events.map(eventIdOf)).toEqual(["follow-late"]);
  });

  it("replays nothing when the replay age is zero", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const journal = new SqliteEventBusJournalRepository(database.connection);
    journal.setCursor("alerts", 0, "2026-10-08T11:00:00.000Z");
    appendFollow(journal, "follow-1", "2026-10-08T11:59:59.000Z");
    const alerts = recordingConsumer("alerts");
    const bus = createBus(database, [alerts], { getReplayAgeMs: () => 0 });

    await bus.resume();

    expect(alerts.events).toEqual([]);
    expect(storedOutcomes(database)).toEqual([[1, "alerts", "expired"]]);
  });

  it("expires every pending event on request, for example after a configuration restore", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const journal = new SqliteEventBusJournalRepository(database.connection);
    journal.setCursor("alerts", 0, "2026-10-08T11:00:00.000Z");
    appendFollow(journal, "follow-1", "2026-10-08T11:59:59.000Z");
    appendFollow(journal, "follow-2", "2026-10-08T11:59:59.000Z");
    const expired: Array<[string, number]> = [];
    const alerts = recordingConsumer("alerts");
    const bus = createBus(database, [alerts], { onExpired: (consumerId, count) => { expired.push([consumerId, count]); } });

    await bus.expirePending();
    await bus.resume();

    expect(alerts.events).toEqual([]);
    expect(expired).toEqual([["alerts", 2]]);
    expect(journal.getCursor("alerts")).toBe(2);
  });

  it("records intake outcomes and per-consumer results for Diagnostics", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const journal = new SqliteEventBusJournalRepository(database.connection);
    const failing: EventBusConsumer = { id: "effects", maxAttempts: 1, async handle() { throw new Error("boom"); } };
    const timers: EventBusConsumer = { id: "timers", async handle() { return "no-match"; } };
    const bus = createBus(database, [recordingConsumer("alerts"), failing, timers]);

    await bus.handleEvent(follow("follow-1"), []);
    await bus.handleEvent(follow("follow-1"), []);
    bus.recordRejected("streamerbot", "ref-rejected");
    bus.recordDuplicate({ sourceKind: "streamerbot", kind: "external", eventType: "OBS · SceneChanged" });

    expect(journal.recentActivity(10)).toEqual([
      { id: expect.any(Number), receivedAt: "2026-10-08T12:00:00.000Z", sourceKind: "streamerbot", kind: "external", eventType: "OBS · SceneChanged", outcome: "duplicate", sequence: null, referenceId: null, consumers: [] },
      { id: expect.any(Number), receivedAt: "2026-10-08T12:00:00.000Z", sourceKind: "streamerbot", kind: null, eventType: null, outcome: "rejected", sequence: null, referenceId: "ref-rejected", consumers: [] },
      { id: expect.any(Number), receivedAt: "2026-10-08T12:00:00.000Z", sourceKind: "twitch", kind: "canonical", eventType: "follow", outcome: "duplicate", sequence: null, referenceId: null, consumers: [] },
      {
        id: expect.any(Number), receivedAt: "2026-10-08T12:00:00.000Z", sourceKind: "twitch", kind: "canonical", eventType: "follow", outcome: "accepted", sequence: 1, referenceId: null,
        consumers: [
          { consumerId: "alerts", outcome: "admitted", referenceId: null },
          { consumerId: "effects", outcome: "failed", referenceId: "ref-1" },
          { consumerId: "timers", outcome: "no-match", referenceId: null }
        ]
      }
    ]);
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

describe("EventBus cross-source correlation", () => {
  it("merges the same follow from a second source into the first event", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const clock = testClock("2026-10-08T12:00:00.000Z");
    const alerts = recordingConsumer("alerts");
    const bus = createBus(database, [alerts], { now: clock.now });

    await expect(bus.handleEvent(follow("eventsub-1"), [])).resolves.toEqual({ status: "accepted" });
    clock.advance(3_000);
    await expect(bus.handleEvent(follow("streamerbot:twitch:Follow:1", "streamerbot"), [])).resolves.toEqual({ status: "merged" });

    expect(alerts.events.map(eventIdOf)).toEqual(["eventsub-1"]);
    expect(alerts.events[0]).toMatchObject({ correlationKey: "twitch:follow:viewer-1" });
    expect(storedEventIds(database)).toEqual(["eventsub-1"]);
    expect(storedMerges(database)).toEqual([
      { sequence: 1, source_kind: "streamerbot", merged_event_id: "streamerbot:twitch:Follow:1", merged_at: "2026-10-08T12:00:03.000Z" }
    ]);
  });

  it("keeps the first arrival when Streamer.bot is faster than direct Twitch", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const alerts = recordingConsumer("alerts");
    const bus = createBus(database, [alerts]);

    await bus.handleEvent(follow("streamerbot:twitch:Follow:1", "streamerbot"), []);
    await expect(bus.handleEvent(follow("eventsub-1"), [])).resolves.toEqual({ status: "merged" });

    expect(alerts.events).toEqual([expect.objectContaining({ eventId: "streamerbot:twitch:Follow:1", sourceKind: "streamerbot" })]);
  });

  it.each([
    ["both copies of each cheer together", ["eventsub-1", "streamerbot-1", "eventsub-2", "streamerbot-2"]],
    ["both direct copies first", ["eventsub-1", "eventsub-2", "streamerbot-1", "streamerbot-2"]]
  ])("publishes two identical cheers once each with %s", async (_label, order) => {
    using database = createInMemoryStreamJamsDatabase();
    const alerts = recordingConsumer("alerts");
    const bus = createBus(database, [alerts]);

    const outcomes = [];
    for (const id of order) outcomes.push((await bus.handleEvent(cheer(id, id.startsWith("eventsub") ? "twitch" : "streamerbot"), [])).status);

    expect(outcomes.filter((status) => status === "accepted")).toHaveLength(2);
    expect(outcomes.filter((status) => status === "merged")).toHaveLength(2);
    expect(alerts.events).toHaveLength(2);
    expect(storedMerges(database).map((merge) => merge.sequence)).toEqual([1, 2]);
  });

  it.each(["twitch", "streamerbot"] as const)("never merges distinct %s events with equal keys from the same source", async (source) => {
    using database = createInMemoryStreamJamsDatabase();
    const alerts = recordingConsumer("alerts");
    const bus = createBus(database, [alerts]);

    await bus.handleEvent(cheer("cheer-1", source), []);
    await bus.handleEvent(cheer("cheer-2", source), []);

    expect(alerts.events.map(eventIdOf)).toEqual(["cheer-1", "cheer-2"]);
    expect(storedMerges(database)).toEqual([]);
  });

  it("publishes a copy that arrives after the correlation window as a separate event", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const clock = testClock("2026-10-08T12:00:00.000Z");
    const alerts = recordingConsumer("alerts");
    const bus = createBus(database, [alerts], { now: clock.now });

    await bus.handleEvent(follow("eventsub-1"), []);
    clock.advance(30_000);
    await expect(bus.handleEvent(follow("streamerbot-1", "streamerbot"), [])).resolves.toEqual({ status: "merged" });
    await bus.handleEvent(follow("eventsub-2"), []);
    clock.advance(30_001);
    await expect(bus.handleEvent(follow("streamerbot-2", "streamerbot"), [])).resolves.toEqual({ status: "accepted" });

    expect(alerts.events.map(eventIdOf)).toEqual(["eventsub-1", "eventsub-2", "streamerbot-2"]);
  });

  it("treats a redelivered merged copy as a duplicate after restart", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const clock = testClock("2026-10-08T12:00:00.000Z");
    const alerts = recordingConsumer("alerts");
    const first = createBus(database, [alerts], { now: clock.now });
    await first.handleEvent(follow("eventsub-1"), []);
    await first.handleEvent(follow("streamerbot-1", "streamerbot"), []);

    clock.advance(60_000);
    const afterRestart = createBus(database, [alerts], { now: clock.now });
    await expect(afterRestart.handleEvent(follow("streamerbot-1", "streamerbot"), [])).resolves.toEqual({ status: "duplicate" });
    await expect(afterRestart.handleEvent(follow("eventsub-1"), [])).resolves.toEqual({ status: "duplicate" });

    expect(alerts.events.map(eventIdOf)).toEqual(["eventsub-1"]);
    expect(storedMerges(database)).toHaveLength(1);
  });

  it("never merges external events", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const effects = recordingConsumer("screen-effects");
    const bus = createBus(database, [effects]);

    await bus.handleEvent(follow("eventsub-1"), []);
    await bus.handleTriggers([customTrigger("streamerbot:custom-1")]);

    expect(effects.events.map((event) => [event.kind, event.correlationKey])).toEqual([
      ["canonical", "twitch:follow:viewer-1"],
      ["external", null]
    ]);
  });

  it("lets ingestion report a merged copy as a duplicate", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const ingestion = new EventIngestionService({ sink: createBus(database, [recordingConsumer("alerts")]) });

    await ingestion.ingestNormalizedEvent(follow("eventsub-1"));
    await expect(ingestion.ingestNormalizedEvent(follow("streamerbot-1", "streamerbot")))
      .resolves.toEqual({ status: "duplicate", messageId: "streamerbot-1" });
    expect(ingestion.getStatus()).toMatchObject({ acceptedCount: 1, duplicateCount: 1, message: "Event already received from another source; merged" });
  });

  it("removes merge records with the journal rows they belong to", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const bus = createBus(database, [recordingConsumer("alerts")], { retentionRows: 0 });
    await bus.handleEvent(follow("eventsub-1"), []);
    await bus.handleEvent(follow("streamerbot-1", "streamerbot"), []);

    expect(bus.prune()).toBe(1);
    expect(storedMerges(database)).toEqual([]);
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

function appendFollow(journal: SqliteEventBusJournalRepository, id: string, receivedAt: string): void {
  journal.append({
    kind: "canonical", event: follow(id), eventId: id, sourceKind: "twitch", sourceRegistrationId: null,
    receivedAt, correlationKey: null, effectTriggers: []
  }, `bus-${id}`, { duplicateSinceMs: 0, correlationSinceMs: 0 });
}

function storedOutcomes(database: StreamJamsDatabase): Array<[number, string, string]> {
  return database.connection.prepare("SELECT sequence, consumer_id, outcome FROM event_bus_consumer_outcomes ORDER BY sequence, consumer_id").all()
    .map((row) => [Number(row.sequence), String(row.consumer_id), String(row.outcome)]);
}

function storedEventIds(database: StreamJamsDatabase): string[] {
  return database.connection.prepare("SELECT event_id FROM event_bus_journal ORDER BY sequence").all().map((row) => String(row.event_id));
}

function storedMerges(database: StreamJamsDatabase): Array<Record<string, unknown>> {
  return database.connection.prepare("SELECT sequence, source_kind, merged_event_id, merged_at FROM event_bus_correlation_merges ORDER BY sequence, source_kind")
    .all().map((row) => ({ ...row }));
}

function testClock(start: string): { readonly now: () => Date; advance(ms: number): void } {
  let current = Date.parse(start);
  return { now: () => new Date(current), advance: (ms) => { current += ms; } };
}

function cheer(id: string, ingestProvider: "twitch" | "streamerbot"): NormalizedStreamEvent {
  return { ...follow(id, ingestProvider), type: "cheer", amount: 100, message: "Cheer100 nice" };
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

function customTrigger(eventId: string): Extract<EffectTrigger, { readonly kind: "streamerbot-event" }> {
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
