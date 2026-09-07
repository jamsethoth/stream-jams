import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startLocalRuntime } from "./runtime/start-local-runtime.js";
import { installCliShutdown } from "./runtime/cli-shutdown.js";

const homeDirectory = homedir();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const webBuildDirectory = resolve(currentDirectory, "../../web/dist");
const pendingRuntime = startLocalRuntime({ homeDirectory, webBuildDirectory });
const shutdown = installCliShutdown(process, pendingRuntime, () => { process.exitCode = 1; });

try {
  const runtime = await pendingRuntime;
  const { composition } = runtime;
  if (composition.runtimeSecretStoreStatus.state === "degraded") {
    console.warn(composition.runtimeSecretStoreStatus.message);
  }

  if (!shutdown.isStopping()) console.info(`Stream Jams server listening on ${runtime.url}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
