import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
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
import { openStreamJamsDatabase } from "./modules/db/database.js";
import { InMemoryServerOverlayModuleConfigRepository } from "./modules/overlay-modules/in-memory-module-config-repository.js";
import { SqliteAssetRepository } from "./modules/assets/sqlite-asset-repository.js";
import { createStaticOverlayModuleRegistry } from "./modules/overlay-modules/static-module-registry.js";
import { LocalOverlayAccessService } from "./modules/overlays/overlay-access-service.js";
import { SqliteOverlayAccessKeyRepository } from "./modules/overlays/sqlite-overlay-access-key-repository.js";
import { PlaybackCoordinator } from "./modules/playback/playback-coordinator.js";
import { DevSecretStore } from "./modules/security/dev-secret-store.js";
import { DefaultTwitchApiClient } from "./modules/twitch/twitch-api-client.js";
import { TwitchOAuthService } from "./modules/twitch/twitch-oauth-service.js";
import { SqliteTwitchAccountRepository } from "./modules/twitch/sqlite-twitch-account-repository.js";
import { createDefaultTtsProviderRegistry } from "./modules/tts/tts-provider-registry.js";
import { findSuggestedPorts, NodePortAvailabilityChecker } from "./server/port-availability.js";
import { OverlayGateway } from "./websocket/overlay-gateway.js";
import { startServer } from "./server/start-server.js";

const homeDirectory = homedir();
const portAvailability = new NodePortAvailabilityChecker();
const configStore = new FileConfigStore({
  configFilePath: resolveConfigFilePath(homeDirectory),
  defaultConfig: createDefaultAppConfig(homeDirectory)
});
const initialConfig = await configStore.readConfig();
const database = openStreamJamsDatabase(join(initialConfig.storage.dataDirectory, "stream-jams.sqlite"));
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
const twitchAuthService = new TwitchOAuthService({
  apiClient: new DefaultTwitchApiClient(),
  clientId: process.env.TWITCH_CLIENT_ID ?? "",
  clientSecret: process.env.TWITCH_CLIENT_SECRET ?? "",
  generateState: () => randomBytes(24).toString("base64url"),
  repository: twitchAccountRepository,
  secretStore
});
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
  assetRepository,
  overlayPlaybackSink: overlayGateway
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
        managementSessionService,
        serverConfigService,
        overlayModuleRegistry,
        overlayModuleConfigService,
        moderationService,
        ttsService,
        twitchAuthService,
        overlayAccessService,
        overlayCompositionService,
        overlayGateway,
        alertService,
        assetRepository,
        mediaImportPipeline,
        assetStore,
        playbackCoordinator,
        managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
        managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
      }),
    suggestPorts: (host, port) =>
      findSuggestedPorts({
        host,
        preferredPort: port,
        portAvailability
      })
  });

  if (result.status === "started") {
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

function generateAlertConfigurationId(kind: "collection" | "rule" | "variant"): string {
  return `alert_${kind}_${randomBytes(16).toString("base64url")}`;
}

function generateAssetId(): string {
  return `asset_${randomBytes(16).toString("base64url")}`;
}

function generateResolvedAlertId(kind: "resolved-alert" | "overlay-instruction"): string {
  return `playback_${kind}_${randomBytes(16).toString("base64url")}`;
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
