import type {
  AlertMatchLogRecord,
  AlertSourceEvent,
  BusEvent,
  ExternalAlertEvent,
  DiagnosticsLogRepository,
  EventLogRecord,
  PlaybackLogRecord,
  PlaybackQueueItem,
  PlaybackQueueSnapshot,
  ProcessingId
} from "@stream-jams/core";
import type { EventBusConsumer } from "./event-bus.js";
import type { PlaybackCoordinator, PlaybackEnqueueResult } from "../playback/playback-coordinator.js";

export interface EventPipelineIdGenerator {
  (kind: "event-log" | "alert-match-log" | "playback-log" | "processing"): string;
}

export interface EventPipelineOptions {
  readonly timerEventSink?: { handleEvent(event: BusEvent): Promise<void> };
  readonly onTimerError?: (error: unknown, event: BusEvent) => void | Promise<void>;
  readonly playbackCoordinator: Pick<PlaybackCoordinator, "enqueueEvent">;
  readonly diagnosticsLogRepository: Pick<
    DiagnosticsLogRepository,
    "appendEventLog" | "appendAlertMatchLog" | "appendPlaybackLog"
  >;
  readonly generateId: EventPipelineIdGenerator;
  readonly effectEventSink?: { handleEvent(event: BusEvent): Promise<unknown> } | undefined;
  readonly onEffectError?: ((error: Error, event: BusEvent) => void | Promise<void>) | undefined;
  readonly now?: (() => Date) | undefined;
}

/** Builds the Alerts, Screen Effects and Timers consumers of the central event bus. */
export class EventPipeline {
  readonly #timerEventSink: EventPipelineOptions["timerEventSink"];
  readonly #onTimerError: EventPipelineOptions["onTimerError"];
  readonly #playbackCoordinator: Pick<PlaybackCoordinator, "enqueueEvent">;
  readonly #diagnosticsLogRepository: Pick<
    DiagnosticsLogRepository,
    "appendEventLog" | "appendAlertMatchLog" | "appendPlaybackLog"
  >;
  readonly #generateId: EventPipelineIdGenerator;
  readonly #effectEventSink: NonNullable<EventPipelineOptions["effectEventSink"]> | null;
  readonly #onEffectError: (error: Error, event: BusEvent) => void | Promise<void>;
  readonly #now: () => Date;

  constructor(options: EventPipelineOptions) {
    this.#timerEventSink = options.timerEventSink;
    this.#onTimerError = options.onTimerError;
    this.#playbackCoordinator = options.playbackCoordinator;
    this.#diagnosticsLogRepository = options.diagnosticsLogRepository;
    this.#generateId = options.generateId;
    this.#effectEventSink = options.effectEventSink ?? null;
    this.#onEffectError = options.onEffectError ?? (() => {});
    this.#now = options.now ?? (() => new Date());
  }

  consumers(): readonly EventBusConsumer[] {
    return [
      // Playback dedupe accepts the event before a failure, so a retry could only report a duplicate.
      { id: "alerts", maxAttempts: 1, handle: (event) => this.#deliverAlerts(event) },
      // Failures are diagnosed inside the consumer and never reach the bus.
      { id: "screen-effects", maxAttempts: 1, handle: (event) => this.#deliverEffects(event) },
      // Timer adjustments are not idempotent, so a partial failure must not be retried.
      { id: "timers", maxAttempts: 1, handle: (event) => this.#deliverTimers(event) }
    ];
  }

  async #deliverAlerts(busEvent: BusEvent): Promise<void> {
    const events: AlertSourceEvent[] = [
      ...(busEvent.kind === "canonical" ? [busEvent.event] : []),
      ...createExternalAlertEvents(busEvent)
    ];
    let failure: { readonly error: unknown } | null = null;
    for (const event of events) {
      try {
        await this.#deliverAlertEvent(event);
      } catch (error) {
        // error-provenance: allow expected -- each admitted event is attempted before the first failure is reported
        failure ??= { error };
      }
    }
    if (failure !== null) throw failure.error;
  }

  async #deliverAlertEvent(event: AlertSourceEvent): Promise<void> {
    const processingId = this.#generateId("processing") as ProcessingId;
    const correlationId = createCorrelationId(event);
    await this.#appendEventLog(event, "received", correlationId, processingId, null);

    try {
      const result = await this.#playbackCoordinator.enqueueEvent(event);
      await this.#appendPlaybackRecords(event, result, correlationId, processingId);
      await this.#appendEventLog(event, "processed", correlationId, processingId, null);
    } catch (error) {
      await this.#appendEventLog(
        event,
        "failed",
        correlationId,
        processingId,
        error instanceof Error ? error.message : "Event pipeline failed"
      );
      throw error;
    }
  }

