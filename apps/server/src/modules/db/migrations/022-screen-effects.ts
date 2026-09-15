export const screenEffectsMigration = {
  id: "022-screen-effects",
  sql: `
CREATE TABLE screen_effects (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) BETWEEN 1 AND 120 AND id = trim(id) AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120 AND name = trim(name)),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  description TEXT CHECK (description IS NULL OR (length(trim(description)) BETWEEN 1 AND 2000 AND description = trim(description))),
  category TEXT CHECK (category IS NULL OR (length(trim(category)) BETWEEN 1 AND 80 AND category = trim(category))),
  priority INTEGER NOT NULL,
  cooldown_seconds INTEGER NOT NULL CHECK (cooldown_seconds BETWEEN 0 AND 86400),
  updated_at TEXT NOT NULL
);

CREATE TABLE screen_effect_variants (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) BETWEEN 1 AND 120 AND id = trim(id) AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
  effect_id TEXT NOT NULL REFERENCES screen_effects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('default', 'weighted')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  weight INTEGER NOT NULL CHECK (weight BETWEEN 1 AND 10000),
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  visual_asset_id TEXT REFERENCES asset_metadata(id) ON DELETE RESTRICT,
  sound_asset_id TEXT REFERENCES asset_metadata(id) ON DELETE RESTRICT,
  UNIQUE (effect_id, position),
  CHECK (json_extract(document_json, '$.id') IS id),
  CHECK (json_extract(document_json, '$.kind') IS kind)
);

CREATE TABLE screen_effect_bindings (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) BETWEEN 1 AND 120 AND id = trim(id) AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
  effect_id TEXT NOT NULL REFERENCES screen_effects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('twitch-reward', 'streamerbot-event')),
  canonical_identity TEXT NOT NULL,
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  UNIQUE (effect_id, position),
  UNIQUE (effect_id, canonical_identity),
  CHECK (json_extract(document_json, '$.id') IS id),
  CHECK (json_extract(document_json, '$.kind') IS kind)
);

CREATE TABLE screen_effect_audio_routes (
  variant_id TEXT NOT NULL REFERENCES screen_effect_variants(id) ON DELETE CASCADE,
  route_id TEXT NOT NULL REFERENCES audio_output_routes(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (variant_id, route_id),
  UNIQUE (variant_id, position)
);

CREATE TABLE module_playback_settings (
  module_id TEXT PRIMARY KEY NOT NULL,
  paused INTEGER NOT NULL CHECK (paused IN (0, 1)),
  cooldown_seconds INTEGER NOT NULL CHECK (cooldown_seconds BETWEEN 0 AND 86400),
  updated_at TEXT NOT NULL
);

INSERT INTO module_playback_settings (module_id, paused, cooldown_seconds, updated_at)
VALUES
  ('alerts', 0, 0, CURRENT_TIMESTAMP),
  ('screen-effects', 0, 0, CURRENT_TIMESTAMP);

CREATE INDEX screen_effect_variants_effect_order
  ON screen_effect_variants(effect_id, position);
CREATE INDEX screen_effect_bindings_effect_order
  ON screen_effect_bindings(effect_id, position);
CREATE INDEX screen_effect_audio_routes_route
  ON screen_effect_audio_routes(route_id, variant_id);
`
} as const;
