import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteEffectModuleSettingsRepository } from "./sqlite-effect-module-settings-repository.js";

describe("SqliteEffectModuleSettingsRepository", () => {
  it("reads and transactionally updates the durable Screen Effects settings", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteEffectModuleSettingsRepository(database.connection, () =>
      new Date("2026-09-13T12:00:00.000Z")
    );

    await expect(repository.get()).resolves.toEqual({ paused: false, cooldownSeconds: 0 });
    await expect(repository.save({ paused: true, cooldownSeconds: 45 })).resolves.toBeUndefined();
    await expect(repository.get()).resolves.toEqual({ paused: true, cooldownSeconds: 45 });
    expect(database.connection.prepare(
      "SELECT updated_at FROM module_playback_settings WHERE module_id = 'screen-effects'"
    ).get()).toEqual({ updated_at: "2026-09-13T12:00:00.000Z" });
  });

  it("rejects invalid settings before persistence", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteEffectModuleSettingsRepository(database.connection);

    await expect(repository.save({ paused: false, cooldownSeconds: 86_401 })).rejects.toThrow();
    await expect(repository.get()).resolves.toEqual({ paused: false, cooldownSeconds: 0 });
  });
});
