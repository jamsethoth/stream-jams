import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findSuggestedPorts, NodePortAvailabilityChecker } from "./server/port-availability.js";
import { startServer } from "./server/start-server.js";
import { createRuntimeAppComposition } from "./runtime/runtime-composition.js";

const homeDirectory = homedir();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const webBuildDirectory = resolve(currentDirectory, "../../web/dist");
const portAvailability = new NodePortAvailabilityChecker();

try {
  const composition = await createRuntimeAppComposition({
    homeDirectory,
    webBuildDirectory,
    portAvailability
  });
  if (composition.runtimeSecretStoreStatus.state === "degraded") {
    console.warn(composition.runtimeSecretStoreStatus.message);
  }

  const result = await startServer({
    configStore: composition.configStore,
    createApp: () => composition.app,
    suggestPorts: (host, port) =>
      findSuggestedPorts({
        host,
        preferredPort: port,
        portAvailability
      })
  });

  if (result.status === "started") {
    await composition.syncEventSourceRuntime();
    console.info(`Stream Jams server listening on ${result.url}`);
  } else {
    console.error(
      `${result.error.message}. Suggested alternate ports: ${formatSuggestedPorts(result.error.suggestedPorts)}`
    );
    process.exitCode = 1;
    await composition.close();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

function formatSuggestedPorts(ports: readonly number[]): string {
  return ports.length > 0 ? ports.join(", ") : "none found";
}
