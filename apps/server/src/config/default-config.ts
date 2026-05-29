import path from "node:path";
import { defaultLogSettings, type AppConfig } from "@stream-jams/core";

const appDataDirectoryName = ".stream-jams";

export interface PathOperations {
  join(...paths: string[]): string;
}

export interface DefaultAppConfigOptions {
  readonly path?: PathOperations;
}

export interface ConfigFilePathOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly path?: PathOperations;
}

export function createDefaultAppConfig(homeDirectory: string, options: DefaultAppConfigOptions = {}): AppConfig {
  const pathOperations = options.path ?? path;
  const dataRoot = pathOperations.join(homeDirectory, appDataDirectoryName);

  return {
    server: {
      host: "127.0.0.1",
      port: 39187
    },
    storage: {
      dataDirectory: pathOperations.join(dataRoot, "data"),
      assetDirectory: pathOperations.join(dataRoot, "assets")
    },
    logging: defaultLogSettings
  };
}

export function resolveConfigFilePath(homeDirectory: string, options: ConfigFilePathOptions = {}): string {
  const environment = options.environment ?? process.env;
  const pathOperations = options.path ?? path;

  if (environment.STREAM_JAMS_CONFIG_PATH !== undefined && environment.STREAM_JAMS_CONFIG_PATH.trim() !== "") {
    return environment.STREAM_JAMS_CONFIG_PATH;
  }

  return pathOperations.join(homeDirectory, appDataDirectoryName, "config.json");
}
