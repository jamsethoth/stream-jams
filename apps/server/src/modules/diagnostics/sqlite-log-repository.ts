import type { DatabaseSync } from "node:sqlite";
import {
  normalizedStreamEventSchema,
  type AlertMatchLogRecord,
  type DiagnosticsLogListOptions,
  type DiagnosticsLogRepository,
  type EventLogRecord,
  type EventLogStatus,
  type NormalizedStreamEvent,
  type PlaybackLogRecord,
  type PlaybackLogStatus
} from "@stream-jams/core";

interface EventLogRow {
  readonly id: unknown;
  readonly event_json: unknown;
  readonly received_at: unknown;
  readonly status: unknown;
  readonly correlation_id: unknown;
  readonly processing_id: unknown;
  readonly error_message: unknown;
}

interface AlertMatchLogRow {
  readonly id: unknown;
  readonly source_event_id: unknown;
  readonly rule_id: unknown;
  readonly variant_id: unknown;
  readonly matched_at: unknown;
  readonly correlation_id: unknown;
  readonly processing_id: unknown;
}

interface PlaybackLogRow {
  readonly id: unknown;
  readonly queue_item_id: unknown;
  readonly source_event_id: unknown;
  readonly alert_ids_json: unknown;
  readonly status: unknown;
  readonly occurred_at: unknown;
  readonly correlation_id: unknown;
  readonly processing_id: unknown;
  readonly message: unknown;
}

export class SqliteDiagnosticsLogRepository implements DiagnosticsLogRepository {
  readonly #connection: DatabaseSync;

  constructor(connection: DatabaseSync) {
    this.#connection = connection;
  }

  async appendEventLog(record: EventLogRecord): Promise<EventLogRecord> {
    this.#connection
      .prepare(
        `INSERT INTO event_logs (
          id,
          event_id,
          event_type,
          event_json,
          received_at,
          status,
          correlation_id,
          processing_id,
          error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.event.id,
        record.event.type,
        JSON.stringify(record.event),
        record.receivedAt,
        record.status,
        record.correlationId,
        record.processingId,
        record.errorMessage
      );
    return record;
  }

  async listEventLogs(options: DiagnosticsLogListOptions = {}): Promise<readonly EventLogRecord[]> {
    return selectRows(
      this.#connection,
      `SELECT id, event_json, received_at, status, correlation_id, processing_id, error_message
       FROM event_logs
       ORDER BY received_at DESC, id DESC`,
      options
    ).map((row) => mapEventLogRow(row as unknown as EventLogRow));
  }

  async appendAlertMatchLog(record: AlertMatchLogRecord): Promise<AlertMatchLogRecord> {
    this.#connection
      .prepare(
        `INSERT INTO alert_match_logs (
          id,
          source_event_id,
          rule_id,
          variant_id,
          matched_at,
          correlation_id,
          processing_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.sourceEventId,
        record.ruleId,
        record.variantId,
        record.matchedAt,
        record.correlationId,
        record.processingId
      );
    return record;
  }

  async listAlertMatchLogs(options: DiagnosticsLogListOptions = {}): Promise<readonly AlertMatchLogRecord[]> {
    return selectRows(
      this.#connection,
      `SELECT id, source_event_id, rule_id, variant_id, matched_at, correlation_id, processing_id
       FROM alert_match_logs
       ORDER BY matched_at DESC, id DESC`,
      options
    ).map((row) => mapAlertMatchLogRow(row as unknown as AlertMatchLogRow));
  }

  async appendPlaybackLog(record: PlaybackLogRecord): Promise<PlaybackLogRecord> {
    this.#connection
      .prepare(
        `INSERT INTO playback_logs (
          id,
          queue_item_id,
          source_event_id,
          alert_ids_json,
          status,
          occurred_at,
          correlation_id,
          processing_id,
          message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.queueItemId,
        record.sourceEventId,
        JSON.stringify(record.alertIds),
        record.status,
        record.occurredAt,
        record.correlationId,
        record.processingId,
        record.message
      );
    return record;
  }

  async listPlaybackLogs(options: DiagnosticsLogListOptions = {}): Promise<readonly PlaybackLogRecord[]> {
    return selectRows(
      this.#connection,
      `SELECT id, queue_item_id, source_event_id, alert_ids_json, status, occurred_at, correlation_id, processing_id, message
       FROM playback_logs
       ORDER BY occurred_at DESC, id DESC`,
      options
    ).map((row) => mapPlaybackLogRow(row as unknown as PlaybackLogRow));
  }
}

function selectRows(
  connection: DatabaseSync,
  sqlWithoutLimit: string,
  options: DiagnosticsLogListOptions
): Record<string, unknown>[] {
  if (options.limit === undefined) {
    return connection.prepare(sqlWithoutLimit).all();
  }

  const limit = normalizeLimit(options.limit);
  return connection.prepare(`${sqlWithoutLimit} LIMIT ?`).all(limit);
}

function mapEventLogRow(row: EventLogRow): EventLogRecord {
  return {
    id: String(row.id),
    event: parseEvent(row.event_json),
    receivedAt: String(row.received_at),
    status: row.status as EventLogStatus,
    correlationId: String(row.correlation_id),
    processingId: row.processing_id === null ? null : String(row.processing_id),
    errorMessage: row.error_message === null ? null : String(row.error_message)
  };
}

function mapAlertMatchLogRow(row: AlertMatchLogRow): AlertMatchLogRecord {
  return {
    id: String(row.id),
    sourceEventId: String(row.source_event_id),
    ruleId: String(row.rule_id),
    variantId: String(row.variant_id),
    matchedAt: String(row.matched_at),
    correlationId: String(row.correlation_id),
    processingId: row.processing_id === null ? null : String(row.processing_id)
  };
}

function mapPlaybackLogRow(row: PlaybackLogRow): PlaybackLogRecord {
  return {
    id: String(row.id),
    queueItemId: String(row.queue_item_id),
    sourceEventId: String(row.source_event_id),
    alertIds: JSON.parse(String(row.alert_ids_json)) as readonly string[],
    status: row.status as PlaybackLogStatus,
    occurredAt: String(row.occurred_at),
    correlationId: String(row.correlation_id),
    processingId: row.processing_id === null ? null : String(row.processing_id),
    message: row.message === null ? null : String(row.message)
  };
}

function parseEvent(value: unknown): NormalizedStreamEvent {
  return normalizedStreamEventSchema.parse(JSON.parse(String(value)));
}

function normalizeLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Diagnostics log list limit must be a positive integer");
  }

  return limit;
}
