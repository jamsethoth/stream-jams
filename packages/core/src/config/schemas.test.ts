import { describe, expect, it } from "vitest";
import { appConfigSchema, appConfigUpdateSchema } from "./schemas.js";
import { appConfigSchema as exportedAppConfigSchema, defaultLogSettings } from "../index.js";

const validConfig = {
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

describe("appConfigSchema", () => {
  it("accepts local-only server and storage settings", () => {
    const expected = {
      ...validConfig,
      playback: {
        paused: false,
        muted: false,
        doNotDisturb: false
      }
    };

    expect(appConfigSchema.parse(validConfig)).toEqual(expected);
    expect(exportedAppConfigSchema.parse(validConfig)).toEqual(expected);
  });

  it("backfills default logging settings when reading older config files", () => {
    const legacyConfig = {
      server: validConfig.server,
      storage: validConfig.storage
    };

    expect(appConfigSchema.parse(legacyConfig)).toEqual({
      ...legacyConfig,
      logging: defaultLogSettings,
      playback: {
        paused: false,
        muted: false,
        doNotDisturb: false
      }
    });
  });

  it("validates persisted playback safety state", () => {
    expect(
      appConfigSchema.parse({
        ...validConfig,
        playback: {
          paused: true,
          muted: true,
          doNotDisturb: true
        }
      }).playback
    ).toEqual({ paused: true, muted: true, doNotDisturb: true });
    expect(
      appConfigSchema.safeParse({
        ...validConfig,
        playback: {
          paused: "yes",
          muted: false,
          doNotDisturb: false
        }
      }).success
    ).toBe(false);
  });

  it("rejects non-local hosts, invalid ports, and empty directories", () => {
    expect(appConfigSchema.safeParse({ ...validConfig, server: { ...validConfig.server, host: "0.0.0.0" } }).success).toBe(
      false
    );
    expect(appConfigSchema.safeParse({ ...validConfig, server: { ...validConfig.server, port: 0 } }).success).toBe(false);
    expect(appConfigSchema.safeParse({ ...validConfig, server: { ...validConfig.server, port: 65_536 } }).success).toBe(
      false
    );
    expect(
      appConfigSchema.safeParse({ ...validConfig, storage: { ...validConfig.storage, dataDirectory: " " } }).success
    ).toBe(false);
  });
});

describe("appConfigUpdateSchema", () => {
  it("keeps non-secret config updates and strips secret-shaped extra fields", () => {
    const parsed = appConfigUpdateSchema.parse({
      server: {
        port: 39188,
        apiKey: "server-secret"
      },
      storage: {
        assetDirectory: "/tmp/stream-jams/new-assets",
        oauthToken: "storage-secret"
      },
      logging: {
        level: "DEBUG",
        retentionHours: 72,
        apiKey: "logging-secret"
      },
      playback: {
        muted: true,
        apiKey: "playback-secret"
      },
      twitch: {
        accessToken: "twitch-secret"
      }
    });

    expect(parsed).toEqual({
      server: {
        port: 39188
      },
      storage: {
        assetDirectory: "/tmp/stream-jams/new-assets"
      },
      logging: {
        level: "DEBUG",
        retentionHours: 72
      },
      playback: {
        muted: true
      }
    });
  });
});
