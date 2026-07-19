export const overlayKeyTargetProfileMigration = {
  id: "006-overlay-key-target-profile",
  sql: `
ALTER TABLE overlay_keys ADD COLUMN target_profile_id TEXT
  CHECK (
    target_profile_id IS NULL OR
    (scope = 'module' AND target_profile_id IN ('landscape', 'vertical'))
  );

CREATE INDEX overlay_keys_output_idx
  ON overlay_keys(overlay_id, scope, module_id, target_profile_id, purpose);
`
} as const;
