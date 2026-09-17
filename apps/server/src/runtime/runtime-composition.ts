import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, statfs } from "node:fs/promises";
import { join } from "node:path";
import {
  DefaultAlertMatcher,
  DefaultAlertResolver,
  DefaultAlertService,
  DefaultAssetValidator,
  DefaultEffectQueue,
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
  isStreamerBotSubscriptionAvailable,
  overlayScopeSchema,
  type ActionableManagementError,
  type AudioDeviceHost,
  type AudioPlaybackSink,
  type ConfigStore,
  type DesktopConfig,
  type DesktopAudioTransport,
  type DesktopOverlayTransport,
  type EffectContentSnapshot,
  type OverlayModuleConfigService,
  type OverlayModuleRuntime,
  type PlaybackSafetyState,
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
import { DesktopConfigService } from "../config/desktop-config-service.js";
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
import { SqliteAlertAggregateMutationStore } from "../modules/alerts/sqlite-alert-aggregate-mutation-store.js";
import { LocalManagementSessionService } from "../modules/auth/management-session-service.js";
import { LocalAssetStore } from "../modules/assets/local-asset-store.js";
import { SqliteAssetRepository } from "../modules/assets/sqlite-asset-repository.js";
import { AssetLibraryService } from "../modules/assets/asset-library-service.js";
import { SqliteAssetLibraryMetadataRepository } from "../modules/assets/sqlite-asset-library-metadata-repository.js";
import { SqliteEffectRepository } from "../modules/screen-effects/sqlite-effect-repository.js";
import { SqliteEffectSetRepository } from "../modules/screen-effects/sqlite-effect-set-repository.js";
import { EffectAdmissionService } from "../modules/screen-effects/effect-admission-service.js";
import { EffectManagementService } from "../modules/screen-effects/effect-management-service.js";
import { EffectPlaybackCoordinator } from "../modules/screen-effects/effect-playback-coordinator.js";
import { SqliteEffectModuleSettingsRepository } from "../modules/screen-effects/sqlite-effect-module-settings-repository.js";
import { ConfigurationBackupService } from "../modules/backup/configuration-backup-service.js";
import { LocalConfigurationBackupStore } from "../modules/backup/local-configuration-backup-store.js";
import { RuntimeMaintenanceGate } from "../modules/backup/runtime-maintenance-gate.js";
import { SqliteConfigurationSnapshotRepository } from "../modules/backup/sqlite-configuration-snapshot-repository.js";
import {
  currentSchemaVersion,
  openStreamJamsDatabase,
  runInTransaction,
  type StreamJamsDatabase
} from "../modules/db/database.js";
import { DiagnosticsService } from "../modules/diagnostics/diagnostics-service.js";
import { LogConfigService } from "../modules/diagnostics/log-config-service.js";
import { LogRetentionService } from "../modules/diagnostics/log-retention-service.js";
import { RuntimeJsonlLogger } from "../modules/diagnostics/runtime-jsonl-logger.js";
import { SqliteDiagnosticsLogRepository } from "../modules/diagnostics/sqlite-log-repository.js";
import { SqliteModerationSettingsRepository } from "../modules/moderation/sqlite-moderation-settings-repository.js";
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
import { PlaybackOperationsService } from "../modules/playback/playback-operations-service.js";
import { createAlertQueueOwner, createEffectQueueOwner } from "../modules/playback/playback-queue-owners.js";
import { ManagementUiService } from "../modules/providers/management-ui-service.js";
import { createProviderManagementAdapters } from "../modules/providers/provider-management-adapters.js";
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
import {
  SpeakerBotClient,
  type SpeakerBotSocket
} from "../modules/tts/speakerbot-client.js";
import { LocalMaintenanceService, createPlatformPathOpener } from "../modules/settings/local-maintenance-service.js";
import { StreamerBotClient, type StreamerBotSocket } from "../modules/streamerbot/streamerbot-client.js";
import { createNodeStreamerBotSocket } from "../modules/streamerbot/node-streamerbot-socket.js";
import {
  StreamerBotRuntimeService,
  type StreamerBotRuntimeDiagnostic
} from "../modules/streamerbot/streamerbot-runtime-service.js";
import {
  DefaultTwitchApiClient,
  type TwitchApiClient,
  type TwitchRewardApiClient
} from "../modules/twitch/twitch-api-client.js";
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
import {
  createTwitchTokenSecretRef,
  defaultTwitchClientId,
  TwitchOAuthService
} from "../modules/twitch/twitch-oauth-service.js";
import { TwitchRewardCatalogService } from "../modules/twitch/twitch-reward-catalog-service.js";
import { SqliteTwitchAccountRepository } from "../modules/twitch/sqlite-twitch-account-repository.js";
import { NodePortAvailabilityChecker, type PortAvailabilityChecker } from "../server/port-availability.js";
import { OverlayGateway } from "../websocket/overlay-gateway.js";
import { syncEventSourceRuntimes } from "./event-source-runtime-coordinator.js";
import { onceAsync } from "./once-async.js";
import { AudioOutputService } from "../modules/audio/audio-output-service.js";
import { DesktopAudioSink } from "../modules/audio/desktop-audio-sink.js";
import { SqliteAudioOutputRouteRepository } from "../modules/audio/sqlite-audio-output-route-repository.js";
import { SqliteSurfaceRepository } from "../modules/overlay-surfaces/sqlite-surface-repository.js";
import { DesktopVisualSink } from "../modules/overlay-surfaces/desktop-visual-sink.js";
import { SurfaceSettingsService } from "../modules/overlay-surfaces/surface-settings-service.js";
import { DesktopVisualAssetResolver } from "../modules/overlay-surfaces/desktop-visual-asset-resolver.js";

export interface RuntimeAppCompositionOptions {
  readonly audioDeviceHost?: AudioDeviceHost;
  readonly audioPlaybackSink?: AudioPlaybackSink;
  readonly desktopAudioTransport?: DesktopAudioTransport;
  readonly desktopOverlayTransport?: DesktopOverlayTransport;
  readonly desktopHost?: {
    onConfigChanged(config: DesktopConfig): void;
    onPlaybackStateChanged(state: PlaybackSafetyState): void;
  };
  readonly homeDirectory: string;
  readonly webBuildDirectory: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly credentialAdapter?: OsCredentialAdapter;
  readonly configStore?: ConfigStore;
  readonly portAvailability?: PortAvailabilityChecker;
  readonly secretStore?: SecretStore;
  readonly twitchApiClient?: TwitchApiClient;
  readonly twitchRewardApiClient?: TwitchRewardApiClient;
  readonly twitchEventSubApiClient?: TwitchEventSubApiClient;
  readonly twitchEventSubSocketFactory?: (url: string) => TwitchEventSubSocket;
  readonly streamerBotSocketFactory?: (url: string) => StreamerBotSocket;
  readonly speakerBotSocketFactory?: (url: string) => SpeakerBotSocket;
  readonly now?: () => Date;
  readonly generateManagementSessionId?: () => string;
  readonly generateManagementCsrfToken?: () => string;
  readonly generateOverlayAccessKeyId?: () => string;
  readonly generateRawOverlayRouteKey?: () => string;
  readonly generateOverlayClientId?: () => string;
  readonly scheduleRecurring?: ((callback: () => void, delayMs: number) => unknown) | undefined;
  readonly cancelRecurring?: ((handle: unknown) => void) | undefined;
}

export interface RuntimeAppComposition {
  readonly desktopConfigService: DesktopConfigService;
  readonly playbackCoordinator: PlaybackCoordinator;
  readonly effectPlaybackCoordinator: EffectPlaybackCoordinator;
  readonly playbackOperationsService: PlaybackOperationsService;
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
  const desktopConfigService = new DesktopConfigService(configStore, options.desktopHost?.onConfigChanged);
  const logConfigService = new LogConfigService(configStore);
  const logSettings = await logConfigService.getSettings();
  const database = openStreamJamsDatabase(join(initialConfig.storage.dataDirectory, "stream-jams.sqlite"));
  const cleanups: Array<() => void | Promise<void>> = [() => database.close()];
  let closing = false;
  const runtimeWork = new Set<Promise<unknown>>();
  // Last drain before SQLite closes, after intake/playback and providers stop.
  cleanups.push(async () => { await Promise.allSettled([...runtimeWork]); });
  function trackRuntimeWork(work: () => Promise<void>): Promise<void> {
    if (closing) return Promise.resolve();
    const pending = Promise.resolve().then(work);
    runtimeWork.add(pending);
    void pending.finally(() => runtimeWork.delete(pending)).catch(() => undefined);
    return pending;
  }
  const close = onceAsync(async () => {
    closing = true;
    const errors: unknown[] = [];
    for (const cleanup of cleanups.reverse()) {
      try { await cleanup(); } catch (error) { errors.push(error); }
    }
    if (errors.length > 0) throw new AggregateError(errors, "Local runtime cleanup failed");
  });
  try {
  const moderationSettingsRepository = new SqliteModerationSettingsRepository(database.connection);
  const moderationService = new DefaultModerationService({ repository: moderationSettingsRepository });
  const diagnosticsLogRepository = new SqliteDiagnosticsLogRepository(database.connection);
  const alertRepository = new SqliteAlertRepository(database.connection);
  const alertEditorDocumentRepository = new SqliteAlertEditorDocumentRepository(database.connection, now);
  const providerRegistrationRepository = new SqliteProviderRegistrationRepository(database.connection);
  const alertService = new DefaultAlertService({
    repository: alertRepository,
    generateId: generateAlertConfigurationId
  });
  const assetRepository = new SqliteAssetRepository(database.connection);
  const effectRepository = new SqliteEffectRepository(database.connection, now);
  const effectSetRepository = new SqliteEffectSetRepository(database.connection, effectRepository);
  const effectModuleSettingsRepository = new SqliteEffectModuleSettingsRepository(database.connection, now);
  const alertModuleSettingsRepository = new SqliteEffectModuleSettingsRepository(database.connection, now, "alerts");
  const initialEffectModuleSettings = await effectModuleSettingsRepository.get();
  const initialAlertModuleSettings = await alertModuleSettingsRepository.get();
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
  const surfaceRepository = new SqliteSurfaceRepository(database.connection, overlayModuleRegistry);
  const desktopVisualSink = options.desktopOverlayTransport === undefined ? undefined : new DesktopVisualSink({
    transport: options.desktopOverlayTransport, surfaces: surfaceRepository,
    assets: new DesktopVisualAssetResolver({ assetRepository, assetStore })
  });
  if (desktopVisualSink !== undefined) cleanups.push(() => desktopVisualSink.close());
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
  const logDirectory = join(initialConfig.storage.dataDirectory, "logs");
  const logRetentionService = new LogRetentionService();
  const runtimeLogger = new RuntimeJsonlLogger({
    logDirectory,
    settings: logSettings,
    redactor,
    retentionService: logRetentionService,
    now
  });
  const localMaintenanceService = new LocalMaintenanceService({
    dataDirectory: initialConfig.storage.dataDirectory,
    logDirectory,
    logSettings,
    logRetentionService,
    diagnosticsLogRepository,
    pathOpener: createPlatformPathOpener(),
    now
  });
  await localMaintenanceService.clearOldLogs();
  const overlayOutputManagementService = new OverlayOutputManagementService({
    overlayAccessService,
    overlayKeyRepository,
    overlayModuleRegistry,
    overlayModuleConfigService,
    secretStore
  });
  const generateRuntimeReferenceId = () => `ref_${randomBytes(12).toString("base64url")}`;
  if (options.desktopOverlayTransport !== undefined) {
    const surface = (await surfaceRepository.list()).find(surface => surface.kind === "desktop");
    try { if (surface?.kind === "desktop") await desktopVisualSink!.configure(surface); }
    catch {
      await runtimeLogger.error("Desktop overlay could not be configured. Other outputs remain available.", {
        module: "overlay-surfaces", source: "desktop-overlay.configure.failed", correlationId: generateRuntimeReferenceId(), processingId: null,
        metadata: { nextStep: "Check the selected display and explicitly retry the desktop overlay in Settings." }
      }).catch(() => undefined);
    }
  }
  const speakerBotSocketFactory = options.speakerBotSocketFactory ?? createNodeProviderWebSocket;
  const ttsProviderRegistry = createDefaultTtsProviderRegistry({
    speakerBot: {
      client: new SpeakerBotClient({
        socketFactory: speakerBotSocketFactory,
        timeoutMs: 5_000
      }),
      async resolveActiveProvider() {
        const active = await providerRegistrationRepository.findActive("tts");
        return active === null
          ? null
          : {
              provider: active.provider,
              configuration: { ...active.configuration },
              availableVoices: [...active.availableVoices],
              ttsSafety: active.ttsSafety
            };
      }
    }
  });
  const ttsService = new DefaultTtsService({
    registry: ttsProviderRegistry,
    moderationService
  });
  const defaultTwitchApiClient = new DefaultTwitchApiClient();
  const twitchApiClient = options.twitchApiClient ?? defaultTwitchApiClient;
  const twitchRewardApiClient = options.twitchRewardApiClient ?? defaultTwitchApiClient;
  const overlayGateway = new OverlayGateway({
    overlayAccessService,
    generateClientId: options.generateOverlayClientId ?? generateOverlayClientId,
    clock: now,
    initialPlaybackMuted: initialConfig.playback.muted,
    onClientDisconnected(clientId) {
      playbackCoordinator.reportClientDisconnected(clientId);
      effectPlaybackCoordinator.reportClientDisconnected(clientId);
    },
    onPlaybackReport(report) {
      if (report.status === "failed") {
        void runtimeLogger.error(
          `Overlay playback failed: ${report.message ?? "No failure reason was reported."}`,
          {
            module: "overlay",
            source: "overlay.playback.failed",
            correlationId: report.instructionId,
            processingId: null,
            metadata: {
              clientId: report.clientId,
              instructionId: report.instructionId
            }
          }
        );
      }
      if (report.status === "completed" || report.status === "failed") {
        playbackCoordinator.reportInstructionFinished(report.clientId, report.instructionId);
        effectPlaybackCoordinator.reportInstructionFinished(
          report.clientId,
          report.instructionId,
          report.status === "failed"
        );
      }
    }
  });
  const playbackQueue = new DefaultPlaybackQueue({
    generateId: generatePlaybackQueueItemId,
    initialSafetyState: initialConfig.playback,
    initialModulePaused: initialAlertModuleSettings.paused
  });
  const effectQueue = new DefaultEffectQueue({
    modulePaused: initialEffectModuleSettings.paused
  });
  const maintenanceGate = new RuntimeMaintenanceGate();
  let desktopAudioSink: DesktopAudioSink | undefined;
  if (options.desktopAudioTransport !== undefined) {
    try {
      await options.desktopAudioTransport.setMuted(initialConfig.playback.muted);
    } catch (error) {
      try { await options.desktopAudioTransport.close(); }
      catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Desktop audio initialization and cleanup failed", { cause: cleanupError });
      }
      throw error;
    }
    desktopAudioSink = new DesktopAudioSink({
      transport: options.desktopAudioTransport,
      assetRepository,
      assetStore,
      now: () => now().getTime()
    });
  }
  const audioDeviceHost = options.audioDeviceHost ?? options.desktopAudioTransport;
  const audioPlaybackSink = options.audioPlaybackSink ?? desktopAudioSink;
  const audioOutputRouteRepository = new SqliteAudioOutputRouteRepository(database.connection);
  const audioOutputService = new AudioOutputService({
    routes: audioOutputRouteRepository,
    ...(audioDeviceHost === undefined ? {} : { host: audioDeviceHost }),
    isMuted: () => playbackQueue.getSnapshot().muted,
    runMutation: work => maintenanceGate.runConfigurationMutation(() => runInTransaction(database.connection, work)),
    runTest: work => maintenanceGate.runIntake(work)
  });
  const playbackCooldownService = new DefaultPlaybackCooldownService();
  const playbackDedupeService = new DefaultPlaybackDedupeService();
  const isEffectModuleEnabled = async () =>
    (await overlayModuleConfigService.getModuleConfig("screen-effects")).enabled;
  const validateEffectReferences = async (content: EffectContentSnapshot) => {
    const assetIds = [
      ...(content.variant.visual === null ? [] : [content.variant.visual.assetId]),
      ...(content.variant.sound === null ? [] : [content.variant.sound.assetId])
    ];
    const assets = await assetRepository.findManyByIds(assetIds);
    const visual = content.variant.visual;
    if (visual !== null && assets.get(visual.assetId)?.mediaType !== visual.mediaType) return false;
    if (
      content.variant.sound !== null
      && assets.get(content.variant.sound.assetId)?.mediaType !== "audio"
    ) {
      return false;
    }
    return content.variant.outputs.deviceRouteIds.every(
      (routeId) => audioOutputRouteRepository.findById(routeId) !== null
    );
  };
  const validateEffectOutputAvailability = async (content: EffectContentSnapshot) => {
    const { variant } = content;
    const hasBrowserVisual = variant.visual !== null && variant.visualOutputs.browserSource;
    const hasBrowserAudio = variant.outputs.browserSource && (
      variant.sound !== null
      || (variant.visual?.mediaType === "video" && variant.visual.playEmbeddedAudio)
    );
    const connectedModuleSource = overlayGateway.clientStates.some(
      (client) => client.connectionState === "connected"
        && client.overlayId === "default"
        && client.purpose === "live"
        && client.scope === "module"
        && client.moduleId === "screen-effects"
        && (client.targetProfileId ?? null) === null
    );
    const connectedUnifiedSource = overlayGateway.clientStates.some(
      (client) => client.connectionState === "connected"
        && client.overlayId === "default"
        && client.purpose === "live"
        && client.scope === "unified"
        && client.moduleId === null
        && (client.targetProfileId ?? null) === null
    );
    let unifiedVisualEnabled = false;
    if (hasBrowserVisual && connectedUnifiedSource) {
      const surface = (await surfaceRepository.list()).find(
        (candidate) => candidate.kind === "unified-browser" && candidate.overlayId === "default"
      );
      unifiedVisualEnabled = surface?.layers.some(
        (layer) => layer.moduleId === "screen-effects" && layer.visible
      ) ?? false;
    }
    const browserReady = isEffectBrowserOutputReady({
      hasBrowserVisual,
      hasBrowserAudio,
      connectedModuleSource,
      connectedUnifiedSource,
      unifiedVisualEnabled
    });

    let desktopReady = false;
    if (variant.visual !== null && variant.visualOutputs.desktop && options.desktopOverlayTransport !== undefined) {
      const surface = (await surfaceRepository.list()).find((candidate) => candidate.kind === "desktop");
      const displayId = surface?.kind === "desktop" ? surface.displayId : null;
      desktopReady = surface?.kind === "desktop"
        && surface.enabled
        && displayId !== null
        && surface.layers.some((layer) => layer.moduleId === "screen-effects" && layer.visible);
      if (desktopReady && options.desktopOverlayTransport.getStatus !== undefined) {
        try {
          const status = await options.desktopOverlayTransport.getStatus();
          desktopReady = status.available
            && status.state === "ready"
            && status.displays.some((display) => display.id === displayId);
        } catch {
          desktopReady = false;
        }
      }
    }

    let deviceReady = false;
    if (variant.outputs.deviceRouteIds.length > 0) {
      const selectedRouteIds = new Set(variant.outputs.deviceRouteIds);
      const status = await audioOutputService.getStatus();
      deviceReady = status.routes.some(
        (route) => selectedRouteIds.has(route.route.id) && route.state === "ready"
      );
    }
    return browserReady || desktopReady || deviceReady;
  };
  const playbackCoordinator = new PlaybackCoordinator({
    alertService,
    matcher: new DefaultAlertMatcher(),
    resolver: new DefaultAlertResolver({
      generateId: generateResolvedAlertId,
      moderationService
    }),
    queue: playbackQueue,
    cooldownService: playbackCooldownService,
    dedupeService: playbackDedupeService,
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
    findEditorDocuments: (alertIds) => alertEditorDocumentRepository.findMany(alertIds),
    overlayPlaybackSink: overlayGateway,
    audioOutputService,
    ...(audioPlaybackSink === undefined ? {} : { audioPlaybackSink }),
    ...(desktopVisualSink === undefined ? {} : { desktopVisualSink }),
    ttsService,
    logger: runtimeLogger,
    generateReferenceId: generateRuntimeReferenceId
  });
  const effectPlaybackCoordinator = new EffectPlaybackCoordinator({
    queue: effectQueue,
    getSafety: () => {
      const snapshot = playbackQueue.getSnapshot();
      return {
        paused: snapshot.paused,
        muted: snapshot.muted,
        doNotDisturb: snapshot.doNotDisturb
      };
    },
    overlayPlaybackSink: overlayGateway,
    audioOutputService,
    ...(audioPlaybackSink === undefined ? {} : { audioPlaybackSink }),
    ...(desktopVisualSink === undefined ? {} : { desktopVisualSink }),
    isModuleEnabled: isEffectModuleEnabled,
    validateReferences: validateEffectReferences,
    validateOutputAvailability: validateEffectOutputAvailability,
    onStopFailure: (error, occurrenceId) => runtimeLogger.error("Screen Effects local outputs did not acknowledge stop.", {
      module: "screen-effects",
      source: "screen-effects.playback-stop-failed",
      correlationId: generateRuntimeReferenceId(),
      processingId: null,
      metadata: {
        occurrenceId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        nextStep: "Review Diagnostics and retry Skip. The queue remains held until local outputs acknowledge stop."
      }
    }),
    now: () => now().getTime()
  });
  const effectAdmissionService = new EffectAdmissionService({
    repository: { list: () => effectRepository.listActive(), find: (id) => effectRepository.find(id) },
    isEffectLive: (id) => effectRepository.isInActiveSet(id),
    queue: effectQueue,
    dedupe: playbackDedupeService,
    cooldowns: playbackCooldownService,
    getModuleCooldownSeconds: async () => (await effectModuleSettingsRepository.get()).cooldownSeconds,
    generateOccurrenceId: generateEffectOccurrenceId,
    now: () => now().getTime(),
    validateReferences: validateEffectReferences,
    validateOutputAvailability: validateEffectOutputAvailability,
    isModuleEnabled: isEffectModuleEnabled,
    onOutcome: async (result) => {
      if (result.status !== "processed") return;
      const rejected = result.outcomes.filter((outcome) => outcome.status !== "queued");
      if (rejected.length === 0) return;
      await runtimeLogger.warn("Screen Effects event admission rejected local candidates", {
        module: "screen-effects",
        source: "screen-effects.event-admission",
        correlationId: `event:${result.eventId}`,
        processingId: null,
        metadata: {
          rejectedCount: rejected.length,
          effectIds: rejected.map((outcome) => outcome.effectId).join(","),
          reasons: rejected.map((outcome) => outcome.status).join(",")
        }
      });
    }
  });
  const playbackOperationsService = new PlaybackOperationsService({
    owners: [
      createAlertQueueOwner({
        coordinator: playbackCoordinator,
        isPaused: () => playbackQueue.isModulePaused(),
        persistPaused: async (paused) => {
          const current = await alertModuleSettingsRepository.get();
          await alertModuleSettingsRepository.save({ ...current, paused });
        }
      }),
      createEffectQueueOwner({
        queue: effectQueue,
        coordinator: effectPlaybackCoordinator,
        replayRecent: (occurrenceId) => effectAdmissionService.replayRecent(occurrenceId),
        persistPaused: async (paused) => {
          const current = await effectModuleSettingsRepository.get();
          await effectModuleSettingsRepository.save({ ...current, paused });
        }
      })
    ],
    initialSafety: initialConfig.playback,
    persistSafety: async (patch) => {
      const { playback } = await configStore.updateConfig({ playback: patch });
      return playback;
    },
    applySafety: async (state) => {
      await playbackCoordinator.applySafetyState(state);
      await effectPlaybackCoordinator.startNext();
      options.desktopHost?.onPlaybackStateChanged(state);
    },
    onSafetyApplyFailure: async () => {
      await runtimeLogger.error("Playback safety was saved but a local output did not acknowledge the change.", {
        module: "playback",
        source: "playback.safety.output-failed",
        correlationId: generateRuntimeReferenceId(),
        processingId: null,
        metadata: { nextStep: "Review Diagnostics and retry the affected local output. The saved safety state remains authoritative." }
      });
    }
  });
  const eventPipeline = new EventPipeline({
    playbackCoordinator,
    effectTriggerSink: {
      async handleTriggers(triggers) {
        const result = await effectAdmissionService.handleTriggers(triggers);
        await effectPlaybackCoordinator.startNext();
        return result;
      }
    },
    diagnosticsLogRepository,
    generateId: generateEventPipelineId,
    onEffectError: (error, triggers) => runtimeLogger.error("Screen Effects trigger handling failed", {
      module: "screen-effects",
      source: "screen-effects.event-admission",
      correlationId: triggers[0] === undefined ? "event:screen-effects:unknown" : `event:${triggers[0].eventId}`,
      processingId: null,
      metadata: {
        errorName: error.name,
        eventIds: Array.from(new Set(triggers.map((trigger) => trigger.eventId))),
        triggerKinds: triggers.map((trigger) => trigger.kind)
      }
    })
  });
  const generateEventSourceReferenceId = generateRuntimeReferenceId;
  const eventIngestionService = new EventIngestionService({
    sink: eventPipeline,
    generateReferenceId: generateEventSourceReferenceId,
    onDiagnostic: (entry) => writeEventSourceFailureDiagnostic(runtimeLogger, "events", "event-intake", entry)
  });
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
      ingestNormalizedEvent: (event, effectTriggers) =>
        maintenanceGate.runIntake(() => eventIngestionService.ingestNormalizedEvent(event, effectTriggers)),
      ingestEffectTriggers: (eventId, triggers) =>
        maintenanceGate.runIntake(() => eventIngestionService.ingestEffectTriggers(eventId, triggers))
    },
    generateReferenceId: generateEventSourceReferenceId,
    onDiagnostic: (entry) => writeStreamerBotRuntimeDiagnostic(runtimeLogger, entry),
    now
  });
  const twitchAuthServiceRef: { current: TwitchOAuthService | null } = { current: null };
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
    onAuthorizationFailure: async () => {
      const authService = twitchAuthServiceRef.current;
      if (authService === null) throw new Error("Twitch authorization service is unavailable");
      await authService.refreshConnectedAccount();
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
    secretStore,
    async validateConnectedAccount() {
      const authService = twitchAuthServiceRef.current;
      if (authService === null) throw new Error("Twitch authorization service is unavailable");
      await authService.validateConnectedAccount({ notifyConnectionChanged: false });
    }
  });
  const syncEventSourceRuntime = () => trackRuntimeWork(() => syncEventSourceRuntimes({
    repository: providerRegistrationRepository,
    twitchRuntime: twitchEventSubRuntimeService,
    streamerBotRuntime: streamerBotRuntimeService
  }));
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
  twitchAuthServiceRef.current = twitchAuthService;
  const twitchRewardCatalogService = new TwitchRewardCatalogService({
    apiClient: twitchRewardApiClient,
    clientId: twitchClientId,
    oauthService: twitchAuthService,
    repository: twitchAccountRepository,
    secretStore
  });
  const twitchValidationInterval = (options.scheduleRecurring ?? setInterval)(() => {
    void trackRuntimeWork(() => twitchAuthService.validateConnectedAccount().then(() => undefined)).catch(async () => {
      if (closing) return;
      await twitchEventSubRuntimeService.reportAuthorizationFailure();
    });
  }, 60 * 60 * 1_000);
  if (typeof twitchValidationInterval === "object" && twitchValidationInterval !== null && "unref" in twitchValidationInterval) {
    const unref = (twitchValidationInterval as { readonly unref?: () => void }).unref;
    unref?.call(twitchValidationInterval);
  }
  cleanups.push(() => (options.cancelRecurring ?? clearInterval)(twitchValidationInterval as ReturnType<typeof setInterval>));
  const providerManagementService = new ProviderManagementService({
    repository: providerRegistrationRepository,
    adapters: createProviderManagementAdapters({
      twitchOAuthService: twitchAuthService,
      twitchEventSubRuntimeService,
      streamerBotSocketFactory: options.streamerBotSocketFactory ?? createNodeStreamerBotSocket,
      speakerBotSocketFactory,
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
    logger: runtimeLogger,
    streamerBotSubscriptions: streamerBotRuntimeService,
    getVerifiedTwitchBroadcasterId: async () =>
      (await twitchAccountRepository.findConnectedAccount())?.accountId ?? null,
    onEventSourceChanged: syncEventSourceRuntime,
    now
  });
  const alertSetMetadataRepository = new SqliteAlertSetMetadataRepository(database.connection);
  const alertAggregateMutationStore = new SqliteAlertAggregateMutationStore(
    database.connection,
    alertRepository,
    alertSetMetadataRepository,
    alertEditorDocumentRepository
  );
  const listAlertBrowserSources = async (): Promise<readonly AlertBrowserSourceView[]> => {
      const origin = `http://${initialConfig.server.host}:${initialConfig.server.port}`;
      const outputs = await overlayOutputManagementService.listOutputs(origin);
      return outputs
        .filter(
          (output) =>
            output.scope === "module" &&
            output.moduleId === "alerts" &&
            output.purpose === "live" &&
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
            purpose: "live" as const,
            connectionState: connected ? "connected" : latest === null ? "never-connected" : "disconnected",
            lastConnectedAt: latest?.connectedAt ?? null,
            keyId: output.keyId,
            url: output.url,
            copyableUrlStatus: output.copyableUrlStatus
          };
        });
  };
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
    getAudioOutputStatus: () => audioOutputService.getStatus(),
    listAudioOutputRoutes: () => audioOutputService.listRoutes(),
    async enqueueTest(playback) {
      playbackCoordinator.enqueueResolvedTest(playback);
    },
    moderationService,
    async findAssetMediaType(assetId) {
      return (await assetRepository.findById(assetId))?.mediaType ?? null;
    },
    generateId: () => `editor_${randomBytes(12).toString("base64url")}`,
    generateReferenceId: () => `ref_${randomBytes(12).toString("base64url")}`,
    saveAtomically(input) {
      alertAggregateMutationStore.commit({
        expectedRules: [input.expectedRule],
        saveRules: [input.rule],
        saveRuleMetadata: [input.metadata],
        saveDocuments: [input.document]
      });
      return Promise.resolve(input.document);
    },
    now
  });
  const alertSetManagementService = new AlertSetManagementService({
    alertService,
    metadataRepository: alertSetMetadataRepository,
    documents: alertEditorDocumentRepository,
    getEditorDocument: (editorId) => alertEditorService.getDocument(editorId),
    generateId: generateAlertConfigurationId,
    mutationStore: alertAggregateMutationStore,
    listBrowserSources: listAlertBrowserSources
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
    effectRepository,
    ruleMetadataRepository: alertSetMetadataRepository,
    deletePersistedAsset: assetId => maintenanceGate.runConfigurationMutation(
      () => runInTransaction(database.connection, () => assetRepository.deleteSync(assetId))
    ),
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
      const playback = playbackOperationsService.getSnapshot();
      return {
        intakeActive:
          maintenanceGate.activeIntakeCount > 0 ||
          eventSubState === "connecting" ||
          eventSubState === "connected" ||
          eventSubState === "reconnecting" ||
          streamerBotState === "connecting" ||
          streamerBotState === "connected" ||
          streamerBotState === "reconnecting",
        playbackActive: playback.current.length > 0,
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
    reloadRuntimeConfiguration: async () => {
      moderationService.reloadSettings();
      await desktopConfigService.refresh();
      const { playback } = await configStore.readConfig();
      const [alertSettings, effectSettings] = await Promise.all([
        alertModuleSettingsRepository.get(),
        effectModuleSettingsRepository.get()
      ]);
      playbackQueue.setModulePaused(alertSettings.paused);
      effectQueue.setModulePaused(effectSettings.paused);
      await playbackOperationsService.restoreSafety(playback);
    },
    twitchCredentials: {
      async findConnectedAccountId() {
        return (await twitchAccountRepository.findConnectedAccount())?.accountId ?? null;
      },
      async deleteTokenSecrets(accountId) {
        await Promise.all([
          secretStore.deleteSecret(createTwitchTokenSecretRef(accountId, "access_token")),
          secretStore.deleteSecret(createTwitchTokenSecretRef(accountId, "refresh_token"))
        ]);
      }
    },
    runExclusive: (work) => maintenanceGate.runMaintenance(work)
  });
  const managementUiService = new ManagementUiService({
    providerService: providerManagementService,
    alertSetService: alertSetManagementService,
    getTwitchAuthorization: () => twitchAuthService.getStatus(),
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
    getAlertVariationAuthoringContext: (alertId) => alertEditorService.getVariationContext(alertId),
    saveAlertEditorDocument: (alertId, document, confirmLiveImpact, priorityAssignments) =>
      alertEditorService.saveDocument(alertId, document, confirmLiveImpact, priorityAssignments),
    sendAlertEditorTest: (alertId, request) => alertEditorService.sendTest(alertId, request),
    async reportAlertEditorError(alertId, input) {
      await runtimeLogger.error(input.error.cause ?? input.error.summary, {
        module: "alerts",
        source: "management.client.error",
        correlationId: input.error.referenceId,
        processingId: null,
        metadata: {
          summary: input.error.summary,
          nextStep: input.error.nextStep,
          alertId,
          ...(input.setId === null ? {} : { alertSetId: input.setId }),
          ...(input.error.correction === null ? {} : {
            correctionLabel: input.error.correction.label,
            correctionRoute: input.error.correction.route
          })
        }
      });
      return { referenceId: input.error.referenceId };
    },
    listAssetLibraryItems: () => assetLibraryService.listItems(),
    updateAssetMetadata: (assetId, input) => assetLibraryService.updateMetadata(assetId, input),
    getAssetChangeImpact: (assetId, candidateMediaType) =>
      assetLibraryService.getChangeImpact(assetId, candidateMediaType),
    deleteAsset: (assetId) => assetLibraryService.deleteAsset(assetId),
    getDiagnosticsWorkspace: () =>
      diagnosticsService.getWorkspace({ limit: 200, runtimeLogLimit: 200, sinceHours: 2 }),
    getConfigurationBackupSummary: () => configurationBackupService.summary(),
    openDataFolder: () => localMaintenanceService.openDataFolder(),
    clearOldLogs: () => localMaintenanceService.clearOldLogs()
  });
  const overlayModuleRuntimes = new Map<string, OverlayModuleRuntime>([
    ["alerts", {
      async getModuleSnapshot(request: Parameters<EffectPlaybackCoordinator["getModuleSnapshot"]>[0]) {
        const current = playbackQueue.getSnapshot().current;
        const instructions = current === null
          ? []
          : current.alerts
              .map((alert) => alert.overlayInstruction)
              .filter(
                (instruction) =>
                  instruction.overlayId === request.overlayId
                  && instruction.moduleId === request.moduleId
                  && instruction.purpose === request.purpose
                  && instruction.scope === request.scope
                  && (instruction.targetProfileId ?? null) === (request.targetProfileId ?? null)
              );
        return { moduleId: "alerts", enabled: true, instructions };
      }
    }],
    ["screen-effects", effectPlaybackCoordinator]
  ]);
  const overlayCompositionService = new DefaultOverlayCompositionService({
    surfaceRepository,
    configService: overlayModuleConfigService,
    runtime: {
      async getModuleSnapshot(request) {
        const runtime = overlayModuleRuntimes.get(request.moduleId);
        if (runtime === undefined) throw new Error(`Overlay module runtime "${request.moduleId}" is unavailable`);
        return runtime.getModuleSnapshot(request);
      }
    }
  });
  for (const surface of await surfaceRepository.list()) {
    if (surface.kind === "unified-browser") overlayGateway.setSurfaceLayers(surface);
  }
  const surfaceSettingsService = new SurfaceSettingsService({
    surfaces: surfaceRepository,
    ...(options.desktopOverlayTransport === undefined ? {} : { host: {
      configure: config => desktopVisualSink!.configure(config),
      retry: () => options.desktopOverlayTransport!.retry(),
      ...(options.desktopOverlayTransport.getStatus === undefined ? {} : { getStatus: () => options.desktopOverlayTransport!.getStatus!() })
    } }),
    moduleIds: () => overlayModuleRegistry.listModules().map(module => module.id),
    changed: async surface => { if (surface.kind === "unified-browser") overlayGateway.setSurfaceLayers(surface); },
    runMutation: work => maintenanceGate.runIntake(work)
  });
  const effectManagementService = new EffectManagementService({
    sets: effectSetRepository,
    isInActiveSet: (id) => effectRepository.isInActiveSet(id),
    repository: effectRepository,
    async testEffectVariant(effectId, variantId) {
      const outcome = await effectAdmissionService.testEffectVariant(effectId, variantId);
      if (outcome.status === "queued") await effectPlaybackCoordinator.startNext();
      return outcome;
    },
    runMutation: work => maintenanceGate.runIntake(work),
    async isTwitchRewardAvailable(broadcasterId, rewardId) {
      const account = await twitchAccountRepository.findConnectedAccount();
      if (account?.accountId !== broadcasterId) return false;
      try {
        return (await twitchRewardCatalogService.listCustomRewards()).rewards.some(
          (reward) => reward.id === rewardId
        );
      } catch {
        return false;
      }
    },
    async isStreamerBotSelectionConfigured(providerId, sourceKey, eventType) {
      try {
        const providers = await providerManagementService.listProviders("event-source");
        if (!providers.some((provider) => provider.id === providerId && provider.kind === "streamerbot")) {
          return false;
        }
        const catalog = await providerManagementService.getStreamerBotSubscriptions(providerId);
        return isStreamerBotSubscriptionAvailable(catalog, sourceKey, eventType);
      } catch {
        return false;
      }
    }
  });
  const runtimeOverlayModuleConfigService: OverlayModuleConfigService = {
    getModuleConfig: (moduleId) => overlayModuleConfigService.getModuleConfig(moduleId),
    async saveModuleConfig(input) {
      const config = await maintenanceGate.runConfigurationMutation(
        () => overlayModuleConfigService.saveModuleConfig(input)
      );
      if (config.moduleId === "screen-effects" && !config.enabled) {
        await effectPlaybackCoordinator.disable();
      }
      return config;
    },
    async setModuleEnabled(moduleId, enabled) {
      const config = await maintenanceGate.runConfigurationMutation(
        () => overlayModuleConfigService.setModuleEnabled(moduleId, enabled)
      );
      if (config.moduleId === "screen-effects" && !config.enabled) {
        await effectPlaybackCoordinator.disable();
      }
      return config;
    }
  };
  const app = createServerApp({
    surfaceSettingsService,
    metadata: {
      appName: "stream-jams",
      version: "0.0.0"
    },
    webBuildDirectory: options.webBuildDirectory,
    managementSessionService,
    managementOriginPreHandler,
    serverConfigService,
    desktopConfigService,
    audioOutputService,
    overlayModuleRegistry,
    overlayModuleConfigService: runtimeOverlayModuleConfigService,
    moderationService,
    runConfigurationMutation: (work) => maintenanceGate.runConfigurationMutation(work),
    ttsService,
    twitchAuthService,
    twitchRewardCatalogService,
    streamerBotSubscriptionService: providerManagementService,
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
    legacyPlaybackOperationsService: playbackOperationsService,
    playbackOperationsService,
    effectManagementService,
    effectSets: effectManagementService,
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
        correlationId: entry.errorId,
        processingId: null,
        metadata: {
          requestId: entry.requestId,
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
  cleanups.push(() => app.close());
  cleanups.push(() => {
    twitchEventSubRuntimeService.disconnect();
    streamerBotRuntimeService.disconnect();
  });
  cleanups.push(() => maintenanceGate.stop());
  cleanups.push(() => playbackCoordinator.close());
  cleanups.push(() => effectPlaybackCoordinator.close());

  return {
    app,
    desktopConfigService,
    playbackCoordinator,
    effectPlaybackCoordinator,
    playbackOperationsService,
    configStore,
    database,
    managementSessionService,
    overlayAccessService,
    runtimeSecretStoreStatus: runtimeSecretStore.status,
    twitchEventSubRuntimeService,
    streamerBotRuntimeService,
    eventIngestionService,
    syncEventSourceRuntime,
    close
  };
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Runtime composition and cleanup failed", { cause: cleanupError });
    }
    throw error;
  }
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

export function toEventSourceRuntimeError(
  providerName: string,
  status: {
    readonly state: TwitchEventSubRuntimeState;
    readonly message: string | null;
    readonly lastErrorAt: string | null;
    readonly referenceId: string | null;
  }
): ActionableManagementError | null {
  if (toProviderLiveStatus(status.state) !== "error") return null;
  const authorizationUpdateRequired = status.message === "Twitch authorization update required. Reconnect Twitch to grant the added event permissions.";
  return {
    summary: `${providerName} live status error`,
    cause: status.message ?? `${providerName} runtime reported an error.`,
    nextStep: authorizationUpdateRequired
      ? "Reconnect Twitch to grant the added event permissions."
      : "Review the provider connection and reconnect it before retrying.",
    severity: "error",
    occurredAt: status.lastErrorAt,
    referenceId: status.referenceId,
    correction: status.referenceId === null
      ? null
      : { label: "Open diagnostics", route: `/manage/diagnostics?reference=${encodeURIComponent(status.referenceId)}` }
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
  const diagnosticContext = "code" in entry ? {
    code: entry.code,
    ...(entry.ingestProvider === undefined ? {} : { ingestProvider: entry.ingestProvider }),
    ...(entry.source === undefined ? {} : { source: entry.source }),
    ...(entry.subscriptionType === undefined ? {} : { subscriptionType: entry.subscriptionType }),
    ...(entry.upstreamType === undefined ? {} : { upstreamType: entry.upstreamType })
  } : {};
  await logger.error(entry.message, {
    module,
    source,
    correlationId: entry.referenceId,
    processingId: null,
    metadata: { referenceId: entry.referenceId, ...diagnosticContext }
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

export function isEffectBrowserOutputReady(input: {
  readonly hasBrowserVisual: boolean;
  readonly hasBrowserAudio: boolean;
  readonly connectedModuleSource: boolean;
  readonly connectedUnifiedSource: boolean;
  readonly unifiedVisualEnabled: boolean;
}): boolean {
  const visualReady = input.hasBrowserVisual && (
    input.connectedModuleSource
    || (input.connectedUnifiedSource && input.unifiedVisualEnabled)
  );
  const audioReady = input.hasBrowserAudio && (
    input.connectedModuleSource || input.connectedUnifiedSource
  );
  return visualReady || audioReady;
}

function generatePlaybackQueueItemId(): string {
  return `playback_item_${randomBytes(16).toString("base64url")}`;
}

function generateEffectOccurrenceId(): string {
  return `screen_effect_${randomBytes(16).toString("base64url")}`;
}

function generateOverlayClientId(): string {
  return "overlay_client_" + randomBytes(16).toString("base64url");
}

function calculateChecksum(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
