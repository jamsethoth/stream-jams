import type { DatabaseSync } from "node:sqlite";
import type { TwitchAccount, TwitchAccountRepository } from "./twitch-account-repository.js";

interface TwitchAccountRow {
  readonly account_id: unknown;
  readonly login: unknown;
  readonly display_name: unknown;
  readonly scopes_json: unknown;
  readonly connected_at: unknown;
  readonly updated_at: unknown;
}

export class SqliteTwitchAccountRepository implements TwitchAccountRepository {
  readonly #connection: DatabaseSync;

  constructor(connection: DatabaseSync) {
    this.#connection = connection;
  }

  async saveAccount(account: TwitchAccount): Promise<TwitchAccount> {
    const normalized = normalizeAccount(account);
    this.#connection.prepare("DELETE FROM twitch_accounts WHERE account_id <> ?").run(normalized.accountId);
    this.#connection
      .prepare(
        `INSERT INTO twitch_accounts (account_id, login, display_name, scopes_json, connected_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           login = excluded.login,
           display_name = excluded.display_name,
           scopes_json = excluded.scopes_json,
           connected_at = excluded.connected_at,
           updated_at = excluded.updated_at`
      )
      .run(
        normalized.accountId,
        normalized.login,
        normalized.displayName,
        JSON.stringify(normalized.scopes),
        normalized.connectedAt,
        normalized.updatedAt
      );
    return normalized;
  }

  async findConnectedAccount(): Promise<TwitchAccount | null> {
    const row = this.#connection
      .prepare(
        `SELECT account_id, login, display_name, scopes_json, connected_at, updated_at
         FROM twitch_accounts
         ORDER BY connected_at DESC
         LIMIT 1`
      )
      .get();

    return row === undefined ? null : mapAccountRow(row as unknown as TwitchAccountRow);
  }

  async deleteAccount(accountId: string): Promise<void> {
    this.#connection.prepare("DELETE FROM twitch_accounts WHERE account_id = ?").run(accountId);
  }
}

function normalizeAccount(account: TwitchAccount): TwitchAccount {
  return {
    accountId: requireNonEmptyString(account.accountId),
    login: requireNonEmptyString(account.login),
    displayName: requireNonEmptyString(account.displayName),
    scopes: [...account.scopes],
    connectedAt: requireNonEmptyString(account.connectedAt),
    updatedAt: requireNonEmptyString(account.updatedAt)
  };
}

function mapAccountRow(row: TwitchAccountRow): TwitchAccount {
  const scopes = JSON.parse(String(row.scopes_json)) as unknown;
  if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === "string")) {
    throw new Error("Invalid Twitch account scopes");
  }

  return {
    accountId: String(row.account_id),
    login: String(row.login),
    displayName: String(row.display_name),
    scopes,
    connectedAt: String(row.connected_at),
    updatedAt: String(row.updated_at)
  };
}

function requireNonEmptyString(value: string): string {
  if (value.trim() === "") {
    throw new Error("Twitch account fields must not be empty");
  }

  return value;
}
