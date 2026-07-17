import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, statfs } from "node:fs/promises";
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
  createAppVersion,
  createDefaultOverlayModuleRegistry,
  overlayScopeSchema,
  type ActionableManagementError,
  type ConfigStore,
  type AlertBrowserSourceView,
  type ProviderLiveStatus,
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
import { AlertEditorService } from "../modules/alerts/alert-editor-service.js";
import { SqliteAlertEditorDocumentRepository } from "../modules/alerts/sqlite-alert-editor-document-repository.js";
import { LocalManagementSessionService } from "../modules/auth/management-session-service.js";
import { LocalAssetStore } from "../modules/assets/local-asset-store.js";
import { SqliteAssetRepository } from "../modules/assets/sqlite-asset-repository.js";
import { AssetLibraryService } from "../modules/assets/asset-library-service.js";
import { SqliteAssetLibraryMetadataRepository } from "../modules/assets/sqlite-asset-library-metadata-repository.js";
import { ConfigurationBackupService } from "../modules/backup/configuration-backup-service.js";
import { LocalConfigurationBackupStore } from "../modules/backup/local-configuration-backup-store.js";
import { RuntimeMaintenanceGate } from "../modules/backup/runtime-maintenance-gate.js";
import { SqliteConfigurationSnapshotRepository } from "../modules/backup/sqlite-configuration-snapshot-repository.js";
import { currentSchemaVersion, openStreamJamsDatabase, runInTransaction, type StreamJamsDatabase } from "../modules/db/database.js";
import { DiagnosticsService } from "../modules/diagnostics/diagnostics-service.js";
import { LogConfigService } from "../modules/diagnostics/log-config-service.js";
import { RuntimeJsonlLogger } from "../modules/diagnostics/runtime-jsonl-logger.js";
import { SqliteDiagnosticsLogRepository } from "../modules/diagnostics/sqlite-log-repository.js";
import {
  EventIngestionService,
  type EventIngestionDiagnostic
} from "../modules/events/event-ingestion-service.js";
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
import { evaluateProviderActivationImpact } from "../modules/providers/provider-activation-impact.js";
import { SqliteProviderRegistrationRepository } from "../modules/providers/sqlite-provider-registration-repository.js";
import type { OsCredentialAdapter } from "../modules/security/os-secret-store.js";
import { createRedactor } from "../modules/security/redactor.js";
import {
  createRuntimeSecretStore,
  type RuntimeSecretStoreStatus
} from "../modules/security/runtime-secret-store.js";
import { createDefaultTtsProviderRegistry } from "../modules/tts/tts-provider-registry.js";
import { StreamerBotClient, type StreamerBotSocket } from "../modules/streamerbot/streamerbot-client.js";
import { createNodeStreamerBotSocket } from "../modules/streamerbot/node-streamerbot-socket.js";
import {
  StreamerBotRuntimeService,
  type StreamerBotRuntimeDiagnostic
} from "../modules/streamerbot/streamerbot-runtime-service.js";
import { DefaultTwitchApiClient, type TwitchApiClient } from "../modules/twitch/twitch-api-client.js";
import {
  DefaultTwitchEventSubApiClient,
  TwitchEventSubClient,
  type TwitchEventSubApiClient,
  type TwitchEventSubDiagnostic,
  type TwitchEventSubSocket
} from "../modules/twitch/twitch-eventsub-client.js";
import {
  TwitchEventSubRuntimeService,
  type TwitchEventSubRuntimeDiagnostic,
  type TwitchEventSubRuntimeState
} from "../modules/twitch/twitch-eventsub-runtime-service.js";
import { defaultTwitchClientId, TwitchOAuthService } from "../modules/twitch/twitch-oauth-service.js";
import { SqliteTwitchAccountRepository } from "../modules/twitch/sqlite-twitch-account-repository.js";
import { NodePortAvailabilityChecker, type PortAvailabilityChecker } from "../server/port-availability.js";
import { OverlayGateway } from "../websocket/overlay-gateway.js";
import { syncEventSourceRuntimes } from "./event-source-runtime-coordinator.js";

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
  readonly streamerBotSocketFactory?: (url: string) => StreamerBotSocket;
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
  readonly streamerBotRuntimeService: StreamerBotRuntimeService;
  readonly eventIngestionService: EventIngestionService;
  syncEventSourceRuntime(): Promise<void>;
  close(): Promise<void>;
}

