import type {
  AlertMatchLogRecord,
  DiagnosticsLogRepository,
  EventLogRecord,
  PlaybackLogRecord,
  Redactor
} from "@stream-jams/core";
import type { RuntimeLogEntry, RuntimeLogMetadata, RuntimeLogReadResult } from "./runtime-jsonl-logger.js";

export interface DiagnosticsProviderStatus {
  readonly providerId: string;
  readonly label: string;
  readonly state: "idle" | "ready" | "degraded";
  readonly lastErrorAt: string | null;
  readonly message: string | null;
}

export interface DiagnosticsProviderStatusSource {
  getStatus(): DiagnosticsProviderStatus;
}

export interface DiagnosticsRuntimeLogSource {
  getMetadata(): Promise<RuntimeLogMetadata>;
  listRecent(options: { readonly limit: number; readonly sinceHours?: number | undefined }): Promise<RuntimeLogReadResult>;
}

export interface DiagnosticsServiceOptions {
  readonly repository: Pick<DiagnosticsLogRepository, "listEventLogs" | "listAlertMatchLogs" | "listPlaybackLogs">;
  readonly redactor: Redactor;
  readonly providerStatusSources?: readonly DiagnosticsProviderStatusSource[];
  readonly runtimeLogSource?: DiagnosticsRuntimeLogSource | undefined;
  readonly now?: (() => Date) | undefined;
  readonly defaultLimit?: number | undefined;
  readonly maxLimit?: number | undefined;
}

export interface DiagnosticsListOptions {
  readonly limit?: number | undefined;
}

export interface DiagnosticsEventLogView {
  readonly id: string;
  readonly eventId: string;
  readonly providerId: string;
  readonly eventType: string;
  readonly actorDisplayName: string;
  readonly status: EventLogRecord["status"];
  readonly receivedAt: string;
  readonly correlationId: string;
  readonly processingId: string | null;
  readonly errorMessage: string | null;
}

export type DiagnosticsAlertMatchLogView = AlertMatchLogRecord;

export type DiagnosticsPlaybackLogView = PlaybackLogRecord;

export interface DiagnosticsProviderErrorView {
  readonly id: string;
  readonly providerId: string;
  readonly label: string;
  readonly occurredAt: string;
  readonly message: string;
  readonly correlationId: string | null;
  readonly processingId: string | null;
}

export interface DiagnosticsView {
  readonly eventLogs: readonly DiagnosticsEventLogView[];
  readonly alertMatchLogs: readonly DiagnosticsAlertMatchLogView[];
  readonly playbackLogs: readonly DiagnosticsPlaybackLogView[];
  readonly providerErrors: readonly DiagnosticsProviderErrorView[];
  readonly runtimeLogging: RuntimeLogMetadata | null;
}

export interface DiagnosticsExport extends DiagnosticsView {
  readonly generatedAt: string;
  readonly debugExport: false;
  readonly rawEventLogs: readonly EventLogRecord[];
}

export interface DiagnosticsDebugExport extends DiagnosticsView {
  readonly generatedAt: string;
  readonly debugExport: true;
  readonly rawEventLogs: readonly EventLogRecord[];
  readonly runtimeLogEntries: readonly RuntimeLogEntry[];
  readonly runtimeLogTruncated: boolean;
}

export class DiagnosticsService {
  readonly #repository: Pick<DiagnosticsLogRepository, "listEventLogs" | "listAlertMatchLogs" | "listPlaybackLogs">;
  readonly #redactor: Redactor;
  readonly #providerStatusSources: readonly DiagnosticsProviderStatusSource[];
  readonly #runtimeLogSource: DiagnosticsRuntimeLogSource | null;
  readonly #now: () => Date;
  readonly #defaultLimit: number;
  readonly #maxLimit: number;

  constructor(options: DiagnosticsServiceOptions) {
    this.#repository = options.repository;
    this.#redactor = options.redactor;
    this.#providerStatusSources = options.providerStatusSources ?? [];
    this.#runtimeLogSource = options.runtimeLogSource ?? null;
    this.#now = options.now ?? (() => new Date());
    this.#defaultLimit = options.defaultLimit ?? 50;
    this.#maxLimit = options.maxLimit ?? 200;
  }

  async getDiagnostics(options: DiagnosticsListOptions = {}): Promise<DiagnosticsView> {
    const limit = this.#resolveLimit(options.limit);
    const [eventLogs, alertMatchLogs, playbackLogs] = await this.#readLogs(limit);
    return this.#buildDiagnostics(eventLogs, alertMatchLogs, playbackLogs, await this.#readRuntimeLogMetadata());
  }

