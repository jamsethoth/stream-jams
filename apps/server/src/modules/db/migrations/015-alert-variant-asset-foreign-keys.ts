export const alertVariantAssetForeignKeysMigration = {
  id: "015-alert-variant-asset-foreign-keys",
  sql: `
CREATE TABLE alert_variant_asset_reference_preflight (
  valid INTEGER NOT NULL CHECK (valid = 1)
);

INSERT INTO alert_variant_asset_reference_preflight (valid)
SELECT 0
WHERE EXISTS (
  SELECT 1
  FROM alert_variants AS variants
  LEFT JOIN asset_metadata AS visual ON visual.id = variants.visual_asset_id
  LEFT JOIN asset_metadata AS audio ON audio.id = variants.audio_asset_id
  WHERE (variants.visual_asset_id IS NOT NULL AND visual.id IS NULL)
     OR (variants.audio_asset_id IS NOT NULL AND audio.id IS NULL)
);

DROP TABLE alert_variant_asset_reference_preflight;
DROP TRIGGER alert_editor_documents_validate_owner_insert;
DROP TRIGGER alert_editor_documents_validate_owner_update;
DROP TRIGGER alert_editor_documents_delete_variant;

CREATE TABLE alert_variants_next (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  weight INTEGER NOT NULL CHECK (weight > 0),
  visual_asset_id TEXT REFERENCES asset_metadata(id) ON DELETE RESTRICT,
  audio_asset_id TEXT REFERENCES asset_metadata(id) ON DELETE RESTRICT,
  text_template TEXT NOT NULL,
  tts_config_json TEXT,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  layout_json TEXT NOT NULL,
  conditions_json TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 0,
  variant_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO alert_variants_next (
  id, rule_id, name, enabled, weight, visual_asset_id, audio_asset_id,
  text_template, tts_config_json, duration_ms, layout_json, conditions_json,
  priority, variant_order
)
SELECT
  id, rule_id, name, enabled, weight, visual_asset_id, audio_asset_id,
  text_template, tts_config_json, duration_ms, layout_json, conditions_json,
  priority, variant_order
FROM alert_variants;

DROP TABLE alert_variants;
ALTER TABLE alert_variants_next RENAME TO alert_variants;

CREATE INDEX alert_variants_rule_order_idx
ON alert_variants(rule_id, variant_order, id);
CREATE INDEX alert_variants_visual_asset_idx
ON alert_variants(visual_asset_id);
CREATE INDEX alert_variants_audio_asset_idx
ON alert_variants(audio_asset_id);

CREATE TRIGGER alert_editor_documents_validate_owner_insert
BEFORE INSERT ON alert_editor_documents
WHEN NOT EXISTS (SELECT 1 FROM alert_rules WHERE id = NEW.alert_id)
 AND NOT EXISTS (SELECT 1 FROM alert_variants WHERE id = NEW.alert_id)
BEGIN
  SELECT RAISE(ABORT, 'alert editor document owner must be an alert rule or alert variant');
END;

CREATE TRIGGER alert_editor_documents_validate_owner_update
BEFORE UPDATE OF alert_id ON alert_editor_documents
WHEN NOT EXISTS (SELECT 1 FROM alert_rules WHERE id = NEW.alert_id)
 AND NOT EXISTS (SELECT 1 FROM alert_variants WHERE id = NEW.alert_id)
BEGIN
  SELECT RAISE(ABORT, 'alert editor document owner must be an alert rule or alert variant');
END;

CREATE TRIGGER alert_editor_documents_delete_variant
AFTER DELETE ON alert_variants
BEGIN
  DELETE FROM alert_editor_documents WHERE alert_id = OLD.id;
END;
`
} as const;
