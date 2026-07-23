import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AppConfig, AppConfigUpdate } from "@stream-jams/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileConfigStore } from "./file-config-store.js";

const defaultConfig: AppConfig = {
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
  playback: {
    paused: false,
    muted: false,
    doNotDisturb: false
  }
};

describe("FileConfigStore", () => {
  let tempDirectory: string;
  let configFilePath: string;

  beforeEach(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "stream-jams-config-"));
    configFilePath = join(tempDirectory, "nested", "app-config.json");
  });

  afterEach(async () => {
    await rm(tempDirectory, { force: true, recursive: true });
  });

  it("creates and returns the default config when the file is missing", async () => {
    const store = new FileConfigStore({ configFilePath, defaultConfig });

    await expect(store.readConfig()).resolves.toEqual(defaultConfig);
    await expect(readFile(configFilePath, "utf8")).resolves.toContain("\"port\": 39187");
  });

  it("persists validated partial updates over the current config", async () => {
    const store = new FileConfigStore({ configFilePath, defaultConfig });

    const updated = await store.updateConfig({
      server: {
        port: 39188
      },
      storage: {
        assetDirectory: "/tmp/stream-jams/imported-assets"
      },
      playback: {
        muted: true
      }
    });

    expect(updated).toEqual({
      server: {
        host: "127.0.0.1",
        port: 39188
      },
      storage: {
        dataDirectory: "/tmp/stream-jams/data",
        assetDirectory: "/tmp/stream-jams/imported-assets"
      },
      logging: defaultConfig.logging,
      playback: {
        paused: false,
        muted: true,
        doNotDisturb: false
      }
    });

    await expect(new FileConfigStore({ configFilePath, defaultConfig }).readConfig()).resolves.toEqual({
      server: {
        host: "127.0.0.1",
        port: 39188
      },
      storage: {
        dataDirectory: "/tmp/stream-jams/data",
        assetDirectory: "/tmp/stream-jams/imported-assets"
      },
      logging: defaultConfig.logging,
      playback: {
        paused: false,
        muted: true,
        doNotDisturb: false
      }
    });
  });

  it("rejects invalid persisted config before returning it", async () => {
    const store = new FileConfigStore({ configFilePath, defaultConfig });
    await store.readConfig();
    await writeFile(
      configFilePath,
      JSON.stringify({
        ...defaultConfig,
        server: {
          host: "0.0.0.0",
          port: 39187
        }
      })
    );

    await expect(store.readConfig()).rejects.toThrow("Invalid app config");
  });

  it("backfills default logging settings for older persisted config files", async () => {
    await mkdir(join(tempDirectory, "nested"), { recursive: true });
    await writeFile(
      configFilePath,
      JSON.stringify({
        server: defaultConfig.server,
        storage: defaultConfig.storage
      })
    );
    const store = new FileConfigStore({ configFilePath, defaultConfig });

    await expect(store.readConfig()).resolves.toEqual(defaultConfig);
  });

  it("does not write secret-shaped patch fields to config data", async () => {
    const store = new FileConfigStore({ configFilePath, defaultConfig });
    const patchWithSecrets = {
      server: {
        port: 39189,
        apiKey: "server-api-key"
      },
      storage: {
        dataDirectory: "/tmp/stream-jams/new-data",
        oauthToken: "storage-oauth-token"
      },
      logging: {
        level: "DEBUG",
        retentionHours: 72,
        apiKey: "logging-secret"
      },
      twitch: {
        accessToken: "twitch-access-token"
      }
    } as unknown as AppConfigUpdate;

    await store.updateConfig(patchWithSecrets);

    const persisted = await readFile(configFilePath, "utf8");
    expect(persisted).toContain("\"port\": 39189");
    expect(persisted).toContain("\"level\": \"DEBUG\"");
    expect(persisted).toContain("\"retentionHours\": 72");
    expect(persisted).not.toContain("server-api-key");
    expect(persisted).not.toContain("storage-oauth-token");
    expect(persisted).not.toContain("logging-secret");
    expect(persisted).not.toContain("twitch-access-token");
    expect(persisted).not.toContain("apiKey");
    expect(persisted).not.toContain("oauthToken");
    expect(persisted).not.toContain("accessToken");
  });

  it("writes UTF-8 JSON with a stable line-feed terminator", async () => {
    const unicodeConfig: AppConfig = {
      ...defaultConfig,
      storage: {
        dataDirectory: "/tmp/stream-jams/Café/data",
        assetDirectory: "/tmp/stream-jams/Café/assets"
      }
    };
    const store = new FileConfigStore({ configFilePath, defaultConfig: unicodeConfig });

    await store.readConfig();

    const rawBytes = await readFile(configFilePath);
    const persisted = rawBytes.toString("utf8");
    expect(persisted).toContain("Café");
    expect(rawBytes).toEqual(Buffer.from(persisted, "utf8"));
    expect(persisted.endsWith("\n")).toBe(true);
    expect(persisted.endsWith("\r\n")).toBe(false);
  });
});