  async createExport(options: DiagnosticsListOptions = {}): Promise<DiagnosticsExport> {
    const limit = this.#resolveLimit(options.limit);
    const [eventLogs, alertMatchLogs, playbackLogs] = await this.#readLogs(limit);
    const diagnostics = this.#buildDiagnostics(eventLogs, alertMatchLogs, playbackLogs, await this.#readRuntimeLogMetadata());

    return this.#redactor.redact({
      generatedAt: this.#now().toISOString(),
      debugExport: false,
      ...diagnostics,
      rawEventLogs: eventLogs
    });
  }

  async createDebugExport(
    options: DiagnosticsListOptions & { readonly runtimeLogLimit?: number | undefined; readonly sinceHours?: number | undefined } = {}
  ): Promise<DiagnosticsDebugExport> {
    const limit = this.#resolveLimit(options.limit);
    const runtimeLogLimit = this.#resolveLimit(options.runtimeLogLimit);
    const [eventLogs, alertMatchLogs, playbackLogs] = await this.#readLogs(limit);
    const runtimeLogResult = await this.#readRuntimeLogs(runtimeLogLimit, options.sinceHours);
    const diagnostics = this.#buildDiagnostics(eventLogs, alertMatchLogs, playbackLogs, await this.#readRuntimeLogMetadata());

    return this.#redactor.redact({
      generatedAt: this.#now().toISOString(),
      debugExport: true,
      ...diagnostics,
      rawEventLogs: eventLogs,
      runtimeLogEntries: runtimeLogResult.entries,
      runtimeLogTruncated: runtimeLogResult.truncated
    });
  }

  async #readLogs(
    limit: number
  ): Promise<[readonly EventLogRecord[], readonly AlertMatchLogRecord[], readonly PlaybackLogRecord[]]> {
    return Promise.all([
      this.#repository.listEventLogs({ limit }),
      this.#repository.listAlertMatchLogs({ limit }),
      this.#repository.listPlaybackLogs({ limit })
    ]);
  }

  #buildDiagnostics(
    eventLogs: readonly EventLogRecord[],
    alertMatchLogs: readonly AlertMatchLogRecord[],
    playbackLogs: readonly PlaybackLogRecord[],
    runtimeLogging: RuntimeLogMetadata | null
  ): DiagnosticsView {
    return {
      eventLogs: eventLogs.map((log) => this.#mapEventLog(log)),
      alertMatchLogs,
      playbackLogs: playbackLogs.map((log) => this.#mapPlaybackLog(log)),
      providerErrors: this.#buildProviderErrors(eventLogs),
      runtimeLogging
    };
  }

  #resolveLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return this.#defaultLimit;
    }

    if (!Number.isInteger(limit) || limit <= 0 || limit > this.#maxLimit) {
      throw new DiagnosticsLimitError(this.#maxLimit);
    }

    return limit;
  }

  #mapEventLog(log: EventLogRecord): DiagnosticsEventLogView {
    return {
      id: log.id,
      eventId: log.event.id,
      providerId: log.event.providerId,
      eventType: log.event.type,
      actorDisplayName: log.event.actor.displayName,
      status: log.status,
      receivedAt: log.receivedAt,
      correlationId: log.correlationId,
      processingId: log.processingId,
      errorMessage: log.errorMessage === null ? null : this.#redactor.redactText(log.errorMessage)
    };
  }

  #mapPlaybackLog(log: PlaybackLogRecord): DiagnosticsPlaybackLogView {
    return {
      ...log,
      message: log.message === null ? null : this.#redactor.redactText(log.message)
    };
  }

  #buildProviderErrors(eventLogs: readonly EventLogRecord[]): readonly DiagnosticsProviderErrorView[] {
    const failedEventErrors = eventLogs
      .filter((log) => log.status === "failed")
      .map((log) => ({
        id: `event-log:${log.id}`,
        providerId: log.event.providerId,
        label: `${log.event.providerId} event pipeline`,
        occurredAt: log.receivedAt,
        message: this.#redactor.redactText(log.errorMessage ?? "Provider event processing failed"),
        correlationId: log.correlationId,
        processingId: log.processingId
      }));
    const providerStatusErrors = this.#providerStatusSources
      .map((source) => source.getStatus())
      .filter((status) => status.lastErrorAt !== null || (status.state === "degraded" && status.message !== null))
      .map((status) => ({
        id: `provider-status:${status.providerId}`,
        providerId: status.providerId,
        label: status.label,
        occurredAt: status.lastErrorAt ?? this.#now().toISOString(),
        message: this.#redactor.redactText(status.message ?? "Provider status degraded"),
        correlationId: null,
        processingId: null
      }));

    return [...providerStatusErrors, ...failedEventErrors].sort((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt)
    );
  }

  async #readRuntimeLogMetadata(): Promise<RuntimeLogMetadata | null> {
    return this.#runtimeLogSource === null ? null : this.#runtimeLogSource.getMetadata();
  }

  async #readRuntimeLogs(limit: number, sinceHours: number | undefined): Promise<RuntimeLogReadResult> {
    if (this.#runtimeLogSource === null) {
      return {
        entries: [],
        truncated: false
      };
    }

    return this.#runtimeLogSource.listRecent({
      limit,
      ...(sinceHours === undefined ? {} : { sinceHours })
    });
  }
}

export class DiagnosticsLimitError extends Error {
  constructor(readonly maxLimit: number) {
    super(`Diagnostics limit must be a positive integer no greater than ${maxLimit}`);
    this.name = "DiagnosticsLimitError";
  }
}
