/**
 * Alert rules can select an exact external event identity. The column is null for canonical rules and holds
 * `{providerKind, sourceKey, eventType}` exactly when `event_type` is `external_event`.
 */
export const externalAlertIdentityMigration = {
  id: "038-external-alert-identity",
  sql: `
ALTER TABLE alert_rules ADD COLUMN external_identity_json TEXT
  CHECK (
    CASE WHEN event_type = 'external_event'
      THEN external_identity_json IS NOT NULL AND json_valid(external_identity_json)
        AND json_extract(external_identity_json, '$.providerKind') IS 'streamerbot'
      ELSE external_identity_json IS NULL
    END
  );
`
};
