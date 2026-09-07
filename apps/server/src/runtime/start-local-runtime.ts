import { findSuggestedPorts, NodePortAvailabilityChecker } from "../server/port-availability.js";
import { startServer, type StartupPortInUseError } from "../server/start-server.js";
import { createRuntimeAppComposition, type RuntimeAppComposition, type RuntimeAppCompositionOptions } from "./runtime-composition.js";

export type { RuntimeAppComposition, RuntimeAppCompositionOptions } from "./runtime-composition.js";

export interface StartedLocalRuntime {
  readonly composition: RuntimeAppComposition;
  readonly url: string;
  close(): Promise<void>;
}

export class LocalRuntimeStartupError extends Error {
  constructor(readonly startupError: StartupPortInUseError) {
    super(`${startupError.message}. Suggested alternate ports: ${startupError.suggestedPorts.join(", ") || "none found"}`);
    this.name = "LocalRuntimeStartupError";
  }
}

/** Importing this module never starts a listener or connects a provider. */
export async function startLocalRuntime(options: RuntimeAppCompositionOptions): Promise<StartedLocalRuntime> {
  const portAvailability = options.portAvailability ?? new NodePortAvailabilityChecker();
  const composition = await createRuntimeAppComposition({ ...options, portAvailability });
  try {
    const result = await startServer({
      configStore: composition.configStore,
      createApp: () => composition.app,
      suggestPorts: (host, preferredPort) => findSuggestedPorts({ host, preferredPort, portAvailability })
    });
    if (result.status !== "started") throw new LocalRuntimeStartupError(result.error);
    await composition.syncEventSourceRuntime();
    return { composition, url: result.url, close: composition.close };
  } catch (error) {
    try { await composition.close(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Local runtime startup and cleanup failed", { cause: cleanupError });
    }
    throw error;
  }
}
