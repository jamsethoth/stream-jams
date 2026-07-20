export const overlayKeyLookupIndexesMigration = {
  id: "016-overlay-key-lookup-indexes",
  sql: `
CREATE TABLE overlay_key_hash_uniqueness_preflight (
  valid INTEGER NOT NULL CHECK (valid = 1)
);

INSERT INTO overlay_key_hash_uniqueness_preflight (valid)
SELECT 0
WHERE EXISTS (
  SELECT key_hash
  FROM overlay_keys
  GROUP BY key_hash
  HAVING COUNT(*) > 1
);

DROP TABLE overlay_key_hash_uniqueness_preflight;
CREATE UNIQUE INDEX overlay_keys_key_hash_unique ON overlay_keys(key_hash);

DROP INDEX overlay_keys_overlay_id_idx;
DROP INDEX overlay_keys_output_idx;
CREATE INDEX overlay_keys_output_history_idx
  ON overlay_keys(overlay_id, scope, module_id, target_profile_id, purpose, created_at, id);
`
} as const;
