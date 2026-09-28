export const removeAlertSetProfileStateMigration = {
  id: "027-remove-alert-set-profile-state",
  sql: `
CREATE TABLE alert_set_metadata_next (
  set_id TEXT PRIMARY KEY NOT NULL,
  starter INTEGER NOT NULL CHECK (starter IN (0, 1)),
  starter_review_state TEXT NOT NULL CHECK (starter_review_state IN ('pending', 'complete')),
  FOREIGN KEY (set_id) REFERENCES alert_collections(id) ON DELETE CASCADE
);

INSERT INTO alert_set_metadata_next (set_id, starter, starter_review_state)
SELECT set_id, starter, starter_review_state
FROM alert_set_metadata;

DROP TABLE alert_set_metadata;
ALTER TABLE alert_set_metadata_next RENAME TO alert_set_metadata;
`
} as const;
