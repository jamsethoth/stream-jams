export const alertVariantOrderMigration = {
  id: "011-alert-variant-order",
  sql: `
ALTER TABLE alert_variants ADD COLUMN variant_order INTEGER NOT NULL DEFAULT 0;

UPDATE alert_variants AS current
SET variant_order = (
  SELECT COUNT(*) - 1
  FROM alert_variants AS preceding
  WHERE preceding.rule_id = current.rule_id
    AND preceding.rowid <= current.rowid
);
`
} as const;
