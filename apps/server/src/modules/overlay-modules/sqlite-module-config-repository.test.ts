import type { OverlayModuleConfig } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteOverlayModuleConfigRepository } from "./sqlite-module-config-repository.js";

describe("SqliteOverlayModuleConfigRepository", () => {
  it("round-trips persisted Timer profile presentation", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteOverlayModuleConfigRepository(database.connection);
    const config: OverlayModuleConfig = {
      moduleId: "timers",
      enabled: true,
      config: {
        profiles: {
          landscape: { layout: { x: 0, y: 0, width: 600, height: 300, zIndex: 2 }, orientation: "horizontal", maxVisible: 3 },
          vertical: { layout: { x: 0, y: 0, width: 300, height: 600, zIndex: 2 }, orientation: "vertical", maxVisible: 5 }
        }
      },
      updatedAt: "2026-09-28T12:00:00.000Z"
    };

    await repository.saveModuleConfig(config);

    await expect(repository.getModuleConfig("timers")).resolves.toEqual(config);
  });

  it("returns null for missing module config records", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteOverlayModuleConfigRepository(database.connection);

    await expect(repository.getModuleConfig("alerts")).resolves.toBeNull();
  });

  it("saves and updates module config records with JSON config payloads", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteOverlayModuleConfigRepository(database.connection);
    const firstConfig: OverlayModuleConfig = {
      moduleId: "alerts",
      enabled: true,
      config: {
        canvas: {
          width: 1920,
          height: 1080
        }
      },
      updatedAt: "2026-05-30T10:00:00.000Z"
    };
    const secondConfig: OverlayModuleConfig = {
      ...firstConfig,
      enabled: false,
      config: {
        canvas: {
          width: 1280,
          height: 720
        }
      },
      updatedAt: "2026-05-30T10:05:00.000Z"
    };

    await repository.saveModuleConfig(firstConfig);
    await expect(repository.getModuleConfig("alerts")).resolves.toEqual(firstConfig);

    await repository.saveModuleConfig(secondConfig);

    await expect(repository.getModuleConfig("alerts")).resolves.toEqual(secondConfig);
  });
});
