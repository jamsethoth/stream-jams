import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  DefaultAlertMatcher,
  DefaultAlertResolver,
  DefaultAlertService,
  DefaultAssetValidator,
  DefaultMediaImportPipeline,
  DefaultModerationService,
  DefaultOverlayCompositionService,
  DefaultOverlayModuleConfigService,
  DefaultPlaybackCooldownService,
  DefaultPlaybackDedupeService,
  DefaultPlaybackQueue,
  DefaultTtsService,
  NoopMediaTranscodingStage,
  createDefaultOverlayModuleRegistry,
  type ConfigStore,
  type AlertBrowserSourceView,
  type ProviderKind,
  type SecretStore
} from "@stream-jams/core";
import type { FastifyInstance } from "fastify";
import { createServerApp } from "../app.js";
import { createDefaultAppConfig, resolveConfigFilePath } from "../config/default-config.js";
import { FileConfigStore } from "../config/file-config-store.js";
import { ServerConfigService } from "../config/server-config-service.js";
import {
  createLocalManagementRateLimitPreHandler,
  LocalManagementRateLimiter
} from "../http/middleware/local-management-rate-limit.js";
import {
  createLocalManagementOriginPolicy,
  createManagementOriginPreHandler,
  createManagementSecurityPreHandler,
  registerManagementCorsPreflightRoute
} from "../http/middleware/management-security.js";
import { SqliteAlertRepository } from "../modules/alerts/sqlite-alert-repository.js";
import { AlertSetManagementService } from "../modules/alerts/alert-set-management-service.js";
import { SqliteAlertSetMetadataRepository } from "../modules/alerts/sqlite-alert-set-metadata-repository.js";
import { LocalManagementSessionService } from "../modules/auth/management-session-service.js";
import { LocalAssetStore } from "../modules/assets/local-asset-store.js";
import { SqliteAssetRepository } from "../modules/assets/sqlite-asset-repository.js";
import { AssetLibraryService } from "../modules/assets/asset-library-service.js";
import { SqliteAssetLibraryMetadataRepository } from "../modules/assets/sqlite-asset-library-metadata-repository.js";
import { openStreamJamsDatabase, type StreamJamsDatabase } from "../modules/db/database.js";
import { DiagnosticsService } from "../modules/diagnostics/diagnostics-service.js";
import { LogConfigService } from "../modules/diagnostics/log-config-service.js";
import { RuntimeJsonlLogger } from "../modules/diagnostics/runtime-jsonl-logger.js";
import { SqliteDiagnosticsLogRepository } from "../modules/diagnostics/sqlite-log-repository.js";
import { EventIngestionService } from "../modules/events/event-ingestion-service.js";
import { EventPipeline } from "../modules/events/event-pipeline.js";
import { SqliteOverlayModuleConfigRepository } from "../modules/overlay-modules/sqlite-module-config-repository.js";
import { LocalOverlayAccessService } from "../modules/overlays/overlay-access-service.js";
import {
  createOverlayRouteKeySecretRef,
  OverlayOutputManagementService
} from "../modules/overlays/overlay-output-management-service.js";
import { SqliteOverlayAccessKeyRepository } from "../modules/overlays/sqlite-overlay-access-key-repository.js";
import { PlaybackCoordinator } from "../modules/playback/playback-coordinator.js";
import { ManagementUiService } from "../modules/providers/management-ui-service.js";
import {
  createProviderManagementAdapters,
  type SpeakerBotSocket
} from "../modules/providers/provider-management-adapters.js";
import { ProviderManagementService } from "../modules/providers/provider-management-service.js";
import { SqliteProviderRegistrationRepository } from "../modules/providers/sqlite-provider-registration-repository.js";
import type { OsCredentialAdapter } from "../modules/security/os-secret-store.js";
import { createRedactor } from "../modules/security/redactor.js";
import {
  createRuntimeSecretStore,
  type RuntimeSecretStoreStatus
} from "../modules/security/runtime-secret-store.js";
import { createDefaultTtsProviderRegistry } from "../modules/tts/tts-provider-registry.js";
import { DefaultTwitchApiClient, type TwitchApiClient } from "../modules/twitch/twitch-api-client.js";
import {
  DefaultTwitchEventSubApiClient,
  TwitchEventSubClient,
  type TwitchEventSubApiClient,
  type TwitchEventSubSocket
} from "../modules/twitch/twitch-eventsub-client.js";
import { TwitchEventSubRuntimeService, type TwitchEventSubRuntimeState } from "../modules/twitch/twitch-eventsub-runtime-service.js";
import { TwitchOAuthService } from "../modules/twitch/twitch-oauth-service.js";
import { SqliteTwitchAccountRepository } from "../modules/twitch/sqlite-twitch-account-repository.js";
import { NodePortAvailabilityChecker, type PortAvailabilityChecker } from "../server/port-availability.js";
import { OverlayGateway } from "../websocket/overlay-gateway.js";

