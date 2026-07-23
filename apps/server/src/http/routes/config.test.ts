import type { AppConfig, AppConfigUpdate, ConfigStore } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createServerApp } from "../../app.js";
import { ServerConfigService, type PortAvailabilityChecker } from "../../config/server-config-service.js";
import { createLocalManagementRateLimitPreHandler, LocalManagementRateLimiter } from "../middleware/local-management-rate-limit.js";
import { createManagementAuthPreHandler } from "../middleware/management-auth.js";
import { LocalManagementSessionService } from "../../modules/auth/management-session-service.js";

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

describe("server config routes", () => {
  it("returns non-secret server config only", async () => {
    const { app, authHeaders } = await createAppWithConfig();

    const response = await app.inject({
      method: "GET",
      url: "/config/server",
      headers: authHeaders
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
    const { app, store, portAvailability, authHeaders } = await createAppWithConfig();

    const response = await app.inject({
      method: "PATCH",
      url: "/config/server",
      headers: authHeaders,
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
    const { app, store, portAvailability, authHeaders } = await createAppWithConfig();

    const response = await app.inject({
      method: "PATCH",
      url: "/config/server",
      headers: authHeaders,
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
    const { app, store, portAvailability, authHeaders } = await createAppWithConfig({ available: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/config/server",
      headers: authHeaders,
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

  it("rejects missing management sessions before reading filesystem-backed config", async () => {
    const { app, store } = await createAppWithConfig();

    const response = await app.inject({
      method: "GET",
      url: "/config/server"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "MANAGEMENT_SESSION_REQUIRED"
      }
    });
    expect(store.readCount).toBe(0);
    expect(store.updates).toEqual([]);
  });

  it("rejects overlay route keys before they can mutate server config", async () => {
    const { app, store, portAvailability } = await createAppWithConfig();

    const response = await app.inject({
      method: "PATCH",
      url: "/config/server",
      headers: {
        authorization: "Bearer ovl_overlay-key-is-not-management"
      },
      payload: {
        port: 39190
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: "MANAGEMENT_SESSION_UNAUTHORIZED",
        reason: "not-found"
      }
    });
    expect(portAvailability.checks).toEqual([]);
    expect(store.readCount).toBe(0);
    expect(store.updates).toEqual([]);
  });

  it("rate limits repeated management config reads before repeated filesystem-backed work", async () => {
    const { app, store, authHeaders } = await createAppWithConfig({ maxManagementRequests: 2 });

    expect((await app.inject({ method: "GET", url: "/config/server", headers: authHeaders })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/config/server", headers: authHeaders })).statusCode).toBe(200);
    const rejected = await app.inject({ method: "GET", url: "/config/server", headers: authHeaders });

    expect(rejected.statusCode).toBe(429);
    expect(rejected.json()).toEqual({
      error: {
        code: "MANAGEMENT_RATE_LIMITED",
        message: "Too many management requests",
        retryAfterSeconds: 60
      }
    });
    expect(store.readCount).toBe(2);
  });

  it("rate limits repeated unauthenticated management requests before filesystem-backed work", async () => {
    const { app, store } = await createAppWithConfig({ maxManagementRequests: 2 });

    expect((await app.inject({ method: "GET", url: "/config/server" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/config/server" })).statusCode).toBe(401);
    const rejected = await app.inject({ method: "GET", url: "/config/server" });

    expect(rejected.statusCode).toBe(429);
    expect(rejected.json()).toMatchObject({
      error: {
        code: "MANAGEMENT_RATE_LIMITED"
      }
    });
    expect(store.readCount).toBe(0);
    expect(store.updates).toEqual([]);
  });
});

async function createAppWithConfig(
  options: { readonly available?: boolean; readonly maxManagementRequests?: number } = {}
) {
  const store = new RecordingConfigStore(baseConfig);
  const portAvailability = new FixedPortAvailability(options.available ?? true);
  const serverConfigService = new ServerConfigService({
    configStore: store,
    portAvailability
  });
  const managementSessionService = new LocalManagementSessionService({
    clock: () => new Date("2026-05-29T12:00:00.000Z"),
    generateId: () => "mgmt_config-route-session",
    sessionTtlMs: 60_000
  });
  const session = await managementSessionService.createSession();
  const managementRateLimiter = new LocalManagementRateLimiter({
    maxRequests: options.maxManagementRequests ?? 100,
    windowMs: 60_000,
    clock: () => new Date("2026-05-29T12:00:00.000Z")
  });
  const app = createServerApp({
    metadata: {
      appName: "stream-jams",
      version: "1.2.3"
    },
    serverConfigService,
    managementAuthPreHandler: createManagementAuthPreHandler({ sessionService: managementSessionService }),
    managementRateLimitPreHandler: createLocalManagementRateLimitPreHandler({ limiter: managementRateLimiter })
  });
  const authHeaders = {
    authorization: `Bearer ${session.id}`
  };

  return { app, store, portAvailability, authHeaders };
}

/** Route-test config store that exposes the exact patches persisted by HTTP requests. */
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

/** Route-test port checker that records availability checks for assertion. */
class FixedPortAvailability implements PortAvailabilityChecker {
  readonly checks: Array<{ readonly host: "127.0.0.1"; readonly port: number }> = [];

  constructor(private readonly available: boolean) {}

  async isPortAvailable(host: "127.0.0.1", port: number): Promise<boolean> {
    this.checks.push({ host, port });
    return this.available;
  }
}
