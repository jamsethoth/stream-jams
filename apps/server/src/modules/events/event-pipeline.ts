import type {
  AlertMatchLogRecord,
  DiagnosticsLogRepository,
  EventLogRecord,
  NormalizedStreamEvent,
  PlaybackLogRecord,
  PlaybackQueueItem,
  PlaybackQueueSnapshot,
  ProcessingId
} from "@stream-jams/core";
import type { EventSink } from "./event-ingestion-service.js";
import type { PlaybackCoordinator, PlaybackEnqueueResult } from "../playback/playback-coordinator.js";

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
  readonly now?: (() => Date) | undefined;
}

export class EventPipeline implements EventSink {
  readonly #playbackCoordinator: Pick<PlaybackCoordinator, "enqueueEvent">;
  readonly #diagnosticsLogRepository: Pick<
    DiagnosticsLogRepository,
    "appendEventLog" | "appendAlertMatchLog" | "appendPlaybackLog"
  >;
  readonly #generateId: EventPipelineIdGenerator;
  readonly #now: () => Date;

  constructor(options: EventPipelineOptions) {
    this.#playbackCoordinator = options.playbackCoordinator;
    this.#diagnosticsLogRepository = options.diagnosticsLogRepository;
    this.#generateId = options.generateId;
    this.#now = options.now ?? (() => new Date());
  }

  async handleEvent(event: NormalizedStreamEvent): Promise<void> {
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
