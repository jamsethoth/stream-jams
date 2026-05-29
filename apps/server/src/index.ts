import { homedir } from "node:os";
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
import { findSuggestedPorts, NodePortAvailabilityChecker } from "./server/port-availability.js";
import { startServer } from "./server/start-server.js";

const homeDirectory = homedir();
const portAvailability = new NodePortAvailabilityChecker();
const configStore = new FileConfigStore({
  configFilePath: resolveConfigFilePath(homeDirectory),
  defaultConfig: createDefaultAppConfig(homeDirectory)
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
