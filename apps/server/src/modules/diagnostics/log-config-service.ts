import {
  logSettingsUpdateSchema,
  type ConfigStore,
  type LogSettings,
  type LogSettingsUpdate
} from "@stream-jams/core";

export class LogConfigService {
  readonly #configStore: ConfigStore;

  constructor(configStore: ConfigStore) {
    this.#configStore = configStore;
  }

  async getSettings(): Promise<LogSettings> {
    const config = await this.#configStore.readConfig();
    return config.logging;
  }

  async updateSettings(patch: LogSettingsUpdate): Promise<LogSettings> {
    const parsedPatch = logSettingsUpdateSchema.parse(patch);
    const config = await this.#configStore.updateConfig({
      logging: parsedPatch
    });

    return config.logging;
  }
}
