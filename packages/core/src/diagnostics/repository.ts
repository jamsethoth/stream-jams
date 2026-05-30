import type { NormalizedStreamEvent } from "../events/types.js";
import type { ProcessingId } from "./logging.js";

export type EventLogStatus = "received" | "processed" | "failed";
export type PlaybackLogStatus = "queued" | "playing" | "completed" | "skipped" | "failed";

export interface EventLogRecord {
  readonly id: string;
  readonly event: NormalizedStreamEvent;
  readonly receivedAt: string;
  readonly status: EventLogStatus;
  readonly correlationId: string;
  readonly processingId: ProcessingId | null;
  readonly errorMessage: string | null;
}

export interface AlertMatchLogRecord {
  readonly id: string;
  readonly sourceEventId: string;
  readonly ruleId: string;
  readonly variantId: string;
  readonly matchedAt: string;
  readonly correlationId: string;
  readonly processingId: ProcessingId | null;
}

export interface PlaybackLogRecord {
  readonly id: string;
  readonly queueItemId: string;
  readonly sourceEventId: string;
  readonly alertIds: readonly string[];
  readonly status: PlaybackLogStatus;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly processingId: ProcessingId | null;
  readonly message: string | null;
}

export interface DiagnosticsLogListOptions {
  readonly limit?: number;
}

export interface DiagnosticsLogRepository {
  appendEventLog(record: EventLogRecord): Promise<EventLogRecord>;
  listEventLogs(options?: DiagnosticsLogListOptions): Promise<readonly EventLogRecord[]>;
  appendAlertMatchLog(record: AlertMatchLogRecord): Promise<AlertMatchLogRecord>;
  listAlertMatchLogs(options?: DiagnosticsLogListOptions): Promise<readonly AlertMatchLogRecord[]>;
  appendPlaybackLog(record: PlaybackLogRecord): Promise<PlaybackLogRecord>;
  listPlaybackLogs(options?: DiagnosticsLogListOptions): Promise<readonly PlaybackLogRecord[]>;
}
