export const revokeUnsupportedOverlayKeysMigration = {
  id: "012-revoke-unsupported-overlay-keys",
  sql: `
UPDATE overlay_keys
SET revoked_at = COALESCE(revoked_at, created_at)
WHERE purpose NOT IN ('live', 'test');
`
} as const;
