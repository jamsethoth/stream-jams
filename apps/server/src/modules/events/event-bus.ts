import { randomBytes } from "node:crypto";
import {
  eventBusReplayAgeDefaultSeconds,
  externalEventPayloadSchema,
  twitchCorrelationKey,
  type BusEvent,
  type BusEventInput,
  type EffectTrigger,
  type EventBusConsumerOutcome,
  type EventBusConsumerRegistration,
  type ExternalEventIdentity,
  type IngestProviderId,
  type NormalizedStreamEvent
} from "@stream-jams/core";
import type { EventSink, EventSinkDuplicate, EventSinkOutcome } from "./event-ingestion-service.js";
import type { EventBusJournalRepository } from "./sqlite-event-bus-journal-repository.js";

/** A module that receives every bus event in journal order through its own persisted cursor. */
export type EventBusConsumer = EventBusConsumerRegistration;

/**
 * True when an external trigger has the identity. Source keys compare case-insensitively, as Streamer.bot
 * source names did before the bus; event types compare exactly.
 */
export function externalIdentityMatchesTrigger(identity: ExternalEventIdentity, trigger: EffectTrigger): boolean {
  return trigger.kind === "streamerbot-event"
    && identity.providerKind === "streamerbot"
    && trigger.sourceKey.toLowerCase() === identity.sourceKey.toLowerCase()
    && trigger.eventType === identity.eventType;
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
  /** Current replay age: pending events older than this are expired instead of delivered. Defaults to 2 minutes. */
  readonly getReplayAgeMs?: (() => number) | undefined;
  /** Reports events a consumer skipped because they were older than the replay age. */
  readonly onExpired?: ((consumerId: string, expiredCount: number) => void | Promise<void>) | undefined;
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
  readonly #onWorkerError: EventBusOptions["onWorkerError"];
  readonly #externalPayloads: readonly ExternalEventIdentity[];
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
    this.#onWorkerError = options.onWorkerError;
    this.#externalPayloads = uniqueIdentities(options.consumers.flatMap((consumer) => consumer.externalPayloads ?? []));
    const shared: WorkerDependencies = {
      journal: options.journal,
      now: this.#now,
      sleep: options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))),
      retryDelaysMs: options.retryDelaysMs ?? defaultRetryDelaysMs,
      batchSize: options.batchSize ?? defaultBatchSize,
      generateReferenceId: options.generateReferenceId,
      onDeliveryFailure: options.onDeliveryFailure,
      getReplayAgeMs: options.getReplayAgeMs ?? (() => eventBusReplayAgeDefaultSeconds * 1_000),
      onExpired: options.onExpired
    };
    this.#workers = options.consumers.map((consumer) => new ConsumerWorker(consumer, shared));
  }

  /**
   * Loads consumer cursors without delivering anything. Each consumer resumes after its own cursor; a consumer
   * registered for the first time starts at the head, so it never receives events from before it existed.
   */
  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    this.#journal.removeCursorsExcept(this.#workers.map((worker) => worker.id));
    const head = this.#journal.headSequence();
    const updatedAt = this.#now().toISOString();
    for (const worker of this.#workers) {
      const cursor = this.#journal.getCursor(worker.id);
      if (cursor === null) this.#journal.setCursor(worker.id, head, updatedAt);
      worker.resumeAt(cursor ?? head, head);
    }
    this.prune();
  }

  /**
   * Delivers events journaled before a restart that consumers had not handled yet. Events older than the
   * replay age are recorded as expired for consumers that expire. Call it once outputs can reconnect.
   */
  async resume(): Promise<void> {
    await this.start();
    await this.drain();
  }

  /** Records every event no consumer has handled yet as expired, for example after a configuration restore. */
  async expirePending(): Promise<void> {
    await this.start();
    const head = this.#journal.headSequence();
    await Promise.all(this.#workers.map((worker) => worker.expireThrough(head)));
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

  /** External identities whose payloads registered consumers need; sources subscribe to them. */
  externalPayloadIdentities(): readonly ExternalEventIdentity[] {
    return this.#externalPayloads;
  }

  async handleTriggers(triggers: readonly EffectTrigger[], payload?: unknown): Promise<EventSinkOutcome> {
    const eventId = triggers[0]?.eventId;
    if (eventId === undefined) throw new Error("External bus events require at least one trigger");
    const wanted = this.#externalPayloads.some((identity) => triggers.some((trigger) => externalIdentityMatchesTrigger(identity, trigger)));
    const parsedPayload = wanted && payload !== undefined ? externalEventPayloadSchema.safeParse(payload) : null;
    return this.publish({
      ...(parsedPayload?.success === true ? { payload: parsedPayload.data } : {}),
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
    this.#journal.recordIntake({
      receivedAt: input.receivedAt,
      sourceKind: input.sourceKind,
      kind: input.kind,
      eventType: busEventTypeLabel(input),
      outcome: appended.status === "appended" ? "accepted" : appended.status,
      sequence: appended.status === "appended" ? appended.event.sequence : appended.status === "merged" ? appended.sequence : null,
      referenceId: null
    });
    if (appended.status !== "appended") return { status: appended.status };
    await this.drain();
    this.#pruneHourly();
    return { status: "accepted" };
  }

  /** Records input a source delivered that failed validation before it could be published. */
  recordRejected(sourceKind: IngestProviderId, referenceId: string): void {
    this.#journal.recordIntake({
      receivedAt: this.#now().toISOString(), sourceKind, kind: null, eventType: null, outcome: "rejected", sequence: null, referenceId
    });
  }

  /** Records a redelivery the ingestion service recognized before it reached the journal. */
  recordDuplicate(input: EventSinkDuplicate): void {
    this.#journal.recordIntake({
      receivedAt: this.#now().toISOString(), sourceKind: input.sourceKind, kind: input.kind,
      eventType: input.eventType === null ? null : input.eventType.slice(0, 250), outcome: "duplicate", sequence: null, referenceId: null
    });
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
  readonly getReplayAgeMs: () => number;
  readonly onExpired: EventBusOptions["onExpired"];
}

