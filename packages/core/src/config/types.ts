import type { LogSettings, LogSettingsUpdate } from "../diagnostics/logging.js";

export interface AppServerConfig {
  readonly host: "127.0.0.1";
  readonly port: number;
}

export interface AppStorageConfig {
  readonly dataDirectory: string;
  readonly assetDirectory: string;
}

export interface AppConfig {
  readonly server: AppServerConfig;
  readonly storage: AppStorageConfig;
  readonly logging: LogSettings;
}

export interface AppServerConfigUpdate {
  readonly host?: "127.0.0.1";
  readonly port?: number;
}

export interface AppStorageConfigUpdate {
  readonly dataDirectory?: string;
  readonly assetDirectory?: string;
}

export interface AppConfigUpdate {
  readonly server?: AppServerConfigUpdate;
  readonly storage?: AppStorageConfigUpdate;
  readonly logging?: LogSettingsUpdate;
}
