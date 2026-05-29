import {
  appConfigUpdateSchema,
  type AppServerConfig,
  type AppServerConfigUpdate,
  type ConfigStore
} from "@stream-jams/core";
import type { PortAvailabilityChecker } from "../server/port-availability.js";

export type { PortAvailabilityChecker } from "../server/port-availability.js";

export interface ServerConfigServiceOptions {
  readonly configStore: ConfigStore;
  readonly portAvailability: PortAvailabilityChecker;
}

/** Signals that a server config patch failed schema validation before persistence. */
export class ServerConfigValidationError extends Error {
  readonly code = "INVALID_SERVER_CONFIG_UPDATE";
  readonly issues: unknown;

  constructor(issues: unknown) {
    super("Invalid server config update");
    this.issues = issues;
  }
}

/** Signals that a requested localhost port is already unavailable for the server. */
export class PortUnavailableError extends Error {
  readonly code = "PORT_UNAVAILABLE";

  constructor(
    readonly host: "127.0.0.1",
    readonly port: number
  ) {
    super(`Port ${port} is not available on ${host}`);
  }
}

/** Coordinates server-config reads, schema validation, and port availability checks. */
export class ServerConfigService {
  readonly #configStore: ConfigStore;
  readonly #portAvailability: PortAvailabilityChecker;

  constructor(options: ServerConfigServiceOptions) {
    this.#configStore = options.configStore;
    this.#portAvailability = options.portAvailability;
  }

  async getServerConfig(): Promise<AppServerConfig> {
    const config = await this.#configStore.readConfig();
    return config.server;
  }

  async updateServerConfig(patch: AppServerConfigUpdate): Promise<AppServerConfig> {
    const parsedPatch = parseServerConfigPatch(patch);
    const current = await this.#configStore.readConfig();
    const nextPort = parsedPatch.port;
    const nextHost = parsedPatch.host ?? current.server.host;

    if (nextPort !== undefined && nextPort !== current.server.port) {
      const isAvailable = await this.#portAvailability.isPortAvailable(nextHost, nextPort);
      if (!isAvailable) {
        throw new PortUnavailableError(nextHost, nextPort);
      }
    }

    const updated = await this.#configStore.updateConfig({
      server: parsedPatch
    });
    return updated.server;
  }
}

function parseServerConfigPatch(patch: AppServerConfigUpdate): AppServerConfigUpdate {
  const result = appConfigUpdateSchema.safeParse({ server: patch });
  if (!result.success) {
    throw new ServerConfigValidationError(result.error.issues);
  }

  const parsedServerPatch = result.data.server;
  return {
    ...(parsedServerPatch?.host !== undefined ? { host: parsedServerPatch.host } : {}),
    ...(parsedServerPatch?.port !== undefined ? { port: parsedServerPatch.port } : {})
  };
}
