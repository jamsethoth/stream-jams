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
          ruleId: "alert-follow",
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

  it("builds a redacted diagnostics workspace with correction routes and joined event evidence", async () => {
    const repository = new RecordingDiagnosticsRepository({
      eventLogs: [
        {
          id: "event-log-1",
          event: followEvent,
          receivedAt: "2026-05-31T02:00:00.000Z",
          status: "failed",
          correlationId: "correlation-1",
          processingId: "processing-1",
          errorMessage: "Authorization: Bearer oauth-secret"
        }
      ],
      alertMatchLogs: [
        {
          id: "match-log-1",
          sourceEventId: followEvent.id,
          ruleId: "alert-follow",
          variantId: "variant-1",
          matchedAt: "2026-05-31T02:00:01.000Z",
          correlationId: "correlation-1",
          processingId: "processing-1"
        }
      ],
      playbackLogs: [
        {
          id: "playback-log-1",
          queueItemId: "queue-1",
          sourceEventId: followEvent.id,
          alertIds: ["alert-follow"],
          status: "failed",
          occurredAt: "2026-05-31T02:00:02.000Z",
          correlationId: "correlation-1",
          processingId: "processing-1",
          message: "Overlay route key ovl_secretKey failed"
        },
        {
          id: "playback-log-asset",
          queueItemId: "queue-asset",
          sourceEventId: "event-missing-asset",
          alertIds: ["alert-missing-asset"],
          status: "failed",
          occurredAt: "2026-05-31T02:00:03.000Z",
          correlationId: "correlation-asset",
          processingId: "processing-asset",
          message: "Asset file is missing from local storage"
        }
      ]
    });
    const runtimeLogSource = new RecordingRuntimeLogSource();
    const service = createService(repository, [
      {
        getStatus: () => ({
          providerId: "runtime-secret-store",
          label: "Secret store",
          state: "degraded",
          lastErrorAt: "2026-05-31T02:00:04.000Z",
          message: "Configuration secret store could not be opened"
        })
      }
    ], runtimeLogSource, {
      resolveProviderRegistrationId: async (providerKind) => providerKind === "twitch" ? "provider-twitch-main" : null,
      resolveAlertSetId: async (alertId) => alertId === "alert-follow" ? "set-default" : null
    });

    const workspace = await service.getWorkspace({ limit: 10, runtimeLogLimit: 20, sinceHours: 2 });

    expect(workspace.events).toEqual([
      expect.objectContaining({
        id: "event-log-1",
        outcome: "failed",
        referenceId: "correlation-1",
        matchedRuleIds: ["alert-follow"],
        alertIds: ["alert-follow"],
        playbackStatus: "failed",
        errorMessage: "Authorization: Bearer [REDACTED]",
        correction: {
          label: "Open alert",
          route: "/manage/modules/alerts/editor/alert-follow?set=set-default&diagnostic=correlation-1"
        }
      })
    ]);
    expect(workspace.events[0]?.sanitizedPayload).not.toHaveProperty("metadata");
    expect(workspace.events[0]?.sanitizedPayload).not.toHaveProperty("rawProviderPayload");
    expect(workspace.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "event-log:event-log-1",
          area: "providers",
          referenceId: "correlation-1",
          correction: {
            label: "Open event sources",
            route: "/manage/event-sources?provider=provider-twitch-main&diagnostic=correlation-1"
          }
        }),
        expect.objectContaining({
          id: "playback-log:playback-log-1",
          area: "outputs",
          correction: {
            label: "Open browser sources",
            route: "/manage/modules/alerts?diagnostic=correlation-1#browser-sources"
          }
        }),
        expect.objectContaining({
          id: "playback-log:playback-log-asset",
          area: "assets",
          correction: {
            label: "Open assets",
            route: "/manage/assets?diagnostic=correlation-asset"
          }
        }),
        expect.objectContaining({
          id: "provider-status:runtime-secret-store",
          area: "settings",
          referenceId: null,
          correction: {
            label: "Open settings",
            route: "/manage/settings"
          }
        })
      ])
    );
    expect(workspace.rawLogs[0]).toEqual(
      expect.objectContaining({
        referenceId: "correlation-1",
        message: "Provider failed with Bearer [REDACTED]",
        data: { authorization: "[REDACTED]" },
        correction: {
          label: "Open event sources",
          route: "/manage/event-sources?diagnostic=correlation-1"
        }
      })
    );
    expect(JSON.stringify(workspace)).not.toContain("oauth-secret");
    expect(JSON.stringify(workspace)).not.toContain("ovl_secretKey");
    expect(runtimeLogSource.recentRequests).toEqual([{ limit: 20, sinceHours: 2 }]);
  });

  it("uses the ingest provider registration for Streamer.bot failures", async () => {
    const streamerBotEvent: NormalizedStreamEvent = {
      ...followEvent,
      ingestProvider: "streamerbot"
    };
    const repository = new RecordingDiagnosticsRepository({
      eventLogs: [
        {
          id: "event-log-streamerbot",
          event: streamerBotEvent,
          receivedAt: "2026-05-31T02:00:00.000Z",
          status: "failed",
          correlationId: "correlation-streamerbot",
          processingId: "processing-streamerbot",
          errorMessage: "Streamer.bot event processing failed"
        }
      ]
    });
    const service = createService(repository, [], undefined, {
      resolveProviderRegistrationId: async (providerKind) => providerKind === "streamerbot" ? "provider-streamerbot-main" : null
    });

    const workspace = await service.getWorkspace();

    expect(workspace.events[0]).toEqual(expect.objectContaining({
      providerId: "provider-streamerbot-main",
      providerKind: "streamerbot",
      correction: {
        label: "Open event sources",
        route: "/manage/event-sources?provider=provider-streamerbot-main&diagnostic=correlation-streamerbot"
      }
    }));
    expect(workspace.problems).toContainEqual(expect.objectContaining({
      id: "event-log:event-log-streamerbot",
      correction: {
        label: "Open event sources",
        route: "/manage/event-sources?provider=provider-streamerbot-main&diagnostic=correlation-streamerbot"
      }
    }));
  });

  it("keeps diagnostics available when a historical alert no longer exists", async () => {
    const repository = new RecordingDiagnosticsRepository({
      eventLogs: [
        {
          id: "event-log-deleted-alert",
          event: followEvent,
          receivedAt: "2026-05-31T02:00:00.000Z",
          status: "processed",
          correlationId: "correlation-deleted-alert",
          processingId: "processing-deleted-alert",
          errorMessage: null
        }
      ],
      alertMatchLogs: [
        {
          id: "match-log-deleted-alert",
          sourceEventId: followEvent.id,
          ruleId: "alert-deleted",
          variantId: "variant-deleted",
          matchedAt: "2026-05-31T02:00:01.000Z",
          correlationId: "correlation-deleted-alert",
          processingId: "processing-deleted-alert"
        }
      ]
    });
    const service = createService(repository, [], undefined, {
      resolveAlertSetId: async () => {
        throw new Error("Alert editor document was not found");
      }
    });

    const workspace = await service.getWorkspace();

    expect(workspace.events[0]?.correction).toEqual({
      label: "Open alert",
      route: "/manage/modules/alerts/editor/alert-deleted?diagnostic=correlation-deleted-alert"
    });
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
  runtimeLogSource?: DiagnosticsRuntimeLogSource,
  resolvers: Pick<
    ConstructorParameters<typeof DiagnosticsService>[0],
    "resolveProviderRegistrationId" | "resolveAlertSetId"
  > = {}
): DiagnosticsService {
  return new DiagnosticsService({
    repository,
    redactor: createRedactor(),
    providerStatusSources,
    runtimeLogSource,
    ...resolvers,
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
