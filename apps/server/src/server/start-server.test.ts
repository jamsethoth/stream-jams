import type { AppConfig, ConfigStore } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { startServer, type LocalServerApp } from "./start-server.js";

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

describe("startServer", () => {
  it("reads config and starts the app on the configured localhost port", async () => {
    const app = new RecordingServerApp();
    const configStore = new StaticConfigStore(baseConfig);

    await expect(
      startServer({
        configStore,
        createApp: () => app,
        suggestPorts: async () => []
      })
    ).resolves.toEqual({
      status: "started",
      host: "127.0.0.1",
      port: 39187,
      url: "http://127.0.0.1:39187",
      app
    });
    expect(configStore.readCount).toBe(1);
    expect(app.listenCalls).toEqual([{ host: "127.0.0.1", port: 39187 }]);
  });

  it("returns a structured startup error with suggested alternates when the configured port is occupied", async () => {
    const cause = Object.assign(new Error("address already in use"), { code: "EADDRINUSE" });
    const app = new RecordingServerApp(cause);
    const suggestedPortCalls: Array<{ readonly host: "127.0.0.1"; readonly port: number }> = [];

    const result = await startServer({
      configStore: new StaticConfigStore(baseConfig),
      createApp: () => app,
      suggestPorts: async (host, port) => {
        suggestedPortCalls.push({ host, port });
        return [39188, 39189, 39190];
      }
    });

    expect(result).toMatchObject({
      status: "port-in-use",
      error: {
        code: "PORT_IN_USE_AT_STARTUP",
        host: "127.0.0.1",
        port: 39187,
        suggestedPorts: [39188, 39189, 39190],
        message: "Port 39187 is already in use on 127.0.0.1"
      }
    });
    expect(result.status === "port-in-use" ? result.error.cause : undefined).toBe(cause);
    expect(suggestedPortCalls).toEqual([{ host: "127.0.0.1", port: 39187 }]);
  });

  it("throws non-port startup errors instead of hiding them as collisions", async () => {
    const app = new RecordingServerApp(new Error("certificate setup failed"));

    await expect(
      startServer({
        configStore: new StaticConfigStore(baseConfig),
        createApp: () => app,
        suggestPorts: async () => []
      })
    ).rejects.toThrow("certificate setup failed");
  });
});

/** Startup-test config store that returns one fixed app config and counts reads. */
class StaticConfigStore implements ConfigStore {
  readCount = 0;

  constructor(private readonly config: AppConfig) {}

  async readConfig(): Promise<AppConfig> {
    this.readCount += 1;
    return this.config;
  }

  async updateConfig(): Promise<AppConfig> {
    return this.config;
  }
}

/** Startup-test app double that records listen calls and can simulate bind failures. */
class RecordingServerApp implements LocalServerApp {
  readonly listenCalls: Array<{ readonly host: "127.0.0.1"; readonly port: number }> = [];

  constructor(private readonly listenError?: Error & { readonly code?: string }) {}

  async listen(options: { readonly host: "127.0.0.1"; readonly port: number }): Promise<string> {
    this.listenCalls.push(options);
    if (this.listenError !== undefined) {
      throw this.listenError;
    }

    return `http://${options.host}:${options.port}`;
  }
}
