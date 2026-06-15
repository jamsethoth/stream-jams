import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DefaultAlertService,
  DefaultAssetValidator,
  DefaultMediaImportPipeline,
  DefaultOverlayModuleConfigService,
  DefaultOverlayCompositionService,
  DefaultAlertMatcher,
  DefaultAlertResolver,
  DefaultPlaybackCooldownService,
  DefaultPlaybackDedupeService,
  DefaultPlaybackQueue,
  NoopMediaTranscodingStage,
  DefaultModerationService,
  DefaultTtsService
} from "@stream-jams/core";
import { createServerApp } from "./app.js";
import { createDefaultAppConfig, resolveConfigFilePath } from "./config/default-config.js";
import { FileConfigStore } from "./config/file-config-store.js";
import { ServerConfigService } from "./config/server-config-service.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "./http/middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "./http/middleware/management-auth.js";
import { LocalManagementSessionService } from "./modules/auth/management-session-service.js";
import { SqliteAlertRepository } from "./modules/alerts/sqlite-alert-repository.js";
import { LocalAssetStore } from "./modules/assets/local-asset-store.js";
import { EventIngestionService } from "./modules/events/event-ingestion-service.js";
import { EventPipeline } from "./modules/events/event-pipeline.js";
import { openStreamJamsDatabase } from "./modules/db/database.js";
import { DiagnosticsService } from "./modules/diagnostics/diagnostics-service.js";
import { SqliteDiagnosticsLogRepository } from "./modules/diagnostics/sqlite-log-repository.js";
import { InMemoryServerOverlayModuleConfigRepository } from "./modules/overlay-modules/in-memory-module-config-repository.js";
import { SqliteAssetRepository } from "./modules/assets/sqlite-asset-repository.js";
import { createStaticOverlayModuleRegistry } from "./modules/overlay-modules/static-module-registry.js";
import { LocalOverlayAccessService } from "./modules/overlays/overlay-access-service.js";
import { SqliteOverlayAccessKeyRepository } from "./modules/overlays/sqlite-overlay-access-key-repository.js";
import { PlaybackCoordinator } from "./modules/playback/playback-coordinator.js";
import { DevSecretStore } from "./modules/security/dev-secret-store.js";
import { createRedactor } from "./modules/security/redactor.js";
import { DefaultTwitchApiClient } from "./modules/twitch/twitch-api-client.js";
import {
  DefaultTwitchEventSubApiClient,
  TwitchEventSubClient,
  type TwitchEventSubSocket
} from "./modules/twitch/twitch-eventsub-client.js";
import { TwitchEventSubRuntimeService, type TwitchEventSubRuntimeState } from "./modules/twitch/twitch-eventsub-runtime-service.js";
import { TwitchOAuthService } from "./modules/twitch/twitch-oauth-service.js";
import { SqliteTwitchAccountRepository } from "./modules/twitch/sqlite-twitch-account-repository.js";
import { createDefaultTtsProviderRegistry } from "./modules/tts/tts-provider-registry.js";
import { findSuggestedPorts, NodePortAvailabilityChecker } from "./server/port-availability.js";
import { OverlayGateway } from "./websocket/overlay-gateway.js";
import { startServer } from "./server/start-server.js";

