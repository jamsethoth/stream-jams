import type { AlertMatchLogRecord, EventLogRecord, NormalizedStreamEvent, PlaybackLogRecord } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createRedactor } from "../security/redactor.js";
import { DiagnosticsLimitError, DiagnosticsService, type DiagnosticsRuntimeLogSource } from "./diagnostics-service.js";

const followEvent: NormalizedStreamEvent = {
  id: "event-follow-1",
  type: "follow",
  providerId: "twitch",
  sourcePlatform: "twitch",
  ingestProvider: "twitch",
  occurredAt: "2026-05-31T01:59:59.000Z",
  actor: {
    id: "user-1",
    displayName: "Viewer"
  },
  amount: null,
  message: null,
  metadata: {
    callbackUrl: "https://example.test/callback?access_token=oauth-secret&state=public",
    rawProviderPayload: {
      authorization: "Bearer oauth-secret"
    }
  }
};

describe("DiagnosticsService", () => {
  it("returns redacted management-safe diagnostics and provider errors", async () => {
    const repository = new RecordingDiagnosticsRepository({
      eventLogs: [
        {
          id: "event-log-1",
          event: followEvent,
          receivedAt: "2026-05-31T02:00:00.000Z",
          status: "failed",
          correlationId: "correlation-1",
          processingId: "processing-1",
          errorMessage: "Twitch failed with Authorization: Bearer oauth-secret"
        }
      ],
      alertMatchLogs: [
        {
          id: "match-log-1",
          sourceEventId: followEvent.id,
          ruleId: "rule-1",
          variantId: "variant-1",
          matchedAt: "2026-05-31T02:00:01.000Z",
          correlationId: "correlation-1",
          processingId: "processing-1"
        }
      ],
      playbackLogs: [
        {
          id: "playback-log-1",
          queueItemId: "queue-item-1",
          sourceEventId: followEvent.id,
          alertIds: ["resolved-alert-1"],
          status: "failed",
          occurredAt: "2026-05-31T02:00:02.000Z",
          correlationId: "correlation-1",
          processingId: "processing-1",
          message: "Overlay key ovl_secretKey failed"
        }
      ]
    });
    const service = createService(repository, [
      {
        getStatus: () => ({
          providerId: "twitch",
          label: "Twitch EventSub",
          state: "degraded",
          lastErrorAt: "2026-05-31T02:00:03.000Z",
          message: "Reconnect failed with Bearer oauth-secret"
        })
      }
    ]);

    const diagnostics = await service.getDiagnostics({ limit: 10 });
    const exported = await service.createExport({ limit: 10 });

    expect(repository.limits).toEqual([10, 10, 10, 10, 10, 10]);
    expect(diagnostics.runtimeLogging).toBeNull();
    expect(diagnostics.eventLogs).toEqual([
      {
        id: "event-log-1",
        eventId: "event-follow-1",
        providerId: "twitch",
        eventType: "follow",
        actorDisplayName: "Viewer",
        status: "failed",
        receivedAt: "2026-05-31T02:00:00.000Z",
        correlationId: "correlation-1",
        processingId: "processing-1",
        errorMessage: "Twitch failed with Authorization: Bearer [REDACTED]"
      }
    ]);
    expect(diagnostics.playbackLogs[0]?.message).toBe("Overlay key [REDACTED] failed");
    expect(diagnostics.providerErrors).toEqual([
      expect.objectContaining({
        id: "provider-status:twitch",
        message: "Reconnect failed with Bearer [REDACTED]"
      }),
      expect.objectContaining({
        id: "event-log:event-log-1",
        message: "Twitch failed with Authorization: Bearer [REDACTED]"
      })
    ]);
    expect(exported.generatedAt).toBe("2026-05-31T02:05:00.000Z");
    expect(exported.debugExport).toBe(false);
    expect(exported.runtimeLogging).toBeNull();
    expect("runtimeLogEntries" in exported).toBe(false);
    expect(JSON.stringify(exported)).not.toContain("oauth-secret");
    expect(JSON.stringify(exported)).not.toContain("ovl_secretKey");
    expect(exported.rawEventLogs[0]?.event.metadata).toMatchObject({
      callbackUrl: "https://example.test/callback?access_token=%5BREDACTED%5D&state=public",
      rawProviderPayload: {
        authorization: "[REDACTED]"
      }
    });
  });

  it("includes safe log metadata by default and bounded redacted runtime logs only in debug exports", async () => {
    const repository = new RecordingDiagnosticsRepository();
    const runtimeLogSource = new RecordingRuntimeLogSource();
    const service = createService(repository, [], runtimeLogSource);

    const exported = await service.createExport({ limit: 2 });
    const debugExport = await service.createDebugExport({ limit: 2, runtimeLogLimit: 1, sinceHours: 2 });

    expect(exported.runtimeLogging).toEqual(runtimeLogSource.metadata);
    expect(exported.debugExport).toBe(false);
    expect("runtimeLogEntries" in exported).toBe(false);
    expect(debugExport.runtimeLogging).toEqual(runtimeLogSource.metadata);
    expect(debugExport.debugExport).toBe(true);
    expect(debugExport.runtimeLogEntries).toHaveLength(1);
    expect(debugExport.runtimeLogTruncated).toBe(true);
    expect(JSON.stringify(debugExport)).not.toContain("oauth-secret");
    expect(runtimeLogSource.recentRequests).toEqual([{ limit: 1, sinceHours: 2 }]);
  });

  it("uses the default limit and rejects invalid limits", async () => {
    const repository = new RecordingDiagnosticsRepository();
    const service = createService(repository);

    await service.getDiagnostics();
    await expect(service.getDiagnostics({ limit: 0 })).rejects.toThrow(DiagnosticsLimitError);
    await expect(service.createExport({ limit: 201 })).rejects.toThrow(DiagnosticsLimitError);

    expect(repository.limits).toEqual([50, 50, 50]);
  });
});

