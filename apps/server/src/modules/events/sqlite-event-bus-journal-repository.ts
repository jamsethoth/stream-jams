import type { DatabaseSync } from "node:sqlite";
import type { BusEvent, BusEventInput } from "@stream-jams/core";
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
  /** Removes rows every consumer has passed that are older than the cutoff or beyond the newest `keepNewest`. */
  prune(olderThanMs: number, keepNewest: number): number;
}

const maxStoredErrorLength = 500;

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
        : { effectTriggers: input.effectTriggers };
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
  }

  prune(olderThanMs: number, keepNewest: number): number {
    return runInTransaction(this.connection, () => {
      const passedRow = this.connection.prepare("SELECT MIN(last_sequence) AS passed FROM event_bus_consumer_cursors").get();
      const passed = passedRow?.passed === null || passedRow?.passed === undefined ? this.headSequence() : Number(passedRow.passed);
      const newestKeptFloor = this.headSequence() - keepNewest;
      return Number(this.connection.prepare(`DELETE FROM event_bus_journal
        WHERE sequence <= ? AND (received_at_ms < ? OR sequence <= ?)`)
        .run(passed, olderThanMs, newestKeptFloor).changes);
    });
  }
}

function readEntry(row: Record<string, unknown>): EventBusJournalEntry {
  const sequence = Number(row.sequence);
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
    return { sequence, event: parsed.success ? parsed.data : null };
  }
  // error-provenance: allow expected -- an unreadable persisted row is reported as invalid and skipped by the bus
  catch {
    return { sequence, event: null };
  }
}
