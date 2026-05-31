import { describe, expect, it } from "vitest";
import { createInMemoryStreamJamsDatabase } from "../db/database.js";
import { SqliteTwitchAccountRepository } from "./sqlite-twitch-account-repository.js";

describe("SqliteTwitchAccountRepository", () => {
  it("persists non-secret Twitch account metadata without token columns", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteTwitchAccountRepository(database.connection);

    await repository.saveAccount({
      accountId: "141981764",
      login: "streamer",
      displayName: "Streamer",
      scopes: ["bits:read", "channel:read:redemptions"],
      connectedAt: "2026-05-30T12:00:00.000Z",
      updatedAt: "2026-05-30T12:00:00.000Z"
    });

    await expect(repository.findConnectedAccount()).resolves.toEqual({
      accountId: "141981764",
      login: "streamer",
      displayName: "Streamer",
      scopes: ["bits:read", "channel:read:redemptions"],
      connectedAt: "2026-05-30T12:00:00.000Z",
      updatedAt: "2026-05-30T12:00:00.000Z"
    });
    expect(listColumnNames(database.connection)).toEqual([
      "account_id",
      "connected_at",
      "display_name",
      "login",
      "scopes_json",
      "updated_at"
    ]);
  });

  it("deletes connected account metadata", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteTwitchAccountRepository(database.connection);
    await repository.saveAccount({
      accountId: "141981764",
      login: "streamer",
      displayName: "Streamer",
      scopes: ["bits:read"],
      connectedAt: "2026-05-30T12:00:00.000Z",
      updatedAt: "2026-05-30T12:00:00.000Z"
    });

    await repository.deleteAccount("141981764");

    await expect(repository.findConnectedAccount()).resolves.toBeNull();
  });
  it("keeps only one connected account when a different broadcaster is saved", async () => {
    using database = createInMemoryStreamJamsDatabase();
    const repository = new SqliteTwitchAccountRepository(database.connection);
    await repository.saveAccount({
      accountId: "old-id",
      login: "oldstreamer",
      displayName: "Old Streamer",
      scopes: ["bits:read"],
      connectedAt: "2026-05-30T12:00:00.000Z",
      updatedAt: "2026-05-30T12:00:00.000Z"
    });

    await repository.saveAccount({
      accountId: "new-id",
      login: "newstreamer",
      displayName: "New Streamer",
      scopes: ["channel:read:redemptions"],
      connectedAt: "2026-05-30T12:05:00.000Z",
      updatedAt: "2026-05-30T12:05:00.000Z"
    });

    await expect(repository.findConnectedAccount()).resolves.toMatchObject({
      accountId: "new-id",
      login: "newstreamer"
    });

    await repository.deleteAccount("new-id");

    await expect(repository.findConnectedAccount()).resolves.toBeNull();
  });
});

function listColumnNames(connection: {
  prepare(sql: string): { all(): Record<string, unknown>[] };
}): readonly string[] {
  return connection
    .prepare("PRAGMA table_info(twitch_accounts)")
    .all()
    .map((row) => String(row.name))
    .sort();
}