function createService(
  repository: RecordingDiagnosticsRepository,
  providerStatusSources: ConstructorParameters<typeof DiagnosticsService>[0]["providerStatusSources"] = [],
  runtimeLogSource?: DiagnosticsRuntimeLogSource
): DiagnosticsService {
  return new DiagnosticsService({
    repository,
    redactor: createRedactor(),
    providerStatusSources,
    runtimeLogSource,
    now: () => new Date("2026-05-31T02:05:00.000Z")
  });
}

class RecordingDiagnosticsRepository {
  readonly eventLogs: readonly EventLogRecord[];
  readonly alertMatchLogs: readonly AlertMatchLogRecord[];
  readonly playbackLogs: readonly PlaybackLogRecord[];
  readonly limits: number[] = [];

  constructor(
    records: {
      readonly eventLogs?: readonly EventLogRecord[];
      readonly alertMatchLogs?: readonly AlertMatchLogRecord[];
      readonly playbackLogs?: readonly PlaybackLogRecord[];
    } = {}
  ) {
    this.eventLogs = records.eventLogs ?? [];
    this.alertMatchLogs = records.alertMatchLogs ?? [];
    this.playbackLogs = records.playbackLogs ?? [];
  }

  async listEventLogs(options: { readonly limit?: number } = {}): Promise<readonly EventLogRecord[]> {
    this.#recordLimit(options.limit);
    return this.eventLogs.slice(0, options.limit);
  }

  async listAlertMatchLogs(options: { readonly limit?: number } = {}): Promise<readonly AlertMatchLogRecord[]> {
    this.#recordLimit(options.limit);
    return this.alertMatchLogs.slice(0, options.limit);
  }

  async listPlaybackLogs(options: { readonly limit?: number } = {}): Promise<readonly PlaybackLogRecord[]> {
    this.#recordLimit(options.limit);
    return this.playbackLogs.slice(0, options.limit);
  }

  #recordLimit(limit: number | undefined): void {
    if (limit !== undefined) {
      this.limits.push(limit);
    }
  }
}

class RecordingRuntimeLogSource implements DiagnosticsRuntimeLogSource {
  readonly metadata = {
    logDirectory: "C:/stream-jams/logs",
    level: "INFO" as const,
    rollover: "hourly" as const,
    retentionHours: 48,
    fileCount: 1,
    currentLogFile: "runtime-2026053102.jsonl",
    oldestLogFile: "runtime-2026053102.jsonl",
    newestLogFile: "runtime-2026053102.jsonl"
  };
  readonly recentRequests: Array<{ readonly limit: number; readonly sinceHours?: number | undefined }> = [];

  async getMetadata() {
    return this.metadata;
  }

  async listRecent(options: { readonly limit: number; readonly sinceHours?: number | undefined }) {
    this.recentRequests.push(options);
    return {
      entries: [
        {
          timestamp: "2026-05-31T02:04:00.000Z",
          level: "ERROR" as const,
          event: "provider.failure",
          component: "twitch",
          message: "Provider failed with Bearer oauth-secret",
          correlationId: "correlation-1",
          processingId: null,
          details: {
            authorization: "Bearer oauth-secret"
          }
        }
      ].slice(0, options.limit),
      truncated: true
    };
  }
}
