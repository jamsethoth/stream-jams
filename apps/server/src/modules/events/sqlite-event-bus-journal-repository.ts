import type { DatabaseSync } from "node:sqlite";
import type { BusEvent, BusEventInput, EventBusConsumerOutcome, EventBusIntakeOutcome, IngestProviderId } from "@stream-jams/core";
import { busEventSchema } from "@stream-jams/core/event-bus";
import { runInTransaction } from "../db/database.js";

export type EventBusAppendResult =
  | { readonly status: "appended"; readonly event: BusEvent }
  | { readonly status: "duplicate" }
  /** Another source already journaled this occurrence; `sequence` is the row that absorbed it. */
  | { readonly status: "merged"; readonly sequence: number };

export interface EventBusAppendWindows {
  /** Same-source redeliveries received at or after this time are duplicates. */
  readonly duplicateSinceMs: number;
  /** Rows from another source received at or after this time can absorb a matching correlation key. */
  readonly correlationSinceMs: number;
}

export interface EventBusJournalEntry {
  readonly sequence: number;
  readonly receivedAtMs: number;
  /** Null when the stored row no longer passes validation. */
  readonly event: BusEvent | null;
}

export interface EventBusDeliveryFailure {
  readonly sequence: number;
  readonly consumerId: string;
  readonly attempts: number;
  readonly errorMessage: string;
  readonly referenceId: string;
  readonly failedAt: string;
}

export interface EventBusIntakeRecord {
  readonly receivedAt: string;
  readonly sourceKind: IngestProviderId;
  /** Null for input rejected before it could be read. */
  readonly kind: BusEvent["kind"] | null;
  readonly eventType: string | null;
  readonly outcome: EventBusIntakeOutcome;
  /** The journal row for accepted events, or the row a merged copy joined. */
  readonly sequence: number | null;
  readonly referenceId: string | null;
}

export interface EventBusActivityConsumer {
  readonly consumerId: string;
  readonly outcome: EventBusConsumerOutcome | "pending";
  readonly referenceId: string | null;
}

export interface EventBusActivityRecord extends EventBusIntakeRecord {
  readonly id: number;
  /** Per-consumer results of the journal row; empty for duplicates and rejections. */
  readonly consumers: readonly EventBusActivityConsumer[];
}

export interface EventBusJournalRepository {
  /**
   * Appends unless the same source already delivered the same event ID (journaled or merged) within the
   * duplicate window, or an earlier row from another source with the same correlation key, not yet
   * paired with this source, falls within the correlation window.
   */
  append(input: BusEventInput, busId: string, windows: EventBusAppendWindows): EventBusAppendResult;
  headSequence(): number;
  readAfter(sequence: number, limit: number): readonly EventBusJournalEntry[];
  getCursor(consumerId: string): number | null;
  setCursor(consumerId: string, sequence: number, updatedAt: string): void;
  removeCursorsExcept(consumerIds: readonly string[]): void;
  recordFailure(failure: EventBusDeliveryFailure): void;
  recordOutcome(sequence: number, consumerId: string, outcome: EventBusConsumerOutcome, referenceId: string | null, recordedAt: string): void;
  /** Records rows after the consumer's cursor, up to `throughSequence`, as expired and moves the cursor there. */
  expireThrough(consumerId: string, throughSequence: number, recordedAt: string): number;
  recordIntake(record: EventBusIntakeRecord): void;
  /** Newest intake records first, with consumer outcomes for the journal rows they name. */
  recentActivity(limit: number): readonly EventBusActivityRecord[];
  /** Removes rows every consumer has passed that are older than the cutoff or beyond the newest `keepNewest`. */
  prune(olderThanMs: number, keepNewest: number): number;
}

const maxStoredErrorLength = 500;
const maxStoredTypeLength = 250;

export class SqliteEventBusJournalRepository implements EventBusJournalRepository {
  constructor(private readonly connection: DatabaseSync) {}