export interface RuntimeAppCompositionOptions {
  readonly homeDirectory: string;
  readonly webBuildDirectory: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly credentialAdapter?: OsCredentialAdapter;
  readonly configStore?: ConfigStore;
  readonly portAvailability?: PortAvailabilityChecker;
  readonly secretStore?: SecretStore;
  readonly twitchApiClient?: TwitchApiClient;
  readonly twitchEventSubApiClient?: TwitchEventSubApiClient;
  readonly twitchEventSubSocketFactory?: (url: string) => TwitchEventSubSocket;
  readonly now?: () => Date;
  readonly generateManagementSessionId?: () => string;
  readonly generateManagementCsrfToken?: () => string;
  readonly generateOverlayAccessKeyId?: () => string;
  readonly generateRawOverlayRouteKey?: () => string;
  readonly generateOverlayClientId?: () => string;
}

export interface RuntimeAppComposition {
  readonly app: FastifyInstance;
  readonly configStore: ConfigStore;
  readonly database: StreamJamsDatabase;
  readonly managementSessionService: LocalManagementSessionService;
  readonly overlayAccessService: LocalOverlayAccessService;
  readonly runtimeSecretStoreStatus: RuntimeSecretStoreStatus;
  readonly twitchEventSubRuntimeService: TwitchEventSubRuntimeService;
  close(): Promise<void>;
}

