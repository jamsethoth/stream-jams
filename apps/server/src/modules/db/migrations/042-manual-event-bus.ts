/** Rebuild constrained tables while retaining all dependent rows and sequence floors. */
export const manualEventBusMigration = {
  id: "042-manual-event-bus",
  sql: `
CREATE TEMP TABLE manual_bus_sequences AS SELECT name, seq FROM sqlite_sequence WHERE name IN ('event_bus_journal', 'event_bus_intake_log');
CREATE TEMP TABLE event_bus_journal_manual_backup AS SELECT * FROM event_bus_journal;
CREATE TEMP TABLE event_bus_delivery_failures_manual_backup AS SELECT * FROM event_bus_delivery_failures;
CREATE TEMP TABLE event_bus_correlation_merges_manual_backup AS SELECT * FROM event_bus_correlation_merges;
CREATE TEMP TABLE event_bus_consumer_outcomes_manual_backup AS SELECT * FROM event_bus_consumer_outcomes;
CREATE TEMP TABLE event_bus_intake_log_manual_backup AS SELECT * FROM event_bus_intake_log;
DROP TABLE event_bus_delivery_failures;
DROP TABLE event_bus_correlation_merges;
DROP TABLE event_bus_consumer_outcomes;
DROP TABLE event_bus_intake_log;
DROP TABLE event_bus_journal;

CREATE TABLE event_bus_journal (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  bus_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('twitch', 'streamerbot', 'manual')),
  source_registration_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('canonical', 'external', 'manual')),
  received_at TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  correlation_key TEXT,
  CHECK ((kind = 'manual') = (source_kind = 'manual')),
  CHECK (kind <> 'manual' OR (source_registration_id IS NULL AND correlation_key IS NULL))
) STRICT;

CREATE INDEX event_bus_journal_source_event
ON event_bus_journal(source_kind, event_id, received_at_ms);

CREATE INDEX event_bus_journal_received
ON event_bus_journal(received_at_ms);

CREATE INDEX event_bus_journal_correlation ON event_bus_journal(correlation_key, received_at_ms) WHERE correlation_key IS NOT NULL;
INSERT INTO event_bus_journal SELECT * FROM event_bus_journal_manual_backup;
CREATE TABLE event_bus_delivery_failures (
  sequence INTEGER NOT NULL REFERENCES event_bus_journal(sequence) ON DELETE CASCADE,
  consumer_id TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  error_message TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  failed_at TEXT NOT NULL,
  PRIMARY KEY (sequence, consumer_id)
) STRICT;
INSERT INTO event_bus_delivery_failures SELECT * FROM event_bus_delivery_failures_manual_backup;
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
INSERT INTO event_bus_correlation_merges SELECT * FROM event_bus_correlation_merges_manual_backup;
CREATE TABLE event_bus_consumer_outcomes (
  sequence INTEGER NOT NULL REFERENCES event_bus_journal(sequence) ON DELETE CASCADE,
  consumer_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('admitted', 'no-match', 'failed', 'expired')),
  reference_id TEXT,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (sequence, consumer_id)
) STRICT;

INSERT INTO event_bus_consumer_outcomes SELECT * FROM event_bus_consumer_outcomes_manual_backup;
CREATE TABLE event_bus_intake_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('twitch', 'streamerbot', 'manual')),
  kind TEXT CHECK (kind IS NULL OR kind IN ('canonical', 'external', 'manual')),
  event_type TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'duplicate', 'merged', 'rejected')),
  sequence INTEGER,
  reference_id TEXT,
  submission_channel TEXT CHECK (submission_channel IS NULL OR submission_channel IN ('management', 'operator', 'automation')),
  CHECK ((outcome IN ('accepted', 'merged')) = (sequence IS NOT NULL))
) STRICT;

CREATE INDEX event_bus_intake_log_received
ON event_bus_intake_log(received_at_ms);

INSERT INTO event_bus_intake_log (id, received_at, received_at_ms, source_kind, kind, event_type, outcome, sequence, reference_id) SELECT * FROM event_bus_intake_log_manual_backup;
UPDATE sqlite_sequence SET seq = MAX(seq, COALESCE((SELECT seq FROM manual_bus_sequences WHERE name = sqlite_sequence.name), seq)) WHERE name IN ('event_bus_journal', 'event_bus_intake_log');
INSERT INTO sqlite_sequence(name, seq) SELECT name, seq FROM manual_bus_sequences WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence AS current WHERE current.name = manual_bus_sequences.name);
DROP TABLE event_bus_journal_manual_backup;
DROP TABLE event_bus_delivery_failures_manual_backup;
DROP TABLE event_bus_correlation_merges_manual_backup;
DROP TABLE event_bus_consumer_outcomes_manual_backup;
DROP TABLE event_bus_intake_log_manual_backup;
DROP TABLE manual_bus_sequences;
`
} as const;
