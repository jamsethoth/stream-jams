import { homedir } from "node:os";
import { createServerApp } from "./app.js";
import { createDefaultAppConfig, resolveConfigFilePath } from "./config/default-config.js";
import { FileConfigStore } from "./config/file-config-store.js";
import { ServerConfigService } from "./config/server-config-service.js";
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

try {
  const result = await startServer({
    configStore,
    createApp: () =>
      createServerApp({
        metadata: {
          appName: "stream-jams",
          version: "0.0.0"
        },
        serverConfigService
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