export async function createRuntimeAppComposition(options: RuntimeAppCompositionOptions): Promise<RuntimeAppComposition> {
  const environment = options.environment ?? process.env;
  const now = options.now ?? (() => new Date());
  const portAvailability = options.portAvailability ?? new NodePortAvailabilityChecker();
  const configStore =
    options.configStore ??
    new FileConfigStore({
      configFilePath: resolveConfigFilePath(options.homeDirectory, { environment }),
      defaultConfig: createDefaultAppConfig(options.homeDirectory)
    });
  const initialConfig = await configStore.readConfig();
  const logConfigService = new LogConfigService(configStore);
  const logSettings = await logConfigService.getSettings();
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
  const managementSessionService = new LocalManagementSessionService({
    clock: now,
    ...(options.generateManagementSessionId === undefined ? {} : { generateId: options.generateManagementSessionId }),
    ...(options.generateManagementCsrfToken === undefined ? {} : { generateCsrfToken: options.generateManagementCsrfToken })
  });
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: 120,
    windowMs: 60_000
  });
  const managementOriginPolicy = createLocalManagementOriginPolicy({
    host: initialConfig.server.host,
    port: initialConfig.server.port,
    environment
  });
  const managementOriginPreHandler = createManagementOriginPreHandler(managementOriginPolicy);
  const overlayModuleRegistry = createDefaultOverlayModuleRegistry();
  const overlayModuleConfigService = new DefaultOverlayModuleConfigService({
    registry: overlayModuleRegistry,
    repository: new SqliteOverlayModuleConfigRepository(database.connection),
    clock: now
  });
  const overlayKeyRepository = new SqliteOverlayAccessKeyRepository(database.connection);
  const overlayAccessService = new LocalOverlayAccessService({
    repository: overlayKeyRepository,
    clock: now,
    ...(options.generateOverlayAccessKeyId === undefined ? {} : { generateId: options.generateOverlayAccessKeyId }),
    ...(options.generateRawOverlayRouteKey === undefined ? {} : { generateRawKey: options.generateRawOverlayRouteKey }),
    createRouteKeySecretRef: createOverlayRouteKeySecretRef
  });
  const runtimeSecretStore = await createRuntimeSecretStore({
    ...(options.secretStore === undefined ? {} : { secretStore: options.secretStore }),
    ...(options.credentialAdapter === undefined ? {} : { credentials: options.credentialAdapter }),
    now
  });
  const secretStore = runtimeSecretStore.secretStore;
  const redactor = createRedactor();
  const runtimeLogger = new RuntimeJsonlLogger({
    logDirectory: join(initialConfig.storage.dataDirectory, "logs"),
    settings: logSettings,
    redactor,
    now
  });
  const overlayOutputManagementService = new OverlayOutputManagementService({
    overlayAccessService,
    overlayKeyRepository,
    overlayModuleRegistry,
    overlayModuleConfigService,
    secretStore
  });
  const moderationService = new DefaultModerationService();
  const ttsProviderRegistry = createDefaultTtsProviderRegistry();
  const ttsService = new DefaultTtsService({
    registry: ttsProviderRegistry,
    moderationService
  });
  const twitchApiClient = options.twitchApiClient ?? new DefaultTwitchApiClient();
  const overlayGateway = new OverlayGateway({
    overlayAccessService,
    generateClientId: options.generateOverlayClientId ?? generateOverlayClientId,
    clock: now,
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
    apiClient: options.twitchEventSubApiClient ?? new DefaultTwitchEventSubApiClient(),
    socketFactory: options.twitchEventSubSocketFactory ?? createNodeWebSocket,
    onNotification: async (message) => {
      await eventIngestionService.ingestTwitchEventSubNotification(message);
    },
    now
  });
  const twitchEventSubRuntimeService = new TwitchEventSubRuntimeService({
    accountRepository: twitchAccountRepository,
    clientId: environment.TWITCH_CLIENT_ID ?? "",
    eventSubClient: twitchEventSubClient,
    ingestionService: eventIngestionService,
    now,
    secretStore
  });
  const twitchAuthService = new TwitchOAuthService({
    apiClient: twitchApiClient,
    clientId: environment.TWITCH_CLIENT_ID ?? "",
    clientSecret: environment.TWITCH_CLIENT_SECRET ?? "",
    generateState: () => randomBytes(24).toString("base64url"),
    onConnectionChanged: async () => {
      await twitchEventSubRuntimeService.connectStoredAccount();
    },
    repository: twitchAccountRepository,
    secretStore,
    assertSecretStoreAvailable: runtimeSecretStore.assertAvailable
  });
  const diagnosticsService = new DiagnosticsService({
    repository: diagnosticsLogRepository,
    redactor,
    runtimeLogSource: runtimeLogger,
    providerStatusSources: [
      {
        getStatus() {
          const status = runtimeSecretStore.status;
          return {
            providerId: "runtime-secret-store",
            label: "Runtime secret store",
            state: status.state,
            lastErrorAt: status.lastErrorAt,
            message: status.message
          };
        }
      },
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
    ],
    now
  });
  const providerRegistrationRepository = new SqliteProviderRegistrationRepository(database.connection);
  const providerManagementService = new ProviderManagementService({
    repository: providerRegistrationRepository,
    adapters: createProviderManagementAdapters({
      twitchOAuthService: twitchAuthService,
      twitchEventSubRuntimeService,
      streamerBotSocketFactory: createNodeProviderWebSocket,
      speakerBotSocketFactory: createNodeProviderWebSocket,
      ttsService,
      now
    }),
    secretStore,
    async getActivationImpact(providerId) {
      const target = await providerRegistrationRepository.findById(providerId);
      if (target === null) {
        return { matchedAlertCount: 0, unmatchedAlertCount: 0, blockers: [], warnings: [] };
      }
      const activeRules = await alertService.listActiveRules();
      const affectedAlertCount =
        target.provider.capability === "event-source"
          ? activeRules.length
          : activeRules.filter((rule) => rule.variants.some((variant) => variant.enabled && variant.ttsConfig !== null)).length;
      const current = await providerRegistrationRepository.findActive(target.provider.capability);
      const changesProviderKind =
        current !== null && current.provider.id !== target.provider.id && current.provider.kind !== target.provider.kind;
      if (!changesProviderKind || affectedAlertCount === 0) {
        return { matchedAlertCount: affectedAlertCount, unmatchedAlertCount: 0, blockers: [], warnings: [] };
      }
      return {
        matchedAlertCount: 0,
        unmatchedAlertCount: affectedAlertCount,
        blockers: [],
        warnings: [
          {
            summary: "Active alerts use a different provider kind",
            cause: `${affectedAlertCount} active alert${affectedAlertCount === 1 ? "" : "s"} currently use ${current.provider.name}.`,
            nextStep: `Confirm the switch to ${target.provider.name}, then review affected alerts before going live.`,
            severity: "warning",
            occurredAt: now().toISOString(),
            referenceId: null,
            correction: { label: "Review active alerts", route: "/modules/alerts" }
          }
        ]
      };
    },
    async getUsedByAlertCount(kind: ProviderKind) {
      const activeRules = await alertService.listActiveRules();
      return kind === "speakerbot" || kind === "browser-speech"
        ? activeRules.filter((rule) => rule.variants.some((variant) => variant.enabled && variant.ttsConfig !== null)).length
        : activeRules.length;
    },
    generateId: () => `provider_${randomBytes(16).toString("base64url")}`,
    generateReferenceId: () => `ref_${randomBytes(12).toString("base64url")}`,
    now
  });
  const alertSetMetadataRepository = new SqliteAlertSetMetadataRepository(database.connection);
  const alertSetManagementService = new AlertSetManagementService({
    alertService,
    metadataRepository: alertSetMetadataRepository,
    async getActiveEventProviderKind() {
      const providers = await providerManagementService.listProviders("event-source");
      return providers.find((provider) => provider.active)?.kind ?? null;
    },
    async listBrowserSources(): Promise<readonly AlertBrowserSourceView[]> {
      const origin = `http://${initialConfig.server.host}:${initialConfig.server.port}`;
      const outputs = await overlayOutputManagementService.listOutputs(origin);
      return outputs
        .filter(
          (output) =>
            output.scope === "module" &&
            output.moduleId === "alerts" &&
            (output.targetProfileId === "landscape" || output.targetProfileId === "vertical")
        )
        .map((output) => {
          const states = overlayGateway.clientStates
            .filter(
              (client) =>
                client.scope === output.scope &&
                client.moduleId === output.moduleId &&
                client.overlayId === output.overlayId &&
                client.purpose === output.purpose &&
                client.targetProfileId === output.targetProfileId
            )
            .sort((left, right) => right.connectedAt.localeCompare(left.connectedAt));
          const connected = states.some((client) => client.connectionState === "connected");
          const latest = states[0] ?? null;
          return {
            id: output.id,
            targetProfileId: output.targetProfileId as "landscape" | "vertical",
            purpose: output.purpose,
            connectionState: connected ? "connected" : latest === null ? "never-connected" : "disconnected",
            lastConnectedAt: latest?.connectedAt ?? null,
            keyId: output.keyId,
            url: output.url,
            copyableUrlStatus: output.copyableUrlStatus
          };
        });
    }
  });
  const assetLibraryService = new AssetLibraryService({
    assetRepository,
    metadataRepository: new SqliteAssetLibraryMetadataRepository(database.connection),
    assetStore,
    alertRepository,
    ruleMetadataRepository: alertSetMetadataRepository,
    clock: now
  });
  const managementUiService = new ManagementUiService({
    providerService: providerManagementService,
    alertSetService: alertSetManagementService,
    hasBrowserOutput: async () =>
      (await overlayOutputManagementService.listOutputs(`http://${initialConfig.server.host}:${initialConfig.server.port}`)).some(
        (output) =>
          output.moduleId === "alerts" &&
          (output.targetProfileId === "landscape" || output.targetProfileId === "vertical") &&
          output.copyableUrlStatus === "available"
      ),
    getAlertEditorDocument: async (alertId) => {
      throw new Error(`Alert editor document "${alertId}" is not available yet`);
    },
    listAssetLibraryItems: () => assetLibraryService.listItems(),
    updateAssetMetadata: (assetId, input) => assetLibraryService.updateMetadata(assetId, input),
    getAssetChangeImpact: (assetId, candidateMediaType) =>
      assetLibraryService.getChangeImpact(assetId, candidateMediaType),
    deleteAsset: (assetId) => assetLibraryService.deleteAsset(assetId),
    getDiagnosticsWorkspace: async () => ({ problems: [], events: [], rawLogs: [] }),
    getConfigurationBackupSummary: async () => {
      const [collections, rules, eventSources, ttsProviders] = await Promise.all([
        alertService.listCollections(),
        alertService.listRules(),
        providerManagementService.listProviders("event-source"),
        providerManagementService.listProviders("tts")
      ]);
      return {
        state: "ready",
        appVersion: "0.0.0",
        schemaVersion: 5,
        configurationRecordCount: collections.length + rules.length + eventSources.length + ttsProviders.length,
        assetCount: 0,
        totalAssetBytes: 0,
        secretExclusions: ["Provider credentials", "Overlay route keys"],
        blockers: []
      };
    }
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
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "0.0.0"
    },
    webBuildDirectory: options.webBuildDirectory,
    managementSessionService,
    managementOriginPreHandler,
    serverConfigService,
    overlayModuleRegistry,
    overlayModuleConfigService,
    moderationService,
    ttsService,
    twitchAuthService,
    twitchEventSubStatusService: twitchEventSubRuntimeService,
    diagnosticsService,
    managementUiQueryService: managementUiService,
    overlayAccessService,
    overlayCompositionService,
    overlayOutputManagementService,
    overlayGateway,
    alertService,
    alertTestPlaybackCoordinator: playbackCoordinator,
    assetRepository,
    mediaImportPipeline,
    assetStore,
    assetLibraryService,
    playbackCoordinator,
    managementAuthPreHandler: createManagementSecurityPreHandler({
      sessionService: managementSessionService,
      originPolicy: managementOriginPolicy,
      runtimeLogger
    }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter }),
    runtimeLogger,
    serverErrorLogger(entry) {
      void runtimeLogger.error("Server HTTP error", {
        module: "server",
        source: "server.error",
        correlationId: entry.requestId,
        processingId: null,
        metadata: {
          errorId: entry.errorId,
          code: entry.code,
          method: entry.method,
          url: entry.url,
          statusCode: entry.statusCode,
          message: entry.error instanceof Error ? entry.error.message : String(entry.error)
        }
      });
    }
  });
  registerManagementCorsPreflightRoute(app, managementOriginPolicy);

  return {
    app,
    configStore,
    database,
    managementSessionService,
    overlayAccessService,
    runtimeSecretStoreStatus: runtimeSecretStore.status,
    twitchEventSubRuntimeService,
    async close() {
      twitchEventSubRuntimeService.disconnect();
      await app.close();
      database.close();
    }
  };
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

interface NodeProviderWebSocketConstructor {
  new (url: string): SpeakerBotSocket;
}

function createNodeWebSocket(url: string): TwitchEventSubSocket {
  const WebSocketConstructor = (globalThis as typeof globalThis & { readonly WebSocket?: NodeWebSocketConstructor }).WebSocket;
  if (WebSocketConstructor === undefined) {
    throw new Error("Global WebSocket runtime is unavailable");
  }

  return new WebSocketConstructor(url);
}

function createNodeProviderWebSocket(url: string): SpeakerBotSocket {
  const WebSocketConstructor = (globalThis as typeof globalThis & { readonly WebSocket?: NodeProviderWebSocketConstructor })
    .WebSocket;
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
