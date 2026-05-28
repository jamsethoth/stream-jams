import { join } from "node:path";
import { defaultLogSettings, type AppConfig } from "@stream-jams/core";

const appDataDirectoryName = ".stream-jams";

export function createDefaultAppConfig(homeDirectory: string): AppConfig {
  const dataRoot = join(homeDirectory, appDataDirectoryName);

  return {
    server: {
      host: "127.0.0.1",
      port: 39187
    },
    storage: {
      dataDirectory: join(dataRoot, "data"),
      assetDirectory: join(dataRoot, "assets")
    },
    logging: defaultLogSettings
  };
}

export function resolveConfigFilePath(homeDirectory: string, environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.STREAM_JAMS_CONFIG_PATH !== undefined && environment.STREAM_JAMS_CONFIG_PATH.trim() !== "") {
    return environment.STREAM_JAMS_CONFIG_PATH;
  }

  return join(homeDirectory, appDataDirectoryName, "config.json");
}
