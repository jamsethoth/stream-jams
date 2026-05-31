export const twitchAccountsMigration = {
  id: "003-twitch-accounts",
  sql: `
CREATE TABLE twitch_accounts (
  account_id TEXT PRIMARY KEY NOT NULL,
  login TEXT NOT NULL,
  display_name TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`
} as const;
