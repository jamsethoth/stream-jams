export const eventBusJournalMigration = {
  id: "034-event-bus-journal",
  sql: `
CREATE TABLE event_bus_journal (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  bus_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('twitch', 'streamerbot')),
  source_registration_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('canonical', 'external')),
  received_at TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL
) STRICT;

CREATE INDEX event_bus_journal_source_event
ON event_bus_journal(source_kind, event_id, received_at_ms);

CREATE INDEX event_bus_journal_received
ON event_bus_journal(received_at_ms);

CREATE TABLE event_bus_consumer_cursors (
  consumer_id TEXT PRIMARY KEY NOT NULL,
  last_sequence INTEGER NOT NULL CHECK (last_sequence >= 0),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE event_bus_delivery_failures (
  sequence INTEGER NOT NULL REFERENCES event_bus_journal(sequence) ON DELETE CASCADE,
  consumer_id TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  error_message TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  failed_at TEXT NOT NULL,
  PRIMARY KEY (sequence, consumer_id)
) STRICT;
`
} as const;
