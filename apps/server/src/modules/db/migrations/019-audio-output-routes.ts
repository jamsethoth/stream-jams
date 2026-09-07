export const audioOutputRoutesMigration = {
  id: "019-audio-output-routes",
  sql: `
CREATE TABLE audio_output_routes (
  id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0 AND id = trim(id)),
  name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) > 0 AND name = trim(name)),
  device_id TEXT,
  device_label TEXT,
  CHECK (
    (device_id IS NULL AND device_label IS NULL) OR
    (device_id IS NOT NULL AND device_label IS NOT NULL
      AND length(trim(device_id)) > 0 AND device_id = trim(device_id)
      AND device_id NOT IN ('default', 'communications')
      AND length(trim(device_label)) > 0 AND device_label = trim(device_label))
  )
);
`
} as const;
