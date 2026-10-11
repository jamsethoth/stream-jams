/**
 * Event sources allow one active registration per provider kind, so direct Twitch and Streamer.bot can run
 * together. TTS and music keep one active provider per capability. Existing rows already satisfy both
 * indexes because the previous index allowed at most one active event source.
 */
export const eventSourceActivePerKindMigration = {
  id: "036-event-source-active-per-kind",
  sql: `
DROP INDEX provider_registrations_one_active_capability;

CREATE UNIQUE INDEX provider_registrations_one_active_capability
ON provider_registrations (capability)
WHERE active = 1 AND capability <> 'event-source';

CREATE UNIQUE INDEX provider_registrations_one_active_event_source_kind
ON provider_registrations (kind)
WHERE active = 1 AND capability = 'event-source';
`
} as const;
