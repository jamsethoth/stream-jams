/**
 * Records what intake and each bus consumer did with every event for Diagnostics, and stores the replay age:
 * how old a pending event may be and still be delivered, for example after a restart.
 */
export const eventBusOutcomesMigration = {
  id: "039-event-bus-outcomes",
  sql: `
CREATE TABLE event_bus_consumer_outcomes (
  sequence INTEGER NOT NULL REFERENCES event_bus_journal(sequence) ON DELETE CASCADE,
  consumer_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('admitted', 'no-match', 'failed', 'expired')),
  reference_id TEXT,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (sequence, consumer_id)
) STRICT;

CREATE TABLE event_bus_intake_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('twitch', 'streamerbot')),
  kind TEXT CHECK (kind IS NULL OR kind IN ('canonical', 'external')),
  event_type TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'duplicate', 'merged', 'rejected')),
  sequence INTEGER,
  reference_id TEXT,
  CHECK ((outcome IN ('accepted', 'merged')) = (sequence IS NOT NULL))
) STRICT;

CREATE INDEX event_bus_intake_log_received
ON event_bus_intake_log(received_at_ms);

CREATE TABLE event_bus_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  replay_age_seconds INTEGER NOT NULL CHECK (replay_age_seconds BETWEEN 0 AND 1800),
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO event_bus_settings (id, replay_age_seconds, updated_at) VALUES (1, 120, CURRENT_TIMESTAMP);
`
} as const;
