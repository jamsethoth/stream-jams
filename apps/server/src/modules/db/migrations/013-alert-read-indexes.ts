export const alertReadIndexesMigration = {
  id: "013-alert-read-indexes",
  sql: `
CREATE INDEX alert_rule_collections_collection_rule_idx
ON alert_rule_collections(collection_id, rule_id);

DROP INDEX alert_variants_rule_id_idx;
CREATE INDEX alert_variants_rule_order_idx
ON alert_variants(rule_id, variant_order, id);
`
} as const;
