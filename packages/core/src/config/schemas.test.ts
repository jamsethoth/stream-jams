import { describe, expect, it } from "vitest";
import { appConfigSchema, appConfigUpdateSchema } from "./schemas.js";
import { appConfigSchema as exportedAppConfigSchema } from "../index.js";

const validConfig = {
  server: {
    host: "127.0.0.1",
    port: 39187
  },
  storage: {
    dataDirectory: "/tmp/stream-jams/data",
    assetDirectory: "/tmp/stream-jams/assets"
  }
};

describe("appConfigSchema", () => {
  it("accepts local-only server and storage settings", () => {
    expect(appConfigSchema.parse(validConfig)).toEqual(validConfig);
    expect(exportedAppConfigSchema.parse(validConfig)).toEqual(validConfig);
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
      }
    });
  });
});
