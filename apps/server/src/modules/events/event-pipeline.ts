import { canonicalEventForSelector } from "@stream-jams/core";
import type {
  AlertMatchLogRecord,
  AlertSourceEvent,
  BusEvent,
  EventBusHandleOutcome,
  ExternalAlertEvent,
  DiagnosticsLogRepository,
  EventLogRecord,
  PlaybackLogRecord,
  PlaybackQueueItem,
  PlaybackQueueSnapshot,
  ProcessingId
} from "@stream-jams/core";
import type { EventBusConsumer } from "./event-bus.js";
import type { EffectAdmissionResult } from "../screen-effects/effect-admission-service.js";
import type { PlaybackCoordinator, PlaybackEnqueueResult } from "../playback/playback-coordinator.js";

export interface EventPipelineIdGenerator {
  (kind: "event-log" | "alert-match-log" | "playback-log" | "processing"): string;
}

export interface EventPipelineOptions {
  readonly isAlertsEnabled?: () => Promise<boolean>;
  /** Resolves true when the event matched at least one timer rule. */
  readonly timerEventSink?: { handleEvent(event: BusEvent): Promise<boolean> };
  readonly onTimerError?: (error: unknown, event: BusEvent) => void | Promise<void>;
  readonly playbackCoordinator: Pick<PlaybackCoordinator, "enqueueEvent">;
  readonly diagnosticsLogRepository: Pick<
    DiagnosticsLogRepository,
    "appendEventLog" | "appendAlertMatchLog" | "appendPlaybackLog"
  >;
  readonly generateId: EventPipelineIdGenerator;
  readonly effectEventSink?: { handleEvent(event: BusEvent): Promise<EffectAdmissionResult> } | undefined;
  readonly onEffectError?: ((error: Error, event: BusEvent) => void | Promise<void>) | undefined;
  readonly manualAlertSink?: { handleEvent(event: Extract<BusEvent, { kind: "manual" }>): Promise<EventBusHandleOutcome> };
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
  readonly #manualAlertSink: EventPipelineOptions["manualAlertSink"];
  readonly #isAlertsEnabled: EventPipelineOptions["isAlertsEnabled"];
  readonly #now: () => Date;

  constructor(options: EventPipelineOptions) {
    this.#manualAlertSink = options.manualAlertSink;
    this.#isAlertsEnabled = options.isAlertsEnabled;
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

  async #deliverAlerts(busEvent: BusEvent): Promise<EventBusHandleOutcome> {
    if (this.#isAlertsEnabled !== undefined && !await this.#isAlertsEnabled()) return "no-match";
    if (busEvent.kind === "manual" && (busEvent.action.kind === "alert-draft-test" || busEvent.action.kind === "alert-saved-test")) {
      return this.#manualAlertSink?.handleEvent(busEvent) ?? "no-match";
    }
    const canonical = canonicalEventForSelector(busEvent);
    const events: AlertSourceEvent[] = [
      ...(canonical === null ? [] : [canonical]),
      ...createExternalAlertEvents(busEvent)
    ];
    let failure: { readonly error: unknown } | null = null;
    let admitted = false;
    for (const event of events) {
      try {
        admitted = await this.#deliverAlertEvent(event, busEvent.kind === "manual") || admitted;
      } catch (error) {
        // error-provenance: allow expected -- each admitted event is attempted before the first failure is reported
        failure ??= { error };
      }
    }
    if (failure !== null) throw failure.error;
    return admitted ? "admitted" : "no-match";
  }

  /** Resolves true when the event queued an alert. */
  async #deliverAlertEvent(event: AlertSourceEvent, manual = false): Promise<boolean> {
    const processingId = this.#generateId("processing") as ProcessingId;
    const correlationId = manual ? `event:manual:${event.id}` : createCorrelationId(event);
    if (!manual) await this.#appendEventLog(event, "received", correlationId, processingId, null);

    try {
      const result = await this.#playbackCoordinator.enqueueEvent(event, manual ? "manual" : event.ingestProvider);
      await this.#appendPlaybackRecords(event, result, correlationId, processingId);
      if (!manual) await this.#appendEventLog(event, "processed", correlationId, processingId, null);
      return result.status === "queued";
    } catch (error) {
      if (!manual) await this.#appendEventLog(
        event,
        "failed",
        correlationId,
        processingId,
        error instanceof Error ? error.message : "Event pipeline failed"
      );
      throw error;
    }
  }

  async #deliverTimers(busEvent: BusEvent): Promise<EventBusHandleOutcome> {
    try { return await this.#timerEventSink?.handleEvent(busEvent) === true ? "admitted" : "no-match"; }
    catch (error) {
      // error-provenance: allow expected -- timer failures are diagnosed independently of alert intake
      await this.#onTimerError?.(error, busEvent);
      return "failed";
    }
  }

  async #deliverEffects(busEvent: BusEvent): Promise<EventBusHandleOutcome> {
    if (this.#effectEventSink === null) return "no-match";
    try {
      const result = await this.#effectEventSink.handleEvent(busEvent);
      return result.outcomes.some((outcome) => outcome.status === "queued") ? "admitted" : "no-match";
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
      return "failed";
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
  if (busEvent.kind === "manual" && busEvent.action.kind === "simulate-external") {
    return [{ id: busEvent.eventId, type: "external_event", providerId: "streamerbot", ingestProvider: "streamerbot",
      occurredAt: busEvent.receivedAt, actor: { id: null, displayName: "Manual" }, message: null, metadata: {}, amount: null,
      identity: busEvent.action.identity, summary: `Manual ${busEvent.action.identity.sourceKey} ${busEvent.action.identity.eventType}`.slice(0, 256), userName: "" }];
  }
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
