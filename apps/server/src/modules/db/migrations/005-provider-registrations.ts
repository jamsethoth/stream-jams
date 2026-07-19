export const providerRegistrationsMigration = {
  id: "005-provider-registrations",
  sql: `
CREATE TABLE provider_registrations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('twitch', 'streamerbot', 'speakerbot', 'browser-speech')),
  capability TEXT NOT NULL CHECK (capability IN ('event-source', 'tts')),
  non_secret_config_json TEXT NOT NULL,
  secret_ref_json TEXT,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  connection_state TEXT NOT NULL CHECK (connection_state IN ('unconfigured', 'validating', 'connected', 'disconnected', 'error')),
  intake_state TEXT CHECK (intake_state IN ('active', 'inactive', 'error')),
  validated_at TEXT,
  error_json TEXT,
  available_voices_json TEXT NOT NULL,
  tts_safety_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (kind IN ('twitch', 'streamerbot') AND capability = 'event-source') OR
    (kind IN ('speakerbot', 'browser-speech') AND capability = 'tts')
  ),
  CHECK (
    (capability = 'event-source') OR
    (intake_state IS NULL)
  )
);

CREATE UNIQUE INDEX provider_registrations_one_active_capability
ON provider_registrations (capability)
WHERE active = 1;

CREATE INDEX provider_registrations_capability_name
ON provider_registrations (capability, name, id);
`
} as const;
