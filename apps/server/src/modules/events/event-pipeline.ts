import type {
  AlertMatchLogRecord,
  DiagnosticsLogRepository,
  EffectTrigger,
  EventLogRecord,
  NormalizedStreamEvent,
  PlaybackLogRecord,
  PlaybackQueueItem,
  PlaybackQueueSnapshot,
  ProcessingId
} from "@stream-jams/core";
import type { EventSink } from "./event-ingestion-service.js";
import type { PlaybackCoordinator, PlaybackEnqueueResult } from "../playback/playback-coordinator.js";
import type { EffectTriggerSink } from "../screen-effects/effect-trigger-adapter.js";

export interface EventPipelineIdGenerator {
  (kind: "event-log" | "alert-match-log" | "playback-log" | "processing"): string;
}

export interface EventPipelineOptions {
  readonly playbackCoordinator: Pick<PlaybackCoordinator, "enqueueEvent">;
  readonly diagnosticsLogRepository: Pick<
    DiagnosticsLogRepository,
    "appendEventLog" | "appendAlertMatchLog" | "appendPlaybackLog"
  >;
  readonly generateId: EventPipelineIdGenerator;
  readonly effectTriggerSink?: EffectTriggerSink | undefined;
  readonly onEffectError?: ((error: Error, triggers: readonly EffectTrigger[]) => void | Promise<void>) | undefined;
  readonly now?: (() => Date) | undefined;
}

export class EventPipeline implements EventSink {
  readonly #playbackCoordinator: Pick<PlaybackCoordinator, "enqueueEvent">;
  readonly #diagnosticsLogRepository: Pick<
    DiagnosticsLogRepository,
    "appendEventLog" | "appendAlertMatchLog" | "appendPlaybackLog"
  >;
  readonly #generateId: EventPipelineIdGenerator;
  readonly #effectTriggerSink: EffectTriggerSink | null;
  readonly #onEffectError: (error: Error, triggers: readonly EffectTrigger[]) => void | Promise<void>;
  readonly #now: () => Date;

  constructor(options: EventPipelineOptions) {
    this.#playbackCoordinator = options.playbackCoordinator;
    this.#diagnosticsLogRepository = options.diagnosticsLogRepository;
    this.#generateId = options.generateId;
    this.#effectTriggerSink = options.effectTriggerSink ?? null;
    this.#onEffectError = options.onEffectError ?? (() => {});
    this.#now = options.now ?? (() => new Date());
  }

  async handleEvent(event: NormalizedStreamEvent, triggers: readonly EffectTrigger[] = []): Promise<void> {
    const processingId = this.#generateId("processing") as ProcessingId;
    const correlationId = createCorrelationId(event);
    await this.#appendEventLog(event, "received", correlationId, processingId, null);
    const effectDelivery = this.#deliverEffects(triggers);

    try {
      const result = await this.#playbackCoordinator.enqueueEvent(event);
      await this.#appendPlaybackRecords(event, result, correlationId, processingId);
      await effectDelivery;
      await this.#appendEventLog(event, "processed", correlationId, processingId, null);
    } catch (error) {
      await effectDelivery;
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

  async handleTriggers(triggers: readonly EffectTrigger[]): Promise<void> {
    await this.#deliverEffects(triggers);
  }

  async #deliverEffects(triggers: readonly EffectTrigger[]): Promise<void> {
    if (triggers.length === 0 || this.#effectTriggerSink === null) return;
    try {
      await this.#effectTriggerSink.handleTriggers(triggers);
    } catch (error) {
      try {
        await this.#onEffectError(
          error instanceof Error ? error : new Error("Screen Effects trigger handling failed"),
          triggers
        );
      } catch {
        // Diagnostics must not turn an isolated Screen Effects failure into an Alert failure.
      }
    }
  }

  async #appendPlaybackRecords(
    event: NormalizedStreamEvent,
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
    event: NormalizedStreamEvent,
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

function createCorrelationId(event: NormalizedStreamEvent): string {
  return `event:${event.providerId}:${event.id}`;
}
