export const automaticOutputRebindingMigration = {
  id: "026-automatic-output-rebinding",
  sql: `
ALTER TABLE audio_output_routes
ADD COLUMN auto_follow_device_name INTEGER NOT NULL DEFAULT 0
CHECK (auto_follow_device_name IN (0, 1));
`
} as const;
