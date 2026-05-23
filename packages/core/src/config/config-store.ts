import type { AppConfig, AppConfigUpdate } from "./types.js";

export interface ConfigStore {
  readConfig(): Promise<AppConfig>;
  updateConfig(patch: AppConfigUpdate): Promise<AppConfig>;
}
