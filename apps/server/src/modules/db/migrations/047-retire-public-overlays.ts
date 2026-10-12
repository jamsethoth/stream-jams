export const retirePublicOverlaysMigration = {
  id: "047-retire-public-overlays",
  sql: `
UPDATE overlay_keys SET revoked_at = COALESCE(revoked_at, created_at)
WHERE purpose = 'test' OR scope = 'unified';
DELETE FROM overlay_surfaces WHERE kind = 'unified-browser';
`
} as const;
