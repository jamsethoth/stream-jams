export const overlayKeySecretRefMigration = {
  id: "004-overlay-key-secret-ref",
  sql: `
ALTER TABLE overlay_keys ADD COLUMN route_key_secret_ref_json TEXT;
`
} as const;
