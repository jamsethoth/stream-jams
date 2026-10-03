export const persistentEventTimersMigration = {
  id: "030-persistent-event-timers",
  sql: `
    ALTER TABLE timer_definitions ADD COLUMN event_rules_json TEXT NOT NULL DEFAULT '[]';
    CREATE TABLE timer_run_recovery (
      timer_id TEXT PRIMARY KEY NOT NULL REFERENCES timer_definitions(id) ON DELETE CASCADE,
      state_json TEXT NOT NULL
    ) STRICT;
  `
} as const;