const homeDirectory = homedir();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const webBuildDirectory = resolve(currentDirectory, "../../web/dist");
const portAvailability = new NodePortAvailabilityChecker();
const configStore = new FileConfigStore({
  configFilePath: resolveConfigFilePath(homeDirectory),
  defaultConfig: createDefaultAppConfig(homeDirectory)
});
const initialConfig = await configStore.readConfig();
const database = openStreamJamsDatabase(join(initialConfig.storage.dataDirectory, "stream-jams.sqlite"));
const diagnosticsLogRepository = new SqliteDiagnosticsLogRepository(database.connection);
const alertRepository = new SqliteAlertRepository(database.connection);
const alertService = new DefaultAlertService({
  repository: alertRepository,
  generateId: generateAlertConfigurationId
});
const assetRepository = new SqliteAssetRepository(database.connection);
const twitchAccountRepository = new SqliteTwitchAccountRepository(database.connection);
const assetStore = new LocalAssetStore({ assetDirectory: initialConfig.storage.assetDirectory });
const mediaImportPipeline = new DefaultMediaImportPipeline({
  validator: new DefaultAssetValidator(),
  repository: assetRepository,
  store: assetStore,
  transcoder: new NoopMediaTranscodingStage(),
  generateId: generateAssetId,
  calculateChecksum
});
const serverConfigService = new ServerConfigService({
  configStore,
  portAvailability
});
const managementSessionService = new LocalManagementSessionService();
const managementRateLimiter = new LocalManagementRateLimiter({
  maxRequests: 120,
  windowMs: 60_000
});
const overlayModuleRegistry = createStaticOverlayModuleRegistry();
const overlayModuleConfigService = new DefaultOverlayModuleConfigService({
  registry: overlayModuleRegistry,
  repository: new InMemoryServerOverlayModuleConfigRepository()
});
const overlayAccessService = new LocalOverlayAccessService({
  repository: new SqliteOverlayAccessKeyRepository(database.connection)
});
const secretStore = new DevSecretStore({ mode: "development" });
const moderationService = new DefaultModerationService();
const ttsProviderRegistry = createDefaultTtsProviderRegistry();
const ttsService = new DefaultTtsService({
  registry: ttsProviderRegistry,
  moderationService
});
const twitchApiClient = new DefaultTwitchApiClient();
const overlayGateway = new OverlayGateway({
  overlayAccessService,
  generateClientId: generateOverlayClientId,
  onPlaybackReport(report) {
    if (report.status === "completed" || report.status === "failed") {
      playbackCoordinator.completeCurrent();
    }
  }
});
const playbackQueue = new DefaultPlaybackQueue({
  generateId: generatePlaybackQueueItemId
});
const playbackCoordinator = new PlaybackCoordinator({
  alertService,
  matcher: new DefaultAlertMatcher(),
  resolver: new DefaultAlertResolver({
    generateId: generateResolvedAlertId,
    moderationService
  }),
  queue: playbackQueue,
  cooldownService: new DefaultPlaybackCooldownService(),
  dedupeService: new DefaultPlaybackDedupeService(),
  defaultTarget: {
    overlayId: "default",
    purpose: "live",
    scope: "module"
  },
  additionalTargets: [
    {
      overlayId: "default",
      purpose: "live",
      scope: "unified"
    }
  ],
  assetRepository,
  overlayPlaybackSink: overlayGateway
});
const eventPipeline = new EventPipeline({
  playbackCoordinator,
  diagnosticsLogRepository,
  generateId: generateEventPipelineId
});
const eventIngestionService = new EventIngestionService({
  sink: eventPipeline
});
const twitchEventSubClient = new TwitchEventSubClient({
  apiClient: new DefaultTwitchEventSubApiClient(),
  socketFactory: createNodeWebSocket,
  onNotification: async (message) => {
    await eventIngestionService.ingestTwitchEventSubNotification(message);
  }
});
const twitchEventSubRuntimeService = new TwitchEventSubRuntimeService({
  accountRepository: twitchAccountRepository,
  clientId: process.env.TWITCH_CLIENT_ID ?? "",
  eventSubClient: twitchEventSubClient,
  ingestionService: eventIngestionService,
  secretStore
});
const twitchAuthService = new TwitchOAuthService({
  apiClient: twitchApiClient,
  clientId: process.env.TWITCH_CLIENT_ID ?? "",
  clientSecret: process.env.TWITCH_CLIENT_SECRET ?? "",
  generateState: () => randomBytes(24).toString("base64url"),
  onConnectionChanged: async () => {
    await twitchEventSubRuntimeService.connectStoredAccount();
  },
  repository: twitchAccountRepository,
  secretStore
});
const diagnosticsService = new DiagnosticsService({
  repository: diagnosticsLogRepository,
  redactor: createRedactor(),
  providerStatusSources: [
    {
      getStatus() {
        const status = twitchEventSubRuntimeService.getStatus();
        return {
          providerId: "twitch",
          label: "Twitch EventSub",
          state: toDiagnosticsProviderState(status.state),
          lastErrorAt: status.lastErrorAt,
          message: status.message
        };
      }
    }
  ]
});
const overlayCompositionService = new DefaultOverlayCompositionService({
  configService: overlayModuleConfigService,
  runtime: {
    async getModuleSnapshot(request) {
      const current = playbackQueue.getSnapshot().current;
      const instructions = current === null
        ? []
        : current.alerts
            .map((alert) => alert.overlayInstruction)
            .filter(
              (instruction) =>
                instruction.overlayId === request.overlayId &&
                instruction.moduleId === request.moduleId &&
                instruction.purpose === request.purpose &&
                instruction.scope === request.scope
            );

      return {
        moduleId: request.moduleId,
        enabled: true,
        instructions
      };
    }
  }
});

