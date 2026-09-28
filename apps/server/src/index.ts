import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { startLocalRuntime } from "./runtime/start-local-runtime.js";
import { installCliShutdown } from "./runtime/cli-shutdown.js";
import { EmergencyLogWriter } from "./modules/diagnostics/emergency-log-writer.js";
import { installFatalProcessErrorHandlers } from "./runtime/fatal-process-errors.js";

const homeDirectory = homedir();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const webBuildDirectory = resolve(currentDirectory, "../../web/dist");
const emergencyWriter = new EmergencyLogWriter({
  filePath: resolve(homeDirectory, ".stream-jams", "logs", "emergency.jsonl")
});
const generateFatalReferenceId = () => `fatal_${randomUUID()}`;
installFatalProcessErrorHandlers({ process, emergencyWriter, generateReferenceId: generateFatalReferenceId });
const pendingRuntime = startLocalRuntime({ homeDirectory, webBuildDirectory });
const shutdown = installCliShutdown(process, pendingRuntime, (error) => {
  process.exitCode = 1;
  emergencyWriter.write({
    timestamp: new Date().toISOString(),
    component: "server",
    event: "process.shutdown.failed",
    referenceId: generateFatalReferenceId(),
    message: "The local runtime failed during shutdown.",
    originalException: error,
    loggerException: null
  });
});

try {
  const runtime = await pendingRuntime;
  const { composition } = runtime;
  if (composition.runtimeSecretStoreStatus.state === "degraded") {
    console.warn(composition.runtimeSecretStoreStatus.message);
  }

  if (!shutdown.isStopping()) console.info(`Stream Jams server listening on ${runtime.url}`);
} catch (error) {
  emergencyWriter.write({
    timestamp: new Date().toISOString(),
    component: "server",
    event: "process.startup.failed",
    referenceId: generateFatalReferenceId(),
    message: "The local runtime failed during startup.",
    originalException: error,
    loggerException: null
  });
  console.error(error);
  process.exitCode = 1;
}
