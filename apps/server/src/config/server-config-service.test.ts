import type { AppConfig, AppConfigUpdate, AppServerConfig, ConfigStore } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { ServerConfigService, type PortAvailabilityChecker } from "./server-config-service.js";

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
  },
  playback: { paused: false, muted: false, doNotDisturb: false }
};

describe("ServerConfigService", () => {
  it("reads server config without exposing storage or logging settings", async () => {
    const store = new RecordingConfigStore(baseConfig);
    const service = new ServerConfigService({
      configStore: store,
      portAvailability: new FixedPortAvailability(true)
    });

    await expect(service.getServerConfig()).resolves.toEqual({
      host: "127.0.0.1",
      port: 39187
    });
    expect(store.readCount).toBe(1);
    expect(store.updates).toEqual([]);
  });

  it("persists sanitized valid port updates after checking port availability", async () => {
    const store = new RecordingConfigStore(baseConfig);
    const portAvailability = new FixedPortAvailability(true);
    const service = new ServerConfigService({ configStore: store, portAvailability });

    const updated = await service.updateServerConfig({
      port: 39188,
      apiKey: "secret-value"
    } as unknown as AppServerConfig);

    expect(updated).toEqual({
      host: "127.0.0.1",
      port: 39188
    });
    expect(portAvailability.checks).toEqual([{ host: "127.0.0.1", port: 39188 }]);
    expect(store.updates).toEqual([
      {
        server: {
          port: 39188
        }
      }
    ]);
  });

  it("rejects invalid ports before checking availability or writing config", async () => {
    const store = new RecordingConfigStore(baseConfig);
    const portAvailability = new FixedPortAvailability(true);
    const service = new ServerConfigService({ configStore: store, portAvailability });

    await expect(service.updateServerConfig({ port: 65_536 })).rejects.toThrow("Invalid server config update");

    expect(portAvailability.checks).toEqual([]);
    expect(store.updates).toEqual([]);
  });

  it("rejects unavailable new ports before writing config", async () => {
    const store = new RecordingConfigStore(baseConfig);
    const portAvailability = new FixedPortAvailability(false);
    const service = new ServerConfigService({ configStore: store, portAvailability });

    await expect(service.updateServerConfig({ port: 39189 })).rejects.toMatchObject({
      code: "PORT_UNAVAILABLE",
      host: "127.0.0.1",
      port: 39189
    });

    expect(portAvailability.checks).toEqual([{ host: "127.0.0.1", port: 39189 }]);
    expect(store.updates).toEqual([]);
  });

  it("does not availability-check an unchanged current port", async () => {
    const store = new RecordingConfigStore(baseConfig);
    const portAvailability = new FixedPortAvailability(false);
    const service = new ServerConfigService({ configStore: store, portAvailability });

    await expect(service.updateServerConfig({ port: 39187 })).resolves.toEqual({
      host: "127.0.0.1",
      port: 39187
    });

    expect(portAvailability.checks).toEqual([]);
    expect(store.updates).toEqual([
      {
        server: {
          port: 39187
        }
      }
    ]);
  });
});

/** Test double that records config-store writes made by ServerConfigService. */
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
      }
    };
    return this.#config;
  }
}

/** Test double that records port checks and returns one configured availability result. */
class FixedPortAvailability implements PortAvailabilityChecker {
  readonly checks: Array<{ readonly host: "127.0.0.1"; readonly port: number }> = [];

  constructor(private readonly available: boolean) {}

  async isPortAvailable(host: "127.0.0.1", port: number): Promise<boolean> {
    this.checks.push({ host, port });
    return this.available;
  }
}
