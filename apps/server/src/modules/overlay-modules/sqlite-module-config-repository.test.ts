import type { OverlayModuleConfig } from "@stream-jams/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteOverlayModuleConfigRepository } from "./sqlite-module-config-repository.js";

describe("SqliteOverlayModuleConfigRepository", () => {
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
