export const alertSetManagementMigration = {
  id: "007-alert-set-management",
  sql: `
UPDATE alert_collections
SET name = name || ' (' || id || ')'
WHERE EXISTS (
  SELECT 1
  FROM alert_collections AS earlier
  WHERE lower(earlier.name) = lower(alert_collections.name)
    AND earlier.id < alert_collections.id
);

UPDATE alert_collections
SET enabled = 0
WHERE enabled = 1
  AND id <> (
    SELECT id
    FROM alert_collections
    WHERE enabled = 1
    ORDER BY id
    LIMIT 1
  );

UPDATE alert_collections
SET enabled = 1
WHERE id = (SELECT id FROM alert_collections ORDER BY id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM alert_collections WHERE enabled = 1);

CREATE UNIQUE INDEX alert_collections_unique_name_nocase
ON alert_collections (name COLLATE NOCASE);

CREATE UNIQUE INDEX alert_collections_one_active_set
ON alert_collections (enabled)
WHERE enabled = 1;

CREATE TABLE alert_set_metadata (
  set_id TEXT PRIMARY KEY NOT NULL,
  starter INTEGER NOT NULL CHECK (starter IN (0, 1)),
  starter_review_state TEXT NOT NULL CHECK (starter_review_state IN ('pending', 'complete')),
  landscape_enabled INTEGER NOT NULL CHECK (landscape_enabled IN (0, 1)),
  landscape_review_state TEXT NOT NULL CHECK (landscape_review_state IN ('ready', 'needs-review')),
  vertical_enabled INTEGER NOT NULL CHECK (vertical_enabled IN (0, 1)),
  vertical_review_state TEXT NOT NULL CHECK (vertical_review_state IN ('ready', 'needs-review')),
  FOREIGN KEY (set_id) REFERENCES alert_collections(id) ON DELETE CASCADE
);

INSERT INTO alert_set_metadata (
  set_id,
  starter,
  starter_review_state,
  landscape_enabled,
  landscape_review_state,
  vertical_enabled,
  vertical_review_state
)
SELECT id, 0, 'complete', 1, 'ready', 0, 'needs-review'
FROM alert_collections;

CREATE TABLE alert_rule_management_metadata (
  rule_id TEXT PRIMARY KEY NOT NULL,
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('twitch', 'streamerbot', 'speakerbot', 'browser-speech')),
  review_state TEXT NOT NULL CHECK (review_state IN ('ready', 'needs-review')),
  target_profile_ids_json TEXT NOT NULL,
  FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE CASCADE
);

INSERT INTO alert_rule_management_metadata (rule_id, provider_kind, review_state, target_profile_ids_json)
SELECT id, 'twitch', 'ready', '["landscape","vertical"]'
FROM alert_rules;
`
} as const;
