import {
  diagnosticsWorkspaceViewSchema,
  type DiagnosticsEventView,
  type DiagnosticsProblemArea,
  type DiagnosticsProblemView,
  type DiagnosticsRawLogView,
  type DiagnosticsWorkspaceView,
  type AlertMatchLogRecord,
  type DiagnosticsLogRepository,
  type EventLogRecord,
  type PlaybackLogRecord,
  type Redactor
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

export interface DiagnosticsWorkspaceOptions extends DiagnosticsListOptions {
  readonly runtimeLogLimit?: number | undefined;
  readonly sinceHours?: number | undefined;
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

  async getWorkspace(options: DiagnosticsWorkspaceOptions = {}): Promise<DiagnosticsWorkspaceView> {
    const limit = this.#resolveLimit(options.limit);
    const runtimeLogLimit = this.#resolveLimit(options.runtimeLogLimit);
    const [eventLogs, alertMatchLogs, playbackLogs] = await this.#readLogs(limit);
    const runtimeLogs = await this.#readRuntimeLogs(runtimeLogLimit, options.sinceHours);
    const diagnostics = this.#buildDiagnostics(eventLogs, alertMatchLogs, playbackLogs, null);
    const redactedRuntimeLogs = runtimeLogs.entries.map((entry) => this.#redactor.redact(entry));

    return diagnosticsWorkspaceViewSchema.parse({
      problems: this.#buildWorkspaceProblems(diagnostics.providerErrors, playbackLogs, redactedRuntimeLogs),
      events: eventLogs.map((log) => this.#mapWorkspaceEvent(log, alertMatchLogs, playbackLogs)),
      rawLogs: redactedRuntimeLogs.map((entry, index) => this.#mapWorkspaceRawLog(entry, index))
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

  #mapWorkspaceEvent(
    log: EventLogRecord,
    alertMatchLogs: readonly AlertMatchLogRecord[],
    playbackLogs: readonly PlaybackLogRecord[]
  ): DiagnosticsEventView {
    const matches = alertMatchLogs.filter((match) => match.sourceEventId === log.event.id);
    const playback = playbackLogs.find((entry) => entry.sourceEventId === log.event.id) ?? null;
    const alertIds = playback?.alertIds ?? [];
    const referenceId = log.correlationId;
    const sanitizedPayload = this.#redactor.redact<Record<string, unknown>>({
      id: log.event.id,
      type: log.event.type,
      providerId: log.event.providerId,
      sourcePlatform: log.event.sourcePlatform,
      ingestProvider: log.event.ingestProvider,
      occurredAt: log.event.occurredAt,
      actor: log.event.actor,
      amount: log.event.amount,
      message: log.event.message,
      test: log.event.metadata.test === true
    });

    return {
      id: log.id,
      providerId: log.event.providerId,
      providerKind: log.event.ingestProvider,
      eventType: log.event.type,
      occurredAt: log.event.occurredAt,
      outcome: playback?.status === "failed" ? "failed" : log.status,
      test: log.event.metadata.test === true,
      referenceId,
      processingId: log.processingId,
      actorDisplayName: log.event.actor.displayName,
      alertIds: [...alertIds],
      matchedRuleIds: matches.map((match) => match.ruleId),
      playbackStatus: playback?.status ?? null,
      errorMessage: log.errorMessage === null ? null : this.#redactor.redactText(log.errorMessage),
      sanitizedPayload,
      correction: alertIds[0] === undefined
        ? providerCorrection(log.event.ingestProvider, referenceId)
        : alertCorrection(alertIds[0], referenceId)
    };
  }

  #buildWorkspaceProblems(
    providerErrors: readonly DiagnosticsProviderErrorView[],
    playbackLogs: readonly PlaybackLogRecord[],
    runtimeLogs: readonly RuntimeLogEntry[]
  ): readonly DiagnosticsProblemView[] {
    const providerProblems = providerErrors.map((error) => {
      const referenceId = error.correlationId;
      const correction = providerCorrection(error.providerId, referenceId);
      return {
        id: error.id,
        area: correctionArea(correction, "providers"),
        summary: error.label,
        cause: error.message,
        nextStep: nextStepForArea(correctionArea(correction, "providers")),
        severity: "error" as const,
        occurredAt: error.occurredAt,
        referenceId,
        correction
      };
    });
    const playbackProblems = playbackLogs
      .filter((log) => log.status === "failed")
      .map((log) => {
        const correction = correctionForEvidence(log.message ?? "", log.correlationId, log.alertIds[0]);
        const area = correctionArea(correction, log.alertIds.length > 0 ? "alerts" : "runtime");
        return {
          id: `playback-log:${log.id}`,
          area,
          summary: "Alert playback failed",
          cause: log.message === null ? null : this.#redactor.redactText(log.message),
          nextStep: nextStepForArea(area),
          severity: "error" as const,
          occurredAt: log.occurredAt,
          referenceId: log.correlationId,
          correction
        };
      });
    const runtimeProblems = runtimeLogs
      .filter((entry) => entry.level === "ERROR")
      .map((entry, index) => {
        const referenceId = entry.correlationId === "" ? null : entry.correlationId;
        const correction = correctionForEvidence(`${entry.component} ${entry.event} ${entry.message}`, referenceId);
        const area = correctionArea(correction, "runtime");
        return {
          id: `runtime-log:${entry.timestamp}:${entry.component}:${entry.event}:${index}`,
          area,
          summary: entry.message,
          cause: `${entry.component} reported ${entry.event}.`,
          nextStep: nextStepForArea(area),
          severity: "error" as const,
          occurredAt: entry.timestamp,
          referenceId,
          correction
        };
      });

    return [...providerProblems, ...playbackProblems, ...runtimeProblems].sort((left, right) =>
      (right.occurredAt ?? "").localeCompare(left.occurredAt ?? "")
    );
  }

  #mapWorkspaceRawLog(entry: RuntimeLogEntry, index: number): DiagnosticsRawLogView {
    const referenceId = entry.correlationId === "" ? null : entry.correlationId;
    return {
      id: `runtime-log:${entry.timestamp}:${entry.component}:${entry.event}:${index}`,
      timestamp: entry.timestamp,
      level: entry.level,
      component: entry.component,
      event: entry.event,
      referenceId,
      processingId: entry.processingId,
      message: entry.message,
      data: entry.details ?? {},
      correction: correctionForEvidence(`${entry.component} ${entry.event} ${entry.message}`, referenceId)
    };
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

function providerCorrection(providerId: string, referenceId: string | null) {
  const normalized = providerId.toLowerCase();
  if (normalized.includes("secret") || normalized.includes("config") || normalized.includes("database")) {
    return correction("Open settings", "/settings", referenceId);
  }
  if (normalized.includes("speaker") || normalized.includes("tts")) {
    return correction("Open TTS providers", "/tts-providers", referenceId);
  }
  return correction("Open event sources", "/event-sources", referenceId);
}

function alertCorrection(alertId: string, referenceId: string | null) {
  return correction("Open alert", `/modules/alerts/editor/${encodeURIComponent(alertId)}`, referenceId);
}

function correctionForEvidence(message: string, referenceId: string | null, alertId?: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("asset") || normalized.includes("media file")) {
    return correction("Open assets", "/assets", referenceId);
  }
  if (
    normalized.includes("overlay") ||
    normalized.includes("route key") ||
    normalized.includes("browser source") ||
    normalized.includes("no client")
  ) {
    return correction("Open browser sources", "/modules/alerts#browser-sources", referenceId);
  }
  if (normalized.includes("speaker") || normalized.includes("tts")) {
    return correction("Open TTS providers", "/tts-providers", referenceId);
  }
  if (normalized.includes("twitch") || normalized.includes("eventsub") || normalized.includes("streamerbot") || normalized.includes("provider")) {
    return correction("Open event sources", "/event-sources", referenceId);
  }
  if (normalized.includes("setting") || normalized.includes("config") || normalized.includes("database") || normalized.includes("secret")) {
    return correction("Open settings", "/settings", referenceId);
  }
  return alertId === undefined ? null : alertCorrection(alertId, referenceId);
}

function correction(label: string, route: string, referenceId: string | null) {
  if (referenceId === null) {
    return { label, route };
  }
  const hashIndex = route.indexOf("#");
  const path = hashIndex === -1 ? route : route.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : route.slice(hashIndex);
  const separator = path.includes("?") ? "&" : "?";
  return { label, route: `${path}${separator}diagnostic=${encodeURIComponent(referenceId)}${hash}` };
}

function correctionArea(
  target: { readonly route: string } | null,
  fallback: DiagnosticsProblemArea
): DiagnosticsProblemArea {
  if (target === null) return fallback;
  if (target.route.startsWith("/event-sources") || target.route.startsWith("/tts-providers")) return "providers";
  if (target.route.startsWith("/modules/alerts/editor")) return "alerts";
  if (target.route.startsWith("/assets")) return "assets";
  if (target.route.includes("browser-sources")) return "outputs";
  if (target.route.startsWith("/settings")) return "settings";
  return fallback;
}

function nextStepForArea(area: DiagnosticsProblemArea): string {
  switch (area) {
    case "providers":
      return "Review the provider connection and reconnect it before retrying.";
    case "alerts":
      return "Review the alert configuration and test it again.";
    case "assets":
      return "Review the linked asset and replace or repair it.";
    case "outputs":
      return "Review the browser-source output and reconnect the client.";
    case "settings":
      return "Review the related local setting and retry the operation.";
    case "runtime":
      return "Review the raw log entry and retry the operation after correcting the reported cause.";
  }
}

export class DiagnosticsLimitError extends Error {
  constructor(readonly maxLimit: number) {
    super(`Diagnostics limit must be a positive integer no greater than ${maxLimit}`);
    this.name = "DiagnosticsLimitError";
  }
}
