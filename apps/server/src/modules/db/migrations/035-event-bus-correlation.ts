export const eventBusCorrelationMigration = {
  id: "035-event-bus-correlation",
  sql: `
ALTER TABLE event_bus_journal ADD COLUMN correlation_key TEXT;

CREATE INDEX event_bus_journal_correlation
ON event_bus_journal(correlation_key, received_at_ms)
WHERE correlation_key IS NOT NULL;

CREATE TABLE event_bus_correlation_merges (
  sequence INTEGER NOT NULL REFERENCES event_bus_journal(sequence) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('twitch', 'streamerbot')),
  merged_event_id TEXT NOT NULL,
  merged_source_registration_id TEXT,
  merged_at TEXT NOT NULL,
  merged_at_ms INTEGER NOT NULL,
  PRIMARY KEY (sequence, source_kind)
) STRICT;

CREATE INDEX event_bus_correlation_merges_source_event
ON event_bus_correlation_merges(source_kind, merged_event_id, merged_at_ms);
`
} as const;
