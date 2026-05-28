import type { AppConfig, AppConfigUpdate, ConfigStore, LogSettings, LogSettingsUpdate } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { LogConfigService } from "./log-config-service.js";

const baseConfig: AppConfig = {
  server: {
    host: "127.0.0.1",
    port: 39187
  },
  storage: {
    dataDirectory: "/tmp/stream-jams/data",
    assetDirectory: "/tmp/stream-jams/assets"
  },
  logging: {
    level: "INFO",
    rollover: "hourly",
    retentionHours: 48
  }
};

describe("LogConfigService", () => {
  it("reads logging settings from the config store", async () => {
    const store = new RecordingConfigStore(baseConfig);
    const service = new LogConfigService(store);

    await expect(service.getSettings()).resolves.toEqual(baseConfig.logging);
    expect(store.readCount).toBe(1);
    expect(store.updates).toEqual([]);
  });

  it("persists validated logging settings updates through the config store", async () => {
    const store = new RecordingConfigStore(baseConfig);
    const service = new LogConfigService(store);

    const updated = await service.updateSettings({ level: "DEBUG" });

    expect(store.updates).toEqual([
      {
        logging: {
          level: "DEBUG"
        }
      }
    ]);
    expect(updated).toEqual({
      level: "DEBUG",
      rollover: "hourly",
      retentionHours: 48
    });
  });

  it("rejects unsupported settings before they reach config persistence", async () => {
    const store = new RecordingConfigStore(baseConfig);
    const service = new LogConfigService(store);

    await expect(service.updateSettings({ level: "TRACE" } as unknown as LogSettingsUpdate)).rejects.toThrow();
    expect(store.updates).toEqual([]);
  });

  it("preserves hourly rollover when only retention changes", async () => {
    const store = new RecordingConfigStore(baseConfig);
    const service = new LogConfigService(store);

    const updated = await service.updateSettings({ retentionHours: 12 });

    expect(updated).toEqual({
      level: "INFO",
      rollover: "hourly",
      retentionHours: 12
    });
  });
});

/** Logging-config test store that records patches and emulates config merges. */
class RecordingConfigStore implements ConfigStore {
  readCount = 0;
  readonly updates: AppConfigUpdate[] = [];
  #config: AppConfig;

  constructor(config: AppConfig) {
    this.#config = config;
  }

  async readConfig(): Promise<AppConfig> {
    this.readCount += 1;
    return this.#config;
  }

  async updateConfig(patch: AppConfigUpdate): Promise<AppConfig> {
    this.updates.push(patch);
    this.#config = {
      ...this.#config,
      server: {
        ...this.#config.server,
        ...patch.server
      },
      storage: {
        ...this.#config.storage,
        ...patch.storage
      },
      logging: mergeLogSettings(this.#config.logging, patch.logging)
    };
    return this.#config;
  }
}

function mergeLogSettings(current: LogSettings, patch: LogSettingsUpdate | undefined): LogSettings {
  if (patch === undefined) {
    return current;
  }

  return {
    level: patch.level ?? current.level,
    rollover: patch.rollover ?? current.rollover,
    retentionHours: patch.retentionHours ?? current.retentionHours
  };
}
