import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { busEventSchema } from "@stream-jams/core/event-bus";
import { runInTransaction } from "../database.js";
import { SqliteEventBusJournalRepository } from "../../events/sqlite-event-bus-journal-repository.js";
import { eventBusJournalMigration } from "./034-event-bus-journal.js";
import { eventBusCorrelationMigration } from "./035-event-bus-correlation.js";
import { eventBusOutcomesMigration } from "./039-event-bus-outcomes.js";
import { manualEventBusMigration } from "./042-manual-event-bus.js";
import { createPreMigrationDatabase } from "../../../test-support/pre-migration-database.js";

const time = "2026-10-10T12:00:00.000Z";
const follow = { id: "old-canonical", occurredAt: time, type: "follow", providerId: "twitch", sourcePlatform: "twitch", ingestProvider: "twitch", actor: { id: "viewer", displayName: "Viewer" }, message: null, amount: null, metadata: {} } as const;

describe("042-manual-event-bus", () => {
  it("preserves populated old canonical/external journal rows, cursor continuity and all FK children", () => {
    using connection = new DatabaseSync(":memory:");
    connection.exec("PRAGMA foreign_keys = ON");
    for (const migration of [eventBusJournalMigration, eventBusCorrelationMigration, eventBusOutcomesMigration]) connection.exec(migration.sql);
    const journal = new SqliteEventBusJournalRepository(connection);
    const insert = connection.prepare("INSERT INTO event_bus_journal (sequence, bus_id, event_id, source_kind, source_registration_id, kind, received_at, received_at_ms, payload_json, correlation_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    insert.run(10, "old-bus-canonical", "old-canonical", "twitch", "old-twitch-registration", "canonical", time, Date.parse(time), JSON.stringify({ event: follow, effectTriggers: [] }), "twitch:follow:viewer");
    insert.run(20, "old-bus-external", "old-external", "streamerbot", "old-sb-registration", "external", time, Date.parse(time), JSON.stringify({ payload: { retained: true }, effectTriggers: [] }), null);
    insert.run(30, "pruned-bus", "pruned-event", "streamerbot", null, "external", time, Date.parse(time), JSON.stringify({ effectTriggers: [] }), null);
    connection.exec("DELETE FROM event_bus_journal WHERE sequence = 30");
    journal.setCursor("alerts", 10, time);
    journal.setCursor("videos", 17, time);
    journal.recordFailure({ sequence: 20, consumerId: "alerts", attempts: 3, errorMessage: "Old bounded failure", referenceId: "old-ref", failedAt: time });
    journal.recordOutcome(10, "alerts", "admitted", null, time);
    connection.prepare("INSERT INTO event_bus_correlation_merges VALUES (?, ?, ?, ?, ?, ?)").run(10, "streamerbot", "merged-old", "sb-registration", time, Date.parse(time));
    connection.prepare("INSERT INTO event_bus_intake_log (id, received_at, received_at_ms, source_kind, kind, event_type, outcome, sequence, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(15, time, Date.parse(time), "twitch", "canonical", "follow", "accepted", 10, null);
    connection.prepare("INSERT INTO event_bus_intake_log (id, received_at, received_at_ms, source_kind, kind, event_type, outcome, sequence, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(25, time, Date.parse(time), "twitch", null, null, "rejected", null, "old-rejected");
    connection.exec("DELETE FROM event_bus_intake_log WHERE id = 25");
    const before = new Map(["event_bus_journal", "event_bus_consumer_cursors", "event_bus_delivery_failures", "event_bus_correlation_merges", "event_bus_consumer_outcomes"].map(table => [table, connection.prepare(`SELECT * FROM ${table}`).all()]));

    runInTransaction(connection, () => connection.exec(manualEventBusMigration.sql));

    for (const [table, rows] of before) expect(connection.prepare(`SELECT * FROM ${table}`).all()).toEqual(rows);
    expect(connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(journal.readAfter(0, 10).map(row => busEventSchema.parse(row.event).kind)).toEqual(["canonical", "external"]);
    expect(journal.readAfter(journal.getCursor("videos")!, 10).map(row => row.sequence)).toEqual([20]);
    const result = journal.append({ kind: "manual", sourceKind: "manual", sourceRegistrationId: null, correlationKey: null, eventId: "manual-new", receivedAt: time, effectTriggers: [], submission: { channel: "management", mayAutoplay: true }, action: { kind: "video-request", request: { link: "https://youtu.be/dQw4w9WgXcQ" } } }, "manual-bus", { duplicateSinceMs: 0, correlationSinceMs: 0 });
    expect(result).toMatchObject({ status: "appended", event: { sequence: 31 } });
    journal.recordIntake({ receivedAt: time, sourceKind: "manual", kind: "manual", eventType: "video-request", outcome: "accepted", sequence: 31, referenceId: null, submissionChannel: "management" });
    expect(journal.recentActivity(1)[0]).toMatchObject({ id: 26, sourceKind: "manual", submissionChannel: "management" });
    connection.exec("DELETE FROM event_bus_journal WHERE sequence IN (10, 20)");
    for (const table of ["event_bus_delivery_failures", "event_bus_correlation_merges", "event_bus_consumer_outcomes"]) expect(connection.prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
    expect(connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("upgrades an old backup schema through the production migration runner exactly once", () => {
    using fixture = createPreMigrationDatabase("042-manual-event-bus");
    let journal = new SqliteEventBusJournalRepository(fixture.connection);
    journal.append({ kind: "canonical", event: follow, eventId: follow.id, receivedAt: time, sourceKind: "twitch", sourceRegistrationId: "old-registration", correlationKey: "twitch:follow:viewer", effectTriggers: [] }, "old-backup-bus", { duplicateSinceMs: 0, correlationSinceMs: 0 });
    journal.setCursor("alerts", 0, time);
    const database = fixture.upgrade();
    const connection = database.connection;
    journal = new SqliteEventBusJournalRepository(connection);
    database.runMigrations();
    database.runMigrations();
    expect(journal.readAfter(journal.getCursor("alerts")!, 10)[0]?.event).toMatchObject({ busId: "old-backup-bus", sequence: 1, sourceRegistrationId: "old-registration", kind: "canonical" });
    expect(connection.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id = '042-manual-event-bus'").get()?.count).toBe(1);
    expect(connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("retains a fully pruned journal's sequence floor", () => {
    using connection = new DatabaseSync(":memory:");
    connection.exec("PRAGMA foreign_keys = ON");
    for (const migration of [eventBusJournalMigration, eventBusCorrelationMigration, eventBusOutcomesMigration]) connection.exec(migration.sql);
    connection.prepare("INSERT INTO event_bus_journal (sequence, bus_id, event_id, source_kind, kind, received_at, received_at_ms, payload_json) VALUES (50, 'old', 'old', 'streamerbot', 'external', ?, ?, '{\"effectTriggers\":[]}')").run(time, Date.parse(time));
    connection.exec("DELETE FROM event_bus_journal");
    runInTransaction(connection, () => connection.exec(manualEventBusMigration.sql));
    expect(new SqliteEventBusJournalRepository(connection).headSequence()).toBe(50);
    expect(connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
