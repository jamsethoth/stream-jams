import type { DatabaseSync } from "node:sqlite";
import type { AlertMatchLogRecord, EventLogRecord, NormalizedStreamEvent, PlaybackLogRecord } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteDiagnosticsLogRepository } from "./sqlite-log-repository.js";

const followEvent: NormalizedStreamEvent = {
  id: "event-follow-1",
  type: "follow",
  providerId: "twitch",
  sourcePlatform: "twitch",
  ingestProvider: "twitch",
  occurredAt: "2026-05-30T10:00:00.000Z",
  actor: {
    id: "user-1",
    displayName: "Jam"
  },
  amount: null,
  message: null,
  metadata: {
    broadcasterUserId: "channel-1"
  }
};

describe("SqliteDiagnosticsLogRepository", () => {
  it("returns empty arrays when log tables have no records", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteDiagnosticsLogRepository(database.connection);

    await expect(repository.listEventLogs()).resolves.toEqual([]);
    await expect(repository.listAlertMatchLogs()).resolves.toEqual([]);
    await expect(repository.listPlaybackLogs()).resolves.toEqual([]);
  });

  it("appends typed event, alert match, and playback records", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteDiagnosticsLogRepository(database.connection);
    const eventLog: EventLogRecord = {
      id: "event-log-1",
      event: followEvent,
      receivedAt: "2026-05-30T10:00:01.000Z",
      status: "processed",
      correlationId: "correlation-1",
      processingId: "processing-1",
      errorMessage: null
    };
    const matchLog: AlertMatchLogRecord = {
      id: "match-log-1",
      sourceEventId: followEvent.id,
      ruleId: "rule-1",
      variantId: "variant-1",
      matchedAt: "2026-05-30T10:00:02.000Z",
      correlationId: "correlation-1",
      processingId: "processing-1"
    };
    const playbackLog: PlaybackLogRecord = {
      id: "playback-log-1",
      queueItemId: "queue-item-1",
      sourceEventId: followEvent.id,
      alertIds: ["resolved-alert-1", "resolved-alert-2"],
      status: "completed",
      occurredAt: "2026-05-30T10:00:03.000Z",
      correlationId: "correlation-1",
      processingId: "processing-1",
      message: "completed"
    };

    await expect(repository.appendEventLog(eventLog)).resolves.toEqual(eventLog);
    await expect(repository.appendAlertMatchLog(matchLog)).resolves.toEqual(matchLog);
    await expect(repository.appendPlaybackLog(playbackLog)).resolves.toEqual(playbackLog);

    await expect(repository.listEventLogs()).resolves.toEqual([eventLog]);
    await expect(repository.listAlertMatchLogs()).resolves.toEqual([matchLog]);
    await expect(repository.listPlaybackLogs()).resolves.toEqual([playbackLog]);
  });

  it("reads legacy Twitch event logs without stored source identity", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteDiagnosticsLogRepository(database.connection);
    const legacyEvent = toLegacyEvent(followEvent);

    insertRawEventLog(database.connection, "legacy-event-log", legacyEvent);

    await expect(repository.listEventLogs()).resolves.toEqual([
      {
        id: "legacy-event-log",
        event: followEvent,
        receivedAt: "2026-05-30T10:00:01.000Z",
        status: "received",
        correlationId: "correlation-legacy-event-log",
        processingId: null,
        errorMessage: null
      }
    ]);
  });

  it("rejects legacy source identity fallback for non-Twitch event logs", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteDiagnosticsLogRepository(database.connection);
    const legacyEvent = toLegacyEvent(followEvent);

    insertRawEventLog(database.connection, "streamerbot-event-log", {
      ...legacyEvent,
      providerId: "streamerbot"
    });

    await expect(repository.listEventLogs()).rejects.toThrow();
  });

  it("rejects legacy source identity fallback for otherwise invalid Twitch event logs", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteDiagnosticsLogRepository(database.connection);
    const legacyEvent = toLegacyEvent(followEvent);

    insertRawEventLog(database.connection, "invalid-twitch-event-log", {
      ...legacyEvent,
      actor: {
        id: null,
        displayName: ""
      }
    });

    await expect(repository.listEventLogs()).rejects.toThrow();
  });

  it("lists newest records first with an optional limit", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteDiagnosticsLogRepository(database.connection);
    const olderEvent = createEventLog("event-log-1", "2026-05-30T10:00:01.000Z");
    const newerEvent = createEventLog("event-log-2", "2026-05-30T10:05:01.000Z");

    await repository.appendEventLog(olderEvent);
    await repository.appendEventLog(newerEvent);

    await expect(repository.listEventLogs()).resolves.toEqual([newerEvent, olderEvent]);
    await expect(repository.listEventLogs({ limit: 1 })).resolves.toEqual([newerEvent]);
  });
});

function toLegacyEvent(event: NormalizedStreamEvent): Record<string, unknown> {
  const legacyEvent: Record<string, unknown> = { ...event };
  delete legacyEvent.sourcePlatform;
  delete legacyEvent.ingestProvider;
  return legacyEvent;
}

function insertRawEventLog(connection: DatabaseSync, id: string, event: Record<string, unknown>): void {
  connection
    .prepare(
      "INSERT INTO event_logs (id, event_id, event_type, event_json, received_at, status, correlation_id, processing_id, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      id,
      String(event.id),
      String(event.type),
      JSON.stringify(event),
      "2026-05-30T10:00:01.000Z",
      "received",
      `correlation-${id}`,
      null,
      null
    );
}

function createEventLog(id: string, receivedAt: string): EventLogRecord {
  return {
    id,
    event: {
      ...followEvent,
      id: `${id}-event`
    },
    receivedAt,
    status: "received",
    correlationId: `correlation-${id}`,
    processingId: null,
    errorMessage: null
  };
}
