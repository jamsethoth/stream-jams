export const assetLibraryMetadataMigration = {
  id: "008-asset-library-metadata",
  sql: `
CREATE TABLE asset_library_metadata (
  asset_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES asset_metadata(id) ON DELETE CASCADE
);

INSERT INTO asset_library_metadata (asset_id, display_name, tags_json, created_at, updated_at)
SELECT id, original_file_name, '[]',
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM asset_metadata;
`
} as const;