  async #deliverTimers(busEvent: BusEvent): Promise<void> {
    try { await this.#timerEventSink?.handleEvent(busEvent); }
    catch (error) {
      // error-provenance: allow expected -- timer failures are diagnosed independently of alert intake
      await this.#onTimerError?.(error, busEvent);
    }
  }

  async #deliverEffects(busEvent: BusEvent): Promise<void> {
    if (this.#effectEventSink === null) return;
    try {
      await this.#effectEventSink.handleEvent(busEvent);
    } catch (error) {
      try {
        await this.#onEffectError(
          error instanceof Error ? error : new Error("Screen Effects trigger handling failed", { cause: error }),
          busEvent
        );
      // error-provenance: allow cleanup -- the production diagnostic logger has its own emergency sink and must not fail alert intake
      }
      // error-provenance: allow expected -- failure is intentionally converted to the bounded fallback at this boundary
      catch {
        // Diagnostics must not turn an isolated Screen Effects failure into an Alert failure.
      }
    }
  }

  async #appendPlaybackRecords(
    event: AlertSourceEvent,
    result: PlaybackEnqueueResult,
    correlationId: string,
    processingId: ProcessingId
  ): Promise<void> {
    if (result.status !== "queued") {
      return;
    }

    const queueItem = findQueueItemForEvent(result.snapshot, event.id);
    if (queueItem === null) {
      return;
    }

    const loggedMatches = new Set<string>();
    for (const alert of queueItem.alerts) {
      const matchKey = `${alert.ruleId}:${alert.variantId}`;
      if (loggedMatches.has(matchKey)) {
        continue;
      }

      loggedMatches.add(matchKey);
      await this.#diagnosticsLogRepository.appendAlertMatchLog({
        id: this.#generateId("alert-match-log"),
        sourceEventId: event.id,
        ruleId: alert.ruleId,
        variantId: alert.variantId,
        matchedAt: this.#now().toISOString(),
        correlationId,
        processingId
      } satisfies AlertMatchLogRecord);
    }

    await this.#diagnosticsLogRepository.appendPlaybackLog({
      id: this.#generateId("playback-log"),
      queueItemId: queueItem.id,
      sourceEventId: event.id,
      alertIds: queueItem.alerts.map((alert) => alert.id),
      status: "queued",
      occurredAt: this.#now().toISOString(),
      correlationId,
      processingId,
      message: null
    } satisfies PlaybackLogRecord);
  }

  async #appendEventLog(
    event: AlertSourceEvent,
    status: EventLogRecord["status"],
    correlationId: string,
    processingId: ProcessingId,
    errorMessage: string | null
  ): Promise<void> {
    await this.#diagnosticsLogRepository.appendEventLog({
      id: this.#generateId("event-log"),
      event,
      receivedAt: this.#now().toISOString(),
      status,
      correlationId,
      processingId,
      errorMessage
    });
  }
}

function findQueueItemForEvent(snapshot: PlaybackQueueSnapshot, eventId: string): PlaybackQueueItem | null {
  const candidates = [
    ...(snapshot.current === null ? [] : [snapshot.current]),
    ...snapshot.queued,
    ...snapshot.recent
  ];
  return candidates.find((item) => item.sourceEvent.id === eventId) ?? null;
}

function createCorrelationId(event: AlertSourceEvent): string {
  return `event:${event.providerId}:${event.id}`;
}

/**
 * Each exact Streamer.bot identity on the bus event becomes an alert-only event carrying only the
 * sanitized summary and user name, so payload fields never reach alert matching or templates.
 */
function createExternalAlertEvents(busEvent: BusEvent): readonly ExternalAlertEvent[] {
  return busEvent.effectTriggers.flatMap((trigger) => {
    if (trigger.kind !== "streamerbot-event") return [];
    const userName = trigger.userName ?? "";
    return [{
      id: `external:${trigger.eventId}`,
      type: "external_event" as const,
      providerId: "streamerbot" as const,
      ingestProvider: "streamerbot" as const,
      occurredAt: trigger.occurredAt,
      actor: { id: null, displayName: userName === "" ? "Streamer.bot" : userName },
      message: null,
      metadata: {},
      amount: null,
      identity: { providerKind: "streamerbot" as const, sourceKey: trigger.sourceKey, eventType: trigger.eventType },
      summary: trigger.summary,
      userName
    }];
  });
}
