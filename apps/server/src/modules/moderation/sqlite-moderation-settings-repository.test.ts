import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openStreamJamsDatabase, runInTransaction } from "../db/database.js";
import { SqliteModerationSettingsRepository } from "./sqlite-moderation-settings-repository.js";

describe("SqliteModerationSettingsRepository", () => {
  it("normalizes replacement values and survives a reopened database", () => {
    const directory = mkdtempSync(join(tmpdir(), "stream-jams-moderation-"));
    const path = join(directory, "settings.sqlite");
    try {
      using firstDatabase = openStreamJamsDatabase(path);
      const first = new SqliteModerationSettingsRepository(firstDatabase.connection);
      first.replace({
        renderedText: { maxLength: 240, blockedTerms: ["  Alpha ", "alpha", "Beta"], stripUrls: true },
        ttsText: { maxLength: 180, blockedTerms: ["  Tts  "], stripUrls: false }
      });

      expect(first.read()).toEqual({
        renderedText: { maxLength: 240, blockedTerms: ["Alpha", "Beta"], stripUrls: true },
        ttsText: { maxLength: 180, blockedTerms: ["Tts"], stripUrls: false }
      });
      firstDatabase.close();

      using secondDatabase = openStreamJamsDatabase(path);
      expect(new SqliteModerationSettingsRepository(secondDatabase.connection).read()).toEqual({
        renderedText: { maxLength: 240, blockedTerms: ["Alpha", "Beta"], stripUrls: true },
        ttsText: { maxLength: 180, blockedTerms: ["Tts"], stripUrls: false }
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects invalid JSON and invalid persisted values without returning a policy", () => {
    using database = openStreamJamsDatabase(":memory:");
    const repository = new SqliteModerationSettingsRepository(database.connection);
    database.connection.prepare("UPDATE alert_moderation_settings SET rendered_blocked_terms_json = ?").run("not-json");

    expect(() => repository.read()).toThrow("Invalid moderation settings");

    database.connection.prepare("UPDATE alert_moderation_settings SET rendered_blocked_terms_json = ?").run("[1]");
    expect(() => repository.read()).toThrow("Invalid moderation settings");

    expect(() =>
      repository.replace({
        renderedText: { maxLength: 0, blockedTerms: [], stripUrls: false },
        ttsText: { maxLength: 180, blockedTerms: [], stripUrls: true }
      })
    ).toThrow("Invalid moderation settings");
  });

  it("does not replace the singleton when an enclosing transaction rolls back", () => {
    using database = openStreamJamsDatabase(":memory:");
    const repository = new SqliteModerationSettingsRepository(database.connection);

    expect(() =>
      runInTransaction(database.connection, () => {
        repository.replace({
          renderedText: { maxLength: 42, blockedTerms: ["Alpha"], stripUrls: true },
          ttsText: { maxLength: 24, blockedTerms: ["Tts"], stripUrls: false }
        });
        throw new Error("rollback");
      })
    ).toThrow("rollback");

    expect(repository.read()).toEqual({
      renderedText: { maxLength: 240, blockedTerms: [], stripUrls: false },
      ttsText: { maxLength: 180, blockedTerms: [], stripUrls: true }
    });
  });
});