try {
  const result = await startServer({
    configStore,
    createApp: () =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "0.0.0"
        },
        webBuildDirectory,
        managementSessionService,
        serverConfigService,
        overlayModuleRegistry,
        overlayModuleConfigService,
        moderationService,
        ttsService,
        twitchAuthService,
        twitchEventSubStatusService: twitchEventSubRuntimeService,
        diagnosticsService,
        overlayAccessService,
        overlayCompositionService,
        overlayGateway,
        alertService,
        assetRepository,
        mediaImportPipeline,
        assetStore,
        playbackCoordinator,
        managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
        managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter }),
        serverErrorLogger(entry) {
          console.error(
            `[${entry.errorId}] ${entry.code} ${entry.method} ${entry.url} request=${entry.requestId} status=${entry.statusCode}`,
            entry.error
          );
        }
      }),
    suggestPorts: (host, port) =>
      findSuggestedPorts({
        host,
        preferredPort: port,
        portAvailability
      })
  });

  if (result.status === "started") {
    await twitchEventSubRuntimeService.connectStoredAccount();
    console.info(`Stream Jams server listening on ${result.url}`);
  } else {
    console.error(
      `${result.error.message}. Suggested alternate ports: ${formatSuggestedPorts(result.error.suggestedPorts)}`
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function formatSuggestedPorts(ports: readonly number[]): string {
  return ports.length > 0 ? ports.join(", ") : "none found";
}

function toDiagnosticsProviderState(state: TwitchEventSubRuntimeState): "idle" | "ready" | "degraded" {
  switch (state) {
    case "connected":
      return "ready";
    case "idle":
    case "connecting":
      return "idle";
    case "reconnecting":
    case "degraded":
    case "error":
      return "degraded";
  }
}

interface NodeWebSocketConstructor {
  new (url: string): TwitchEventSubSocket;
}

function createNodeWebSocket(url: string): TwitchEventSubSocket {
  const WebSocketConstructor = (globalThis as typeof globalThis & { readonly WebSocket?: NodeWebSocketConstructor }).WebSocket;
  if (WebSocketConstructor === undefined) {
    throw new Error("Global WebSocket runtime is unavailable");
  }

  return new WebSocketConstructor(url);
}

function generateAlertConfigurationId(kind: "collection" | "rule" | "variant"): string {
  return `alert_${kind}_${randomBytes(16).toString("base64url")}`;
}

function generateAssetId(): string {
  return `asset_${randomBytes(16).toString("base64url")}`;
}

function generateResolvedAlertId(kind: "resolved-alert" | "overlay-instruction"): string {
  return `playback_${kind}_${randomBytes(16).toString("base64url")}`;
}

function generateEventPipelineId(kind: "event-log" | "alert-match-log" | "playback-log" | "processing"): string {
  return `event_pipeline_${kind}_${randomBytes(16).toString("base64url")}`;
}

function generatePlaybackQueueItemId(): string {
  return `playback_item_${randomBytes(16).toString("base64url")}`;
}

function generateOverlayClientId(): string {
  return "overlay_client_" + randomBytes(16).toString("base64url");
}

function calculateChecksum(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