  append(input: BusEventInput, busId: string, windows: EventBusAppendWindows): EventBusAppendResult {
    return runInTransaction(this.connection, () => {
      const duplicate = this.connection.prepare(`SELECT 1 FROM event_bus_journal
          WHERE source_kind = ? AND event_id = ? AND received_at_ms >= ?
        UNION ALL SELECT 1 FROM event_bus_correlation_merges
          WHERE source_kind = ? AND merged_event_id = ? AND merged_at_ms >= ?
        LIMIT 1`)
        .get(input.sourceKind, input.eventId, windows.duplicateSinceMs, input.sourceKind, input.eventId, windows.duplicateSinceMs);
      if (duplicate !== undefined) return { status: "duplicate" } as const;

      const receivedAtMs = Date.parse(input.receivedAt);
      if (input.correlationKey !== null) {
        const match = this.connection.prepare(`SELECT journal.sequence FROM event_bus_journal AS journal
          WHERE journal.correlation_key = ? AND journal.source_kind <> ? AND journal.received_at_ms >= ?
            AND NOT EXISTS (SELECT 1 FROM event_bus_correlation_merges AS merges
              WHERE merges.sequence = journal.sequence AND merges.source_kind = ?)
          ORDER BY journal.sequence LIMIT 1`)
          .get(input.correlationKey, input.sourceKind, windows.correlationSinceMs, input.sourceKind);
        if (match !== undefined) {
          const sequence = Number(match.sequence);
          this.connection.prepare(`INSERT INTO event_bus_correlation_merges
            (sequence, source_kind, merged_event_id, merged_source_registration_id, merged_at, merged_at_ms) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(sequence, input.sourceKind, input.eventId, input.sourceRegistrationId, input.receivedAt, receivedAtMs);
          return { status: "merged", sequence } as const;
        }
      }

      const payload = input.kind === "canonical"
        ? { event: input.event, effectTriggers: input.effectTriggers }
        : { effectTriggers: input.effectTriggers, ...(input.payload === undefined ? {} : { payload: input.payload }) };
      const result = this.connection.prepare(`INSERT INTO event_bus_journal
        (bus_id, event_id, source_kind, source_registration_id, kind, received_at, received_at_ms, correlation_key, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(busId, input.eventId, input.sourceKind, input.sourceRegistrationId, input.kind, input.receivedAt, receivedAtMs, input.correlationKey, JSON.stringify(payload));
      const event = busEventSchema.parse({ ...input, sequence: Number(result.lastInsertRowid), busId });
      return { status: "appended", event } as const;
    });
  }

  headSequence(): number {
    const row = this.connection.prepare("SELECT COALESCE(MAX(sequence), 0) AS head FROM event_bus_journal").get();
    const persisted = this.connection.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'event_bus_journal'").get();
    return Math.max(Number(row?.head ?? 0), Number(persisted?.seq ?? 0));
  }

  readAfter(sequence: number, limit: number): readonly EventBusJournalEntry[] {
    return this.connection.prepare(`SELECT * FROM event_bus_journal WHERE sequence > ? ORDER BY sequence LIMIT ?`)
      .all(sequence, limit)
      .map(readEntry);
  }

  getCursor(consumerId: string): number | null {
    const row = this.connection.prepare("SELECT last_sequence FROM event_bus_consumer_cursors WHERE consumer_id = ?").get(consumerId);
    return row === undefined ? null : Number(row.last_sequence);
  }

  setCursor(consumerId: string, sequence: number, updatedAt: string): void {
    this.connection.prepare(`INSERT INTO event_bus_consumer_cursors (consumer_id, last_sequence, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(consumer_id) DO UPDATE SET last_sequence = excluded.last_sequence, updated_at = excluded.updated_at`)
      .run(consumerId, sequence, updatedAt);
  }

  removeCursorsExcept(consumerIds: readonly string[]): void {
    const placeholders = consumerIds.map(() => "?").join(", ");
    this.connection.prepare(consumerIds.length === 0
      ? "DELETE FROM event_bus_consumer_cursors"
      : `DELETE FROM event_bus_consumer_cursors WHERE consumer_id NOT IN (${placeholders})`).run(...consumerIds);
  }

  recordFailure(failure: EventBusDeliveryFailure): void {
    this.connection.prepare(`INSERT INTO event_bus_delivery_failures
      (sequence, consumer_id, attempts, error_message, reference_id, failed_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(sequence, consumer_id) DO UPDATE SET attempts = excluded.attempts, error_message = excluded.error_message,
        reference_id = excluded.reference_id, failed_at = excluded.failed_at`)
      .run(failure.sequence, failure.consumerId, failure.attempts, failure.errorMessage.slice(0, maxStoredErrorLength), failure.referenceId, failure.failedAt);
    this.recordOutcome(failure.sequence, failure.consumerId, "failed", failure.referenceId, failure.failedAt);
  }

  recordOutcome(sequence: number, consumerId: string, outcome: EventBusConsumerOutcome, referenceId: string | null, recordedAt: string): void {
    // A row removed by retention while it was being handled has nothing left to annotate.
    this.connection.prepare(`INSERT INTO event_bus_consumer_outcomes (sequence, consumer_id, outcome, reference_id, recorded_at)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM event_bus_journal WHERE sequence = ?)
      ON CONFLICT(sequence, consumer_id) DO UPDATE SET outcome = excluded.outcome, reference_id = excluded.reference_id,
        recorded_at = excluded.recorded_at`)
      .run(sequence, consumerId, outcome, referenceId, recordedAt, sequence);
  }

  expireThrough(consumerId: string, throughSequence: number, recordedAt: string): number {
    return runInTransaction(this.connection, () => {
      const cursor = this.getCursor(consumerId) ?? throughSequence;
      const expired = Number(this.connection.prepare(`INSERT INTO event_bus_consumer_outcomes (sequence, consumer_id, outcome, reference_id, recorded_at)
        SELECT sequence, ?, 'expired', NULL, ? FROM event_bus_journal WHERE sequence > ? AND sequence <= ?
        ON CONFLICT(sequence, consumer_id) DO UPDATE SET outcome = 'expired', reference_id = NULL, recorded_at = excluded.recorded_at`)
        .run(consumerId, recordedAt, cursor, throughSequence).changes);
      if (cursor < throughSequence) this.setCursor(consumerId, throughSequence, recordedAt);
      return expired;
    });
  }

  recordIntake(record: EventBusIntakeRecord): void {
    this.connection.prepare(`INSERT INTO event_bus_intake_log
      (received_at, received_at_ms, source_kind, kind, event_type, outcome, sequence, reference_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(record.receivedAt, Date.parse(record.receivedAt), record.sourceKind, record.kind, record.eventType?.slice(0, maxStoredTypeLength) ?? null,
        record.outcome, record.sequence, record.referenceId);
  }

  recentActivity(limit: number): readonly EventBusActivityRecord[] {
    const consumers = this.connection.prepare("SELECT consumer_id, last_sequence FROM event_bus_consumer_cursors ORDER BY consumer_id").all()
      .map((row) => ({ consumerId: String(row.consumer_id), cursor: Number(row.last_sequence) }));
    const outcomes = this.connection.prepare("SELECT consumer_id, outcome, reference_id FROM event_bus_consumer_outcomes WHERE sequence = ?");
    return this.connection.prepare("SELECT * FROM event_bus_intake_log ORDER BY id DESC LIMIT ?").all(limit).map((row) => {
      const sequence = row.sequence === null ? null : Number(row.sequence);
      const recorded = new Map(sequence === null ? [] : outcomes.all(sequence).map((outcome) => [String(outcome.consumer_id), {
        outcome: String(outcome.outcome) as EventBusConsumerOutcome,
        referenceId: outcome.reference_id === null ? null : String(outcome.reference_id)
      }]));
      return {
        id: Number(row.id),
        receivedAt: String(row.received_at),
        sourceKind: String(row.source_kind) as IngestProviderId,
        kind: row.kind === null ? null : String(row.kind) as BusEvent["kind"],
        eventType: row.event_type === null ? null : String(row.event_type),
        outcome: String(row.outcome) as EventBusIntakeOutcome,
        sequence,
        referenceId: row.reference_id === null ? null : String(row.reference_id),
        // Merged copies and duplicates were never delivered, so only accepted rows report consumers.
        consumers: sequence === null || row.outcome !== "accepted" ? [] : consumers.map(({ consumerId, cursor }) => {
          const result = recorded.get(consumerId);
          return result === undefined
            ? { consumerId, outcome: cursor >= sequence ? "admitted" as const : "pending" as const, referenceId: null }
            : { consumerId, ...result };
        })
      };
    });
  }

  prune(olderThanMs: number, keepNewest: number): number {
    return runInTransaction(this.connection, () => {
      const passedRow = this.connection.prepare("SELECT MIN(last_sequence) AS passed FROM event_bus_consumer_cursors").get();
      const passed = passedRow?.passed === null || passedRow?.passed === undefined ? this.headSequence() : Number(passedRow.passed);
      const newestKeptFloor = this.headSequence() - keepNewest;
      const intakeFloor = this.connection.prepare("SELECT COALESCE(MAX(id), 0) AS head FROM event_bus_intake_log").get();
      this.connection.prepare("DELETE FROM event_bus_intake_log WHERE received_at_ms < ? OR id <= ?")
        .run(olderThanMs, Number(intakeFloor?.head ?? 0) - keepNewest);
      return Number(this.connection.prepare(`DELETE FROM event_bus_journal
        WHERE sequence <= ? AND (received_at_ms < ? OR sequence <= ?)`)
        .run(passed, olderThanMs, newestKeptFloor).changes);
    });
  }
}

function readEntry(row: Record<string, unknown>): EventBusJournalEntry {
  const sequence = Number(row.sequence);
  const receivedAtMs = Number(row.received_at_ms);
  try {
    const payload = JSON.parse(String(row.payload_json)) as Record<string, unknown>;
    const parsed = busEventSchema.safeParse({
      ...payload,
      sequence,
      busId: row.bus_id,
      eventId: row.event_id,
      sourceKind: row.source_kind,
      sourceRegistrationId: row.source_registration_id,
      kind: row.kind,
      receivedAt: row.received_at,
      correlationKey: row.correlation_key ?? null
    });
    return { sequence, receivedAtMs, event: parsed.success ? parsed.data : null };
  }
  // error-provenance: allow expected -- an unreadable persisted row is reported as invalid and skipped by the bus
  catch {
    return { sequence, receivedAtMs, event: null };
  }
}