export async function createRuntimeAppComposition(options: RuntimeAppCompositionOptions): Promise<RuntimeAppComposition> {
  const environment = options.environment ?? process.env;
  const twitchClientId = environment.TWITCH_CLIENT_ID?.trim() || defaultTwitchClientId;
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
  const alertEditorDocumentRepository = new SqliteAlertEditorDocumentRepository(database.connection, now);
  const providerRegistrationRepository = new SqliteProviderRegistrationRepository(database.connection);
  const alertService = new DefaultAlertService({
    repository: alertRepository,
    generateId: generateAlertConfigurationId
  });
  const assetRepository = new SqliteAssetRepository(database.connection);
  const twitchAccountRepository = new SqliteTwitchAccountRepository(database.connection);
  const assetStore = new LocalAssetStore({ assetDirectory: initialConfig.storage.assetDirectory });
  const assetValidator = new DefaultAssetValidator();
  const mediaImportPipeline = new DefaultMediaImportPipeline({
    validator: assetValidator,
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
    onClientDisconnected(clientId) {
      playbackCoordinator.reportClientDisconnected(clientId);
    },
    onPlaybackReport(report) {
      if (report.status === "completed" || report.status === "failed") {
        playbackCoordinator.reportInstructionFinished(report.clientId, report.instructionId);
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
        scope: "module",
        targetProfileId: "landscape"
      },
      {
        overlayId: "default",
        purpose: "live",
        scope: "module",
        targetProfileId: "vertical"
      },
      {
        overlayId: "default",
        purpose: "live",
        scope: "unified"
      }
    ],
    assetRepository,
    findEditorDocument: (alertId) => alertEditorDocumentRepository.find(alertId),
    overlayPlaybackSink: overlayGateway
  });
  const eventPipeline = new EventPipeline({
    playbackCoordinator,
    diagnosticsLogRepository,
    generateId: generateEventPipelineId
  });
  const generateEventSourceReferenceId = () => `ref_${randomBytes(12).toString("base64url")}`;
  const eventIngestionService = new EventIngestionService({
    sink: eventPipeline,
    generateReferenceId: generateEventSourceReferenceId,
    onDiagnostic: (entry) => writeEventSourceFailureDiagnostic(runtimeLogger, "events", "event-intake", entry)
  });
  const maintenanceGate = new RuntimeMaintenanceGate();
  const streamerBotRuntimeService = new StreamerBotRuntimeService({
    repository: providerRegistrationRepository,
    secretStore,
    createClient(onEvent) {
      return new StreamerBotClient({
        socketFactory: options.streamerBotSocketFactory ?? createNodeStreamerBotSocket,
        onEvent,
        generateReferenceId: generateEventSourceReferenceId,
        onDiagnostic: (entry) => writeStreamerBotRuntimeDiagnostic(runtimeLogger, entry),
        now
      });
    },
    ingestionService: {
      ingestNormalizedEvent: (event) =>
        maintenanceGate.runIntake(() => eventIngestionService.ingestNormalizedEvent(event))
    },
    generateReferenceId: generateEventSourceReferenceId,
    onDiagnostic: (entry) => writeStreamerBotRuntimeDiagnostic(runtimeLogger, entry),
    now
  });
  const twitchEventSubClient = new TwitchEventSubClient({
    apiClient: options.twitchEventSubApiClient ?? new DefaultTwitchEventSubApiClient(),
    socketFactory: options.twitchEventSubSocketFactory ?? createNodeWebSocket,
    onNotification: async (message) => {
      const activeEventSource = await providerRegistrationRepository.findActive("event-source");
      if (activeEventSource?.provider.kind !== "twitch") {
        return;
      }
      await maintenanceGate.runIntake(() => eventIngestionService.ingestTwitchEventSubNotification(message));
    },
    generateReferenceId: generateEventSourceReferenceId,
    onDiagnostic: (entry) => writeEventSourceFailureDiagnostic(runtimeLogger, "twitch", "twitch.eventsub", entry),
    now
  });
  const twitchEventSubRuntimeService = new TwitchEventSubRuntimeService({
    accountRepository: twitchAccountRepository,
    clientId: twitchClientId,
    eventSubClient: twitchEventSubClient,
    ingestionService: eventIngestionService,
    generateReferenceId: generateEventSourceReferenceId,
    onDiagnostic: (entry) => writeEventSourceFailureDiagnostic(runtimeLogger, "twitch", "twitch.runtime", entry),
    now,
    secretStore
  });
  const syncEventSourceRuntime = () => syncEventSourceRuntimes({
    repository: providerRegistrationRepository,
    twitchRuntime: twitchEventSubRuntimeService,
    streamerBotRuntime: streamerBotRuntimeService
  });
  const twitchAuthService = new TwitchOAuthService({
    apiClient: twitchApiClient,
    clientId: twitchClientId,
    generateAuthorizationId: randomUUID,
    now,
    onConnectionChanged: syncEventSourceRuntime,
    repository: twitchAccountRepository,
    secretStore,
    assertSecretStoreAvailable: runtimeSecretStore.assertAvailable
  });
  const providerManagementService = new ProviderManagementService({
    repository: providerRegistrationRepository,
    adapters: createProviderManagementAdapters({
      twitchOAuthService: twitchAuthService,
      twitchEventSubRuntimeService,
      streamerBotSocketFactory: options.streamerBotSocketFactory ?? createNodeStreamerBotSocket,
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
      return evaluateProviderActivationImpact({
        capability: target.provider.capability,
        affectedAlertCount,
        changesProviderKind,
        currentProviderName: current?.provider.name ?? "the current provider",
        targetProviderName: target.provider.name,
        occurredAt: now().toISOString()
      });
    },
    async getUsedByAlertCount(kind: ProviderKind) {
      const activeRules = await alertService.listActiveRules();
      return kind === "speakerbot" || kind === "browser-speech"
        ? activeRules.filter((rule) => rule.variants.some((variant) => variant.enabled && variant.ttsConfig !== null)).length
        : activeRules.length;
    },
    generateId: () => `provider_${randomBytes(16).toString("base64url")}`,
    generateReferenceId: () => `ref_${randomBytes(12).toString("base64url")}`,
    onEventSourceChanged: syncEventSourceRuntime,
    now
  });
  const alertSetMetadataRepository = new SqliteAlertSetMetadataRepository(database.connection);
  const alertSetManagementService = new AlertSetManagementService({
    alertService,
    metadataRepository: alertSetMetadataRepository,
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
  const alertEditorService = new AlertEditorService({
    documents: alertEditorDocumentRepository,
    rules: alertRepository,
    metadata: alertSetMetadataRepository,
    async hasConnectedOutput(targetProfileId) {
      return overlayGateway.clientStates.some(
        (client) =>
          client.connectionState === "connected" &&
          client.overlayId === "default" &&
          client.scope === "module" &&
          client.moduleId === "alerts" &&
          client.purpose === "live" &&
          client.targetProfileId === targetProfileId
      );
    },
    async enqueueTest(playback) {
      playbackCoordinator.enqueueResolvedTest(playback);
    },
    async findAssetMediaType(assetId) {
      return (await assetRepository.findById(assetId))?.mediaType ?? null;
    },
    generateId: () => `editor_${randomBytes(12).toString("base64url")}`,
    generateReferenceId: () => `ref_${randomBytes(12).toString("base64url")}`,
    async saveAtomically(input) {
      return runInTransaction(database.connection, () => {
        alertRepository.saveRuleSync(input.rule);
        alertSetMetadataRepository.saveRuleSync(input.metadata);
        return alertEditorDocumentRepository.saveSync(input.document);
      });
    },
    now
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
            message: status.message,
            referenceId: null
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
            message: status.message,
            referenceId: status.referenceId
          };
        }
      },
      {
        getStatus() {
          const status = streamerBotRuntimeService.getStatus();
          return {
            providerId: status.activeProviderId ?? "streamerbot",
            label: "Streamer.bot event intake",
            state: toDiagnosticsProviderState(status.state),
            lastErrorAt: status.lastErrorAt,
            message: status.message,
            referenceId: status.referenceId
          };
        }
      }
    ],
    async resolveProviderRegistrationId(providerKindOrId) {
      const providers = [
        ...await providerManagementService.listProviders("event-source"),
        ...await providerManagementService.listProviders("tts")
      ];
      return providers.find((provider) => provider.id === providerKindOrId)?.id
        ?? providers.find((provider) => provider.kind === providerKindOrId && provider.active)?.id
        ?? providers.find((provider) => provider.kind === providerKindOrId)?.id
        ?? null;
    },
    async resolveAlertSetId(alertId) {
      return (await alertEditorService.getDocument(alertId)).setId;
    },
    now
  });
  const assetLibraryService = new AssetLibraryService({
    assetRepository,
    metadataRepository: new SqliteAssetLibraryMetadataRepository(database.connection),
    assetStore,
    alertRepository,
    ruleMetadataRepository: alertSetMetadataRepository,
    clock: now
  });
  const configurationBackupService = new ConfigurationBackupService({
    appVersion: createAppVersion().version,
    schemaVersion: currentSchemaVersion,
    now,
    generateReferenceId: () => `ref_${randomBytes(12).toString("base64url")}`,
    configStore,
    snapshotRepository: new SqliteConfigurationSnapshotRepository(database.connection),
    assetRepository,
    assetStore,
    assetValidator,
    async getRuntime() {
      const eventSubState = twitchEventSubRuntimeService.getStatus().state;
      const streamerBotState = streamerBotRuntimeService.getStatus().state;
      const playback = playbackCoordinator.getSnapshot();
      return {
        intakeActive:
          maintenanceGate.activeIntakeCount > 0 ||
          eventSubState === "connecting" ||
          eventSubState === "connected" ||
          eventSubState === "reconnecting" ||
          streamerBotState === "connecting" ||
          streamerBotState === "connected" ||
          streamerBotState === "reconnecting",
        playbackActive: playback.current !== null,
        queuedPlaybackCount: playback.queued.length
      };
    },
    async getAvailableBytes() {
      await mkdir(initialConfig.storage.assetDirectory, { recursive: true });
      const storage = await statfs(initialConfig.storage.assetDirectory);
      return Number(storage.bavail) * Number(storage.bsize);
    },
    safetyBackupStore: new LocalConfigurationBackupStore({
      directory: join(options.homeDirectory, ".stream-jams", "backups"),
      now
    }),
    async regenerateOutput(output, restoredOrigin) {
      const regenerated = await overlayOutputManagementService.regenerateKey(
        {
          overlayId: output.overlayId,
          scope: overlayScopeSchema.parse(output.scope),
          moduleId: output.moduleId,
          purpose: output.purpose,
          targetProfileId: output.targetProfileId
        },
        restoredOrigin
      );
      return { label: regenerated.output.label, url: regenerated.url };
    },
    runExclusive: (work) => maintenanceGate.runMaintenance(work)
  });
  const managementUiService = new ManagementUiService({
    providerService: providerManagementService,
    alertSetService: alertSetManagementService,
    getEventSourceRuntimeView(provider) {
      if (!provider.active) return { liveStatus: "not-running", error: null };
      if (provider.kind === "twitch") {
        const status = twitchEventSubRuntimeService.getStatus();
        return {
          liveStatus: toProviderLiveStatus(status.state),
          error: toEventSourceRuntimeError(provider.name, status)
        };
      }
      if (provider.kind === "streamerbot") {
        const status = streamerBotRuntimeService.getStatus();
        return {
          liveStatus: toProviderLiveStatus(status.state),
          error: toEventSourceRuntimeError(provider.name, status)
        };
      }
      return { liveStatus: "error", error: provider.error };
    },
    hasBrowserOutput: async () =>
      (await overlayOutputManagementService.listOutputs(`http://${initialConfig.server.host}:${initialConfig.server.port}`)).some(
        (output) =>
          output.moduleId === "alerts" &&
          (output.targetProfileId === "landscape" || output.targetProfileId === "vertical") &&
          output.copyableUrlStatus === "available"
      ),
    getAlertEditorDocument: (alertId) => alertEditorService.getDocument(alertId),
    saveAlertEditorDocument: (alertId, document, confirmLiveImpact) =>
      alertEditorService.saveDocument(alertId, document, confirmLiveImpact),
    sendAlertEditorTest: (alertId, request) => alertEditorService.sendTest(alertId, request),
    listAssetLibraryItems: () => assetLibraryService.listItems(),
    updateAssetMetadata: (assetId, input) => assetLibraryService.updateMetadata(assetId, input),
    getAssetChangeImpact: (assetId, candidateMediaType) =>
      assetLibraryService.getChangeImpact(assetId, candidateMediaType),
    deleteAsset: (assetId) => assetLibraryService.deleteAsset(assetId),
    getDiagnosticsWorkspace: () =>
      diagnosticsService.getWorkspace({ limit: 200, runtimeLogLimit: 200, sinceHours: 2 }),
    getConfigurationBackupSummary: () => configurationBackupService.summary()
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
    configurationBackupService,
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
    streamerBotRuntimeService,
    eventIngestionService,
    syncEventSourceRuntime,
    async close() {
      twitchEventSubRuntimeService.disconnect();
      streamerBotRuntimeService.disconnect();
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

function toProviderLiveStatus(state: TwitchEventSubRuntimeState): ProviderLiveStatus {
  switch (state) {
    case "connected":
      return "healthy";
    case "connecting":
      return "starting";
    case "reconnecting":
      return "reconnecting";
    case "idle":
    case "degraded":
    case "error":
      return "error";
  }
}

function toEventSourceRuntimeError(
  providerName: string,
  status: {
    readonly state: TwitchEventSubRuntimeState;
    readonly message: string | null;
    readonly lastErrorAt: string | null;
    readonly referenceId: string | null;
  }
): ActionableManagementError | null {
  if (toProviderLiveStatus(status.state) !== "error") return null;
  const diagnosticsRoute = status.referenceId === null
    ? "/manage/diagnostics"
    : `/manage/diagnostics?reference=${encodeURIComponent(status.referenceId)}`;
  return {
    summary: `${providerName} live status error`,
    cause: status.message ?? `${providerName} runtime reported an error.`,
    nextStep: "Review the provider connection and reconnect it before retrying.",
    severity: "error",
    occurredAt: status.lastErrorAt,
    referenceId: status.referenceId,
    correction: { label: "Open diagnostics", route: diagnosticsRoute }
  };
}

async function writeStreamerBotRuntimeDiagnostic(
  logger: RuntimeJsonlLogger,
  entry: StreamerBotRuntimeDiagnostic
): Promise<void> {
  const context = {
    module: "streamerbot",
    source: "streamerbot.event-intake",
    correlationId: entry.referenceId,
    processingId: null,
    metadata: {
      referenceId: entry.referenceId,
      ...(entry.source === undefined ? {} : { upstreamSource: entry.source }),
      ...(entry.type === undefined ? {} : { upstreamType: entry.type })
    }
  };
  switch (entry.level) {
    case "info":
      await logger.info(entry.message, context);
      return;
    case "warn":
      await logger.warn(entry.message, context);
      return;
    case "error":
      await logger.error(entry.message, context);
  }
}

async function writeEventSourceFailureDiagnostic(
  logger: RuntimeJsonlLogger,
  module: string,
  source: string,
  entry: EventIngestionDiagnostic | TwitchEventSubDiagnostic | TwitchEventSubRuntimeDiagnostic
): Promise<void> {
  await logger.error(entry.message, {
    module,
    source,
    correlationId: entry.referenceId,
    processingId: null,
    metadata: { referenceId: entry.referenceId }
  });
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
