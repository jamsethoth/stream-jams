import { posix, win32 } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultAppConfig, resolveConfigFilePath } from "./default-config.js";

describe("default app config", () => {
  it("uses the MVP localhost host and default Stream Jams port with POSIX paths", () => {
    expect(createDefaultAppConfig("/home/streamer", { path: posix })).toEqual({
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

  it("uses Windows separators when the app runs with a Windows path adapter", () => {
    expect(createDefaultAppConfig("C:\\Users\\streamer", { path: win32 }).storage).toEqual({
      dataDirectory: "C:\\Users\\streamer\\.stream-jams\\data",
      assetDirectory: "C:\\Users\\streamer\\.stream-jams\\assets"
    });
  });

  it("supports an explicit config file override for tests and packaged shells", () => {
    expect(
      resolveConfigFilePath("/home/streamer", {
        environment: { STREAM_JAMS_CONFIG_PATH: "/tmp/stream-jams/config.json" },
        path: posix
      })
    ).toBe("/tmp/stream-jams/config.json");
    expect(resolveConfigFilePath("/home/streamer", { environment: {}, path: posix })).toBe(
      "/home/streamer/.stream-jams/config.json"
    );
    expect(resolveConfigFilePath("C:\\Users\\streamer", { environment: {}, path: win32 })).toBe(
      "C:\\Users\\streamer\\.stream-jams\\config.json"
    );
  });
});
