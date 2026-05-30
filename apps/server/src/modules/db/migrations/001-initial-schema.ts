export const initialSchemaMigration = {
  id: "001-initial-schema",
  sql: `
CREATE TABLE overlay_module_config (
  module_id TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE alert_collections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1))
);

CREATE TABLE alert_rules (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  cooldown_seconds INTEGER NOT NULL CHECK (cooldown_seconds >= 0),
  priority INTEGER NOT NULL
);

CREATE TABLE alert_rule_collections (
  rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL REFERENCES alert_collections(id) ON DELETE CASCADE,
  PRIMARY KEY (rule_id, collection_id)
);

CREATE TABLE alert_rule_conditions (
  rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  field TEXT NOT NULL,
  operator TEXT NOT NULL,
  value_json TEXT NOT NULL,
  PRIMARY KEY (rule_id, position)
);

CREATE TABLE alert_variants (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  weight INTEGER NOT NULL CHECK (weight > 0),
  visual_asset_id TEXT,
  audio_asset_id TEXT,
  text_template TEXT NOT NULL,
  tts_config_json TEXT,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  layout_json TEXT NOT NULL
);

CREATE INDEX alert_variants_rule_id_idx ON alert_variants(rule_id);

CREATE TABLE asset_metadata (
  id TEXT PRIMARY KEY NOT NULL,
  original_file_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  checksum TEXT NOT NULL,
  storage_path TEXT NOT NULL
);

CREATE TABLE overlay_keys (
  id TEXT PRIMARY KEY NOT NULL,
  overlay_id TEXT NOT NULL,
  module_id TEXT,
  purpose TEXT NOT NULL,
  scope TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX overlay_keys_overlay_id_idx ON overlay_keys(overlay_id);

CREATE TABLE event_logs (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  processing_id TEXT,
  error_message TEXT
);

CREATE INDEX event_logs_received_at_idx ON event_logs(received_at);

CREATE TABLE alert_match_logs (
  id TEXT PRIMARY KEY NOT NULL,
  source_event_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  matched_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  processing_id TEXT
);

CREATE INDEX alert_match_logs_matched_at_idx ON alert_match_logs(matched_at);

CREATE TABLE playback_logs (
  id TEXT PRIMARY KEY NOT NULL,
  queue_item_id TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  alert_ids_json TEXT NOT NULL,
  status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  processing_id TEXT,
  message TEXT
);

CREATE INDEX playback_logs_occurred_at_idx ON playback_logs(occurred_at);
`
} as const;
