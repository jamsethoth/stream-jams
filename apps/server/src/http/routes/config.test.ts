import type { AppConfig, AppConfigUpdate, ConfigStore } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { ServerConfigService, type PortAvailabilityChecker } from "../../config/server-config-service.js";

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

describe("server config routes", () => {
  it("returns non-secret server config only", async () => {
    const { app } = createAppWithConfig();

    const response = await app.inject({
      method: "GET",
      url: "/config/server"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      host: "127.0.0.1",
      port: 39187
    });
    expect(response.body).not.toContain("assetDirectory");
    expect(response.body).not.toContain("logging");
  });

  it("persists valid server config updates and strips extra body fields", async () => {
    const { app, store, portAvailability } = createAppWithConfig();

    const response = await app.inject({
      method: "PATCH",
      url: "/config/server",
      payload: {
        port: 39188,
        apiKey: "secret-shaped-field"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
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
    expect(JSON.stringify(store.updates)).not.toContain("secret-shaped-field");
  });

  it("returns 400 for invalid port updates without writing config", async () => {
    const { app, store, portAvailability } = createAppWithConfig();

    const response = await app.inject({
      method: "PATCH",
      url: "/config/server",
      payload: {
        port: 0
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_SERVER_CONFIG_UPDATE",
        message: "Invalid server config update"
      }
    });
    expect(portAvailability.checks).toEqual([]);
    expect(store.updates).toEqual([]);
  });

  it("returns 409 for unavailable port updates without writing config", async () => {
    const { app, store, portAvailability } = createAppWithConfig({ available: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/config/server",
      payload: {
        port: 39189
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: {
        code: "PORT_UNAVAILABLE",
        message: "Port 39189 is not available on 127.0.0.1",
        host: "127.0.0.1",
        port: 39189
      }
    });
    expect(portAvailability.checks).toEqual([{ host: "127.0.0.1", port: 39189 }]);
    expect(store.updates).toEqual([]);
  });
});

function createAppWithConfig(options: { readonly available?: boolean } = {}) {
  const store = new RecordingConfigStore(baseConfig);
  const portAvailability = new FixedPortAvailability(options.available ?? true);
  const serverConfigService = new ServerConfigService({
    configStore: store,
    portAvailability
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    serverConfigService
  });

  return { app, store, portAvailability };
}

/** Route-test config store that exposes the exact patches persisted by HTTP requests. */
class RecordingConfigStore implements ConfigStore {
  readonly updates: AppConfigUpdate[] = [];
  #config: AppConfig;

  constructor(config: AppConfig) {
    this.#config = config;
  }

  async readConfig(): Promise<AppConfig> {
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

/** Route-test port checker that records availability checks for assertion. */
class FixedPortAvailability implements PortAvailabilityChecker {
  readonly checks: Array<{ readonly host: "127.0.0.1"; readonly port: number }> = [];

  constructor(private readonly available: boolean) {}

  async isPortAvailable(host: "127.0.0.1", port: number): Promise<boolean> {
    this.checks.push({ host, port });
    return this.available;
  }
}
