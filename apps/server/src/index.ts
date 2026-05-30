import { createHash, randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DefaultAssetValidator,
  DefaultMediaImportPipeline,
  DefaultOverlayModuleConfigService,
  NoopMediaTranscodingStage
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
import { LocalAssetStore } from "./modules/assets/local-asset-store.js";
import { openStreamJamsDatabase } from "./modules/db/database.js";
import { InMemoryServerOverlayModuleConfigRepository } from "./modules/overlay-modules/in-memory-module-config-repository.js";
import { SqliteAssetRepository } from "./modules/assets/sqlite-asset-repository.js";
import { createStaticOverlayModuleRegistry } from "./modules/overlay-modules/static-module-registry.js";
import { findSuggestedPorts, NodePortAvailabilityChecker } from "./server/port-availability.js";
import { startServer } from "./server/start-server.js";

const homeDirectory = homedir();
const portAvailability = new NodePortAvailabilityChecker();
const configStore = new FileConfigStore({
  configFilePath: resolveConfigFilePath(homeDirectory),
  defaultConfig: createDefaultAppConfig(homeDirectory)
});
const initialConfig = await configStore.readConfig();
const database = openStreamJamsDatabase(join(initialConfig.storage.dataDirectory, "stream-jams.sqlite"));
const assetRepository = new SqliteAssetRepository(database.connection);
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
        assetRepository,
        mediaImportPipeline,
        assetStore,
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

function generateAssetId(): string {
  return `asset_${randomBytes(16).toString("base64url")}`;
}

function calculateChecksum(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
