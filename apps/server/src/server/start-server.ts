import type { ConfigStore } from "@stream-jams/core";

export interface LocalServerApp {
  listen(options: { readonly host: "127.0.0.1"; readonly port: number }): Promise<string>;
}

export interface StartServerOptions {
  readonly configStore: ConfigStore;
  readonly createApp: () => LocalServerApp;
  readonly suggestPorts: (host: "127.0.0.1", port: number) => Promise<number[]>;
}

export interface StartedServerResult {
  readonly status: "started";
  readonly host: "127.0.0.1";
  readonly port: number;
  readonly url: string;
  readonly app: LocalServerApp;
}

export interface PortInUseStartupResult {
  readonly status: "port-in-use";
  readonly error: StartupPortInUseError;
}

export type StartServerResult = PortInUseStartupResult | StartedServerResult;

/** Describes a startup bind failure with alternate ports the operator can try. */
export class StartupPortInUseError extends Error {
  readonly code = "PORT_IN_USE_AT_STARTUP";

  constructor(
    readonly host: "127.0.0.1",
    readonly port: number,
    readonly suggestedPorts: readonly number[],
    readonly cause: unknown
  ) {
    super(`Port ${port} is already in use on ${host}`);
  }
}

export async function startServer(options: StartServerOptions): Promise<StartServerResult> {
  const config = await options.configStore.readConfig();
  const app = options.createApp();

  try {
    const url = await app.listen(config.server);
    return {
      status: "started",
      host: config.server.host,
      port: config.server.port,
      url,
      app
    };
  } catch (error) {
    if (!isAddressInUseError(error)) {
      throw error;
    }

    return {
      status: "port-in-use",
      error: new StartupPortInUseError(
        config.server.host,
        config.server.port,
        await options.suggestPorts(config.server.host, config.server.port),
        error
      )
    };
  }
}

function isAddressInUseError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}
