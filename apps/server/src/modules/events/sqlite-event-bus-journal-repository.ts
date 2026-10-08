import type { DatabaseSync } from "node:sqlite";
import type { BusEvent, BusEventInput } from "@stream-jams/core";
import { busEventSchema } from "@stream-jams/core/event-bus";
import { runInTransaction } from "../db/database.js";

export type EventBusAppendResult =
  | { readonly status: "appended"; readonly event: BusEvent }
  | { readonly status: "duplicate" };

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
  /** Appends unless the same source delivered the same event ID at or after `duplicateSinceMs`. */
  append(input: BusEventInput, busId: string, duplicateSinceMs: number): EventBusAppendResult;
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

  append(input: BusEventInput, busId: string, duplicateSinceMs: number): EventBusAppendResult {
    return runInTransaction(this.connection, () => {
      const duplicate = this.connection.prepare(`SELECT 1 FROM event_bus_journal
        WHERE source_kind = ? AND event_id = ? AND received_at_ms >= ? LIMIT 1`)
        .get(input.sourceKind, input.eventId, duplicateSinceMs);
      if (duplicate !== undefined) return { status: "duplicate" } as const;

      const receivedAtMs = Date.parse(input.receivedAt);
      const payload = input.kind === "canonical"
        ? { event: input.event, effectTriggers: input.effectTriggers }
        : { effectTriggers: input.effectTriggers };
      const result = this.connection.prepare(`INSERT INTO event_bus_journal
        (bus_id, event_id, source_kind, source_registration_id, kind, received_at, received_at_ms, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(busId, input.eventId, input.sourceKind, input.sourceRegistrationId, input.kind, input.receivedAt, receivedAtMs, JSON.stringify(payload));
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
      receivedAt: row.received_at
    });
    return { sequence, event: parsed.success ? parsed.data : null };
  }
  // error-provenance: allow expected -- an unreadable persisted row is reported as invalid and skipped by the bus
  catch {
    return { sequence, event: null };
  }
}
