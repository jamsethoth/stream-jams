export const assetDurationMetadataMigration = {
  id: "024-asset-duration-metadata",
  sql: `
ALTER TABLE asset_metadata
ADD COLUMN duration_ms INTEGER
CHECK (duration_ms IS NULL OR duration_ms > 0);
`
} as const;