class ConsumerWorker {
  readonly #consumer: EventBusConsumer;
  readonly #dependencies: WorkerDependencies;
  readonly #maxAttempts: number;
  readonly #expires: boolean;
  #cursor = 0;
  /** Rows up to here were journaled before this run started, so they are replays that can expire. */
  #replayThrough = 0;
  #tail: Promise<void> = Promise.resolve();

  constructor(consumer: EventBusConsumer, dependencies: WorkerDependencies) {
    this.#consumer = consumer;
    this.#dependencies = dependencies;
    this.#maxAttempts = Math.max(1, consumer.maxAttempts ?? 3);
    this.#expires = consumer.expiresAfterReplayAge ?? true;
  }

  get id(): string {
    return this.#consumer.id;
  }

  resumeAt(sequence: number, replayThrough: number): void {
    this.#cursor = sequence;
    this.#replayThrough = replayThrough;
  }

  /** Serializes drains so each consumer handles events one at a time in journal order. */
  drain(): Promise<void> {
    return this.#serialize(() => this.#drainAvailable());
  }

  expireThrough(sequence: number): Promise<void> {
    return this.#serialize(async () => {
      if (sequence <= this.#cursor) return;
      const expired = this.#dependencies.journal.expireThrough(this.#consumer.id, sequence, this.#dependencies.now().toISOString());
      this.#cursor = sequence;
      if (expired > 0) await this.#reportExpired(expired);
    });
  }

  #serialize(work: () => Promise<void>): Promise<void> {
    const run = this.#tail.then(work);
    this.#tail = run.catch(
      // error-provenance: allow expected -- the caller receives this run's rejection; the chain must stay usable for later drains
      () => undefined
    );
    return run;
  }

  async #drainAvailable(): Promise<void> {
    let expired = 0;
    try {
      for (;;) {
        const entries = this.#dependencies.journal.readAfter(this.#cursor, this.#dependencies.batchSize);
        if (entries.length === 0) return;
        for (const entry of entries) {
          const now = this.#dependencies.now();
          if (this.#expires && entry.sequence <= this.#replayThrough && now.getTime() - entry.receivedAtMs > this.#dependencies.getReplayAgeMs()) {
            this.#dependencies.journal.recordOutcome(entry.sequence, this.#consumer.id, "expired", null, now.toISOString());
            expired += 1;
          } else {
            await this.#deliver(entry.sequence, entry.event);
          }
          this.#dependencies.journal.setCursor(this.#consumer.id, entry.sequence, this.#dependencies.now().toISOString());
          this.#cursor = entry.sequence;
        }
      }
    } finally {
      if (expired > 0) await this.#reportExpired(expired);
    }
  }

  async #reportExpired(count: number): Promise<void> {
    try {
      await this.#dependencies.onExpired?.(this.#consumer.id, count);
    }
    // error-provenance: allow cleanup -- expiry is already recorded per event; a reporting failure must not stall this consumer
    catch {
      // Diagnostics still show each expired event.
    }
  }

  async #deliver(sequence: number, event: BusEvent | null): Promise<void> {
    if (event === null) {
      await this.#fail(sequence, null, 1, new Error("Journaled event failed validation"));
      return;
    }
    const context = {
      checkpoint: () => this.#dependencies.journal.setCursor(this.#consumer.id, sequence, this.#dependencies.now().toISOString())
    };
    const record = (outcome: EventBusConsumerOutcome) =>
      this.#dependencies.journal.recordOutcome(sequence, this.#consumer.id, outcome, null, this.#dependencies.now().toISOString());
    for (let attempt = 1; ; attempt += 1) {
      try {
        record(await this.#consumer.handle(event, context) ?? "admitted");
        return;
      } catch (error) {
        // A committed checkpoint means the consumer already applied this event; never apply it twice.
        if ((this.#dependencies.journal.getCursor(this.#consumer.id) ?? 0) >= sequence) {
          record("admitted");
          return;
        }
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

/** A bounded, payload-free label for Diagnostics: the canonical type, or the external source and type. */
function busEventTypeLabel(input: BusEventInput): string | null {
  if (input.kind === "canonical") return input.event.type;
  const trigger = input.effectTriggers.find((candidate) => candidate.kind === "streamerbot-event");
  return trigger === undefined ? null : `${trigger.sourceKey} · ${trigger.eventType}`;
}

function uniqueIdentities(identities: readonly ExternalEventIdentity[]): readonly ExternalEventIdentity[] {
  const seen = new Map<string, ExternalEventIdentity>();
  for (const identity of identities) {
    seen.set(JSON.stringify([identity.providerKind, identity.sourceKey.toLowerCase(), identity.eventType]), identity);
  }
  return [...seen.values()];
}

function generateBusId(): string {
  return `bus_${randomBytes(16).toString("base64url")}`;
}
