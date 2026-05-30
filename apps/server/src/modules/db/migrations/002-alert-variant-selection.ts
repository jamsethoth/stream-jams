export const alertVariantSelectionMigration = {
  id: "002-alert-variant-selection",
  sql: `
ALTER TABLE alert_variants ADD COLUMN conditions_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE alert_variants ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
`
} as const;
