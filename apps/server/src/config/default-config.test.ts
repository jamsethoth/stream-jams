import { describe, expect, it } from "vitest";
import { createDefaultAppConfig, resolveConfigFilePath } from "./default-config.js";

describe("default app config", () => {
  it("uses the MVP localhost host and default Stream Jams port", () => {
    expect(createDefaultAppConfig("/home/streamer")).toEqual({
      server: {
        host: "127.0.0.1",
        port: 39187
      },
      storage: {
        dataDirectory: "/home/streamer/.stream-jams/data",
        assetDirectory: "/home/streamer/.stream-jams/assets"
      },
      logging: {
        level: "INFO",
        rollover: "hourly",
        retentionHours: 48
      }
    });
  });

  it("supports an explicit config file override for tests and packaged shells", () => {
    expect(resolveConfigFilePath("/home/streamer", { STREAM_JAMS_CONFIG_PATH: "/tmp/stream-jams/config.json" })).toBe(
      "/tmp/stream-jams/config.json"
    );
    expect(resolveConfigFilePath("/home/streamer", {})).toBe("/home/streamer/.stream-jams/config.json");
  });
});
