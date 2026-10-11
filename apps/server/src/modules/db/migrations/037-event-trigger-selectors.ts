/**
 * Screen Effect bindings and timer event rules become shared event trigger selectors.
 *
 * - A `twitch-reward` binding keeps its broadcaster/reward IDs and its stored identity.
 * - A `streamerbot-event` binding becomes an exact external identity. Its registration ID is dropped because
 *   one Streamer.bot registration is in use at a time; bindings that become identical keep the first.
 * - A timer rule becomes a canonical selector restricted to its ingestion source, with its reward and tier
 *   filters as conditions.
 *
 * Rows already in selector form are kept unchanged. `legacy-trigger-selectors.ts` applies the same conversion
 * to older backups; tests keep the two in step.
 */
export const eventTriggerSelectorsMigration = {
  id: "037-event-trigger-selectors",
  sql: `
CREATE TABLE screen_effect_bindings_selectors (
  id TEXT PRIMARY KEY NOT NULL
    CHECK (length(id) BETWEEN 1 AND 120 AND id = trim(id) AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
  effect_id TEXT NOT NULL REFERENCES screen_effects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('canonical', 'twitch-reward', 'external')),
  canonical_identity TEXT NOT NULL,
  document_json TEXT NOT NULL CHECK (json_valid(document_json)),
  UNIQUE (effect_id, position),
  UNIQUE (effect_id, canonical_identity),
  CHECK (json_extract(document_json, '$.id') IS id),
  CHECK (json_extract(document_json, '$.selector.match.kind') IS kind)
);

WITH migrated AS (
  SELECT id, effect_id, position, kind, canonical_identity AS identity, document_json AS document
  FROM screen_effect_bindings
  WHERE json_type(document_json, '$.selector') IS NOT NULL
  UNION ALL
  SELECT
    id,
    effect_id,
    position,
    CASE kind WHEN 'twitch-reward' THEN 'twitch-reward' ELSE 'external' END AS kind,
    CASE kind
      WHEN 'twitch-reward' THEN canonical_identity
      ELSE 'external:' || json_array('streamerbot', document_json ->> '$.sourceKey', document_json ->> '$.eventType')
    END AS identity,
    json_object(
      'id', id,
      'selector', json_object(
        'match', CASE kind
          WHEN 'twitch-reward' THEN json_object(
            'kind', 'twitch-reward',
            'broadcasterId', document_json ->> '$.broadcasterId',
            'rewardId', document_json ->> '$.rewardId'
          )
          ELSE json_object(
            'kind', 'external',
            'providerKind', 'streamerbot',
            'sourceKey', document_json ->> '$.sourceKey',
            'eventType', document_json ->> '$.eventType'
          )
        END,
        'sources', 'any',
        'conditions', json_array()
      )
    ) AS document
  FROM screen_effect_bindings
  WHERE json_type(document_json, '$.selector') IS NULL
)
INSERT INTO screen_effect_bindings_selectors (id, effect_id, position, kind, canonical_identity, document_json)
SELECT id, effect_id, position, kind, identity, document
FROM migrated
WHERE NOT EXISTS (
  SELECT 1 FROM migrated AS earlier
  WHERE earlier.effect_id = migrated.effect_id
    AND earlier.identity = migrated.identity
    AND earlier.position < migrated.position
);

DROP TABLE screen_effect_bindings;
ALTER TABLE screen_effect_bindings_selectors RENAME TO screen_effect_bindings;
CREATE INDEX screen_effect_bindings_effect_order
  ON screen_effect_bindings(effect_id, position);

UPDATE timer_definitions
SET event_rules_json = (
  SELECT json_group_array(CASE WHEN json_type(rule.value, '$.selector') IS NOT NULL THEN json(rule.value) ELSE json_object(
    'enabled', rule.value -> '$.enabled',
    'selector', json_object(
      'match', json_object('kind', 'canonical', 'type', rule.value ->> '$.eventType'),
      'sources', json(CASE rule.value ->> '$.ingestProvider'
        WHEN 'any' THEN '"any"'
        ELSE json_array(rule.value ->> '$.ingestProvider')
      END),
      'conditions', (
        SELECT json_group_array(json(condition.document) ORDER BY condition.position)
        FROM (
          SELECT 0 AS position, json_object('field', 'channelPointReward', 'operator', 'equals', 'value', rule.value ->> '$.rewardId') AS document
          WHERE rule.value ->> '$.rewardId' IS NOT NULL
          UNION ALL
          SELECT 1, json_object('field', 'tier', 'operator', 'equals', 'value', rule.value ->> '$.tier')
          WHERE rule.value ->> '$.tier' IS NOT NULL
        ) AS condition
      )
    ),
    'action', rule.value ->> '$.action',
    'amountMs', rule.value -> '$.amountMs',
    'quantityUnit', rule.value -> '$.quantityUnit',
    'inactiveBehavior', rule.value ->> '$.inactiveBehavior'
  ) END ORDER BY rule.key)
  FROM json_each(timer_definitions.event_rules_json) AS rule
)
WHERE event_rules_json <> '[]';
`
} as const;
