import { randomBytes } from "node:crypto";
import {
  twitchCorrelationKey,
  type BusEvent,
  type BusEventInput,
  type EffectTrigger,
  type IngestProviderId,
  type NormalizedStreamEvent
} from "@stream-jams/core";
import type { EventSink, EventSinkOutcome } from "./event-ingestion-service.js";
import type { EventBusJournalRepository } from "./sqlite-event-bus-journal-repository.js";

/** A module that receives every bus event in journal order through its own persisted cursor. */
export interface EventBusConsumer {
  readonly id: string;
  /** Total delivery attempts before the event is recorded as failed and skipped. Defaults to 3. */
  readonly maxAttempts?: number | undefined;
  handle(event: BusEvent): Promise<void>;
}

export interface EventBusDeliveryFailureReport {
  readonly consumerId: string;
  readonly sequence: number;
  readonly event: BusEvent | null;
  readonly attempts: number;
  readonly referenceId: string;
  readonly error: unknown;
}

export interface EventBusOptions {
  readonly journal: EventBusJournalRepository;
  readonly consumers: readonly EventBusConsumer[];
  readonly generateReferenceId: () => string;
  readonly generateBusId?: (() => string) | undefined;
  /** Names the registration in use for a source kind, recorded on each bus event it publishes. */
  readonly resolveSourceRegistrationId?: ((kind: IngestProviderId) => string | null | Promise<string | null>) | undefined;
  readonly now?: (() => Date) | undefined;
  readonly sleep?: ((delayMs: number) => Promise<void>) | undefined;
  /** Delay before each retry; its length bounds nothing, `maxAttempts` does. */
  readonly retryDelaysMs?: readonly number[] | undefined;
  readonly duplicateWindowMs?: number | undefined;
  readonly correlationWindowMs?: number | undefined;
  readonly batchSize?: number | undefined;
  readonly retentionMs?: number | undefined;
  readonly retentionRows?: number | undefined;
  readonly onDeliveryFailure?: ((failure: EventBusDeliveryFailureReport) => void | Promise<void>) | undefined;
  readonly onReplaySkipped?: ((consumerId: string, skippedCount: number) => void | Promise<void>) | undefined;
  readonly onWorkerError?: ((consumerId: string, error: unknown) => void | Promise<void>) | undefined;
}

const defaultRetryDelaysMs = [50, 200] as const;
const defaultDuplicateWindowMs = 10 * 60_000;
const defaultCorrelationWindowMs = 30_000;
const defaultBatchSize = 25;
const defaultRetentionMs = 7 * 24 * 60 * 60_000;
const defaultRetentionRows = 10_000;
const pruneIntervalMs = 60 * 60_000;

/**
 * Central event bus. Every active source publishes here; each registered consumer receives
 * accepted events independently, in order, at least once.
 */
export class EventBus implements EventSink {
  readonly #journal: EventBusJournalRepository;
  readonly #workers: readonly ConsumerWorker[];
  readonly #generateBusId: () => string;
  readonly #resolveSourceRegistrationId: NonNullable<EventBusOptions["resolveSourceRegistrationId"]>;
  readonly #now: () => Date;
  readonly #duplicateWindowMs: number;
  readonly #correlationWindowMs: number;
  readonly #retentionMs: number;
  readonly #retentionRows: number;
  readonly #onReplaySkipped: EventBusOptions["onReplaySkipped"];
  readonly #onWorkerError: EventBusOptions["onWorkerError"];
  #started = false;
  #lastPrunedAtMs = Number.NEGATIVE_INFINITY;

  constructor(options: EventBusOptions) {
    const ids = new Set(options.consumers.map((consumer) => consumer.id));
    if (ids.size !== options.consumers.length) throw new Error("Event bus consumer IDs must be unique");
    this.#journal = options.journal;
    this.#generateBusId = options.generateBusId ?? generateBusId;
    this.#resolveSourceRegistrationId = options.resolveSourceRegistrationId ?? (() => null);
    this.#now = options.now ?? (() => new Date());
    this.#duplicateWindowMs = options.duplicateWindowMs ?? defaultDuplicateWindowMs;
    this.#correlationWindowMs = options.correlationWindowMs ?? defaultCorrelationWindowMs;
    this.#retentionMs = options.retentionMs ?? defaultRetentionMs;
    this.#retentionRows = options.retentionRows ?? defaultRetentionRows;
    this.#onReplaySkipped = options.onReplaySkipped;
    this.#onWorkerError = options.onWorkerError;
    const shared: WorkerDependencies = {
      journal: options.journal,
      now: this.#now,
      sleep: options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))),
      retryDelaysMs: options.retryDelaysMs ?? defaultRetryDelaysMs,
      batchSize: options.batchSize ?? defaultBatchSize,
      generateReferenceId: options.generateReferenceId,
      onDeliveryFailure: options.onDeliveryFailure
    };
    this.#workers = options.consumers.map((consumer) => new ConsumerWorker(consumer, shared));
  }

  /**
   * Loads consumer cursors. Restart replay is not enabled yet, so events journaled while a consumer
   * was not running are skipped and reported rather than delivered late.
   */
  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    this.#journal.removeCursorsExcept(this.#workers.map((worker) => worker.id));
    const head = this.#journal.headSequence();
    const updatedAt = this.#now().toISOString();
    for (const worker of this.#workers) {
      const cursor = this.#journal.getCursor(worker.id);
      if (cursor !== null && cursor < head) await this.#onReplaySkipped?.(worker.id, head - cursor);
      if (cursor !== head) this.#journal.setCursor(worker.id, head, updatedAt);
      worker.resumeAt(head);
    }
    this.prune();
  }

  async handleEvent(event: NormalizedStreamEvent, triggers: readonly EffectTrigger[]): Promise<EventSinkOutcome> {
    return this.publish({
      kind: "canonical",
      event,
      eventId: event.id,
      sourceKind: event.ingestProvider,
      sourceRegistrationId: await this.#resolveSourceRegistrationId(event.ingestProvider),
      receivedAt: this.#now().toISOString(),
      correlationKey: twitchCorrelationKey(event),
      effectTriggers: triggers
    });
  }

  async handleTriggers(triggers: readonly EffectTrigger[]): Promise<EventSinkOutcome> {
    const eventId = triggers[0]?.eventId;
    if (eventId === undefined) throw new Error("External bus events require at least one trigger");
    return this.publish({
      kind: "external",
      eventId,
      sourceKind: "streamerbot",
      sourceRegistrationId: await this.#resolveSourceRegistrationId("streamerbot"),
      receivedAt: this.#now().toISOString(),
      correlationKey: null,
      effectTriggers: triggers
    });
  }

  /**
   * Journals the event, then waits for every consumer's delivery attempt. Consumer failures do not reject.
   * A copy another source already delivered is merged into that event and not delivered again.
   */
  async publish(input: BusEventInput): Promise<EventSinkOutcome> {
    await this.start();
    const receivedAtMs = Date.parse(input.receivedAt);
    const appended = this.#journal.append(input, this.#generateBusId(), {
      duplicateSinceMs: receivedAtMs - this.#duplicateWindowMs,
      correlationSinceMs: receivedAtMs - this.#correlationWindowMs
    });
    if (appended.status !== "appended") return { status: appended.status };
    await this.drain();
    this.#pruneHourly();
    return { status: "accepted" };
  }

  /** Waits until every consumer has handled every journaled event it can currently read. */
  async drain(): Promise<void> {
    const results = await Promise.allSettled(this.#workers.map((worker) => worker.drain()));
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        await this.#onWorkerError?.(this.#workers[index]!.id, result.reason);
      }
    }
  }

  prune(): number {
    const nowMs = this.#now().getTime();
    this.#lastPrunedAtMs = nowMs;
    return this.#journal.prune(nowMs - this.#retentionMs, this.#retentionRows);
  }

  #pruneHourly(): void {
    if (this.#now().getTime() - this.#lastPrunedAtMs >= pruneIntervalMs) this.prune();
  }
}

interface WorkerDependencies {
  readonly journal: EventBusJournalRepository;
  readonly now: () => Date;
  readonly sleep: (delayMs: number) => Promise<void>;
  readonly retryDelaysMs: readonly number[];
  readonly batchSize: number;
  readonly generateReferenceId: () => string;
  readonly onDeliveryFailure: EventBusOptions["onDeliveryFailure"];
}

class ConsumerWorker {
  readonly #consumer: EventBusConsumer;
  readonly #dependencies: WorkerDependencies;
  readonly #maxAttempts: number;
  #cursor = 0;
  #tail: Promise<void> = Promise.resolve();

  constructor(consumer: EventBusConsumer, dependencies: WorkerDependencies) {
    this.#consumer = consumer;
    this.#dependencies = dependencies;
    this.#maxAttempts = Math.max(1, consumer.maxAttempts ?? 3);
  }

  get id(): string {
    return this.#consumer.id;
  }

  resumeAt(sequence: number): void {
    this.#cursor = sequence;
  }

  /** Serializes drains so each consumer handles events one at a time in journal order. */
  drain(): Promise<void> {
    const run = this.#tail.then(() => this.#drainAvailable());
    this.#tail = run.catch(
      // error-provenance: allow expected -- the caller receives this run's rejection; the chain must stay usable for later drains
      () => undefined
    );
    return run;
  }

  async #drainAvailable(): Promise<void> {
    for (;;) {
      const entries = this.#dependencies.journal.readAfter(this.#cursor, this.#dependencies.batchSize);
      if (entries.length === 0) return;
      for (const entry of entries) {
        await this.#deliver(entry.sequence, entry.event);
        this.#dependencies.journal.setCursor(this.#consumer.id, entry.sequence, this.#dependencies.now().toISOString());
        this.#cursor = entry.sequence;
      }
    }
  }

  async #deliver(sequence: number, event: BusEvent | null): Promise<void> {
    if (event === null) {
      await this.#fail(sequence, null, 1, new Error("Journaled event failed validation"));
      return;
    }
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.#consumer.handle(event);
        return;
      } catch (error) {
        if (attempt >= this.#maxAttempts) {
          await this.#fail(sequence, event, attempt, error);
          return;
        }
        const delays = this.#dependencies.retryDelaysMs;
        await this.#dependencies.sleep(delays[Math.min(attempt - 1, delays.length - 1)] ?? 0);
      }
    }
  }

  async #fail(sequence: number, event: BusEvent | null, attempts: number, error: unknown): Promise<void> {
    const referenceId = this.#dependencies.generateReferenceId();
    this.#dependencies.journal.recordFailure({
      sequence,
      consumerId: this.#consumer.id,
      attempts,
      errorMessage: error instanceof Error ? error.message : "Event bus consumer failed",
      referenceId,
      failedAt: this.#dependencies.now().toISOString()
    });
    try {
      await this.#dependencies.onDeliveryFailure?.({ consumerId: this.#consumer.id, sequence, event, attempts, referenceId, error });
    }
    // error-provenance: allow cleanup -- the failure is already journaled; a reporting failure must not stall this consumer
    catch {
      // The cursor still advances past the failed event.
    }
  }
}

function generateBusId(): string {
  return `bus_${randomBytes(16).toString("base64url")}`;
}
