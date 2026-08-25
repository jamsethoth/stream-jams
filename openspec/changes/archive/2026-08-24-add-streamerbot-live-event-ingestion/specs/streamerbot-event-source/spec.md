## ADDED Requirements

### Requirement: Canonical Twitch Alert Compatibility Across Ingestion Providers

Twitch-origin events normalized through Streamer.bot SHALL remain compatible with the same canonical alert rules as direct Twitch EventSub events unless a rule contains an explicit ingestion-provider condition.

#### Scenario: Provider switch preserves canonical alert eligibility

- **WHEN** an active event source switches between direct Twitch and Streamer.bot
- **AND** both sources can emit a configured canonical Twitch event type
- **THEN** the alert remains matched by event type and explicit conditions
- **AND** management validation does not report an implicit provider-kind mismatch

#### Scenario: Rule explicitly restricts ingestion provider

- **WHEN** an alert rule contains a condition for `ingestProvider`
- **THEN** direct Twitch and Streamer.bot events are distinguished according to that condition
- **AND** no management metadata silently overrides the explicit condition

#### Scenario: Provider metadata is used for management context

- **WHEN** alert management stores a provider kind for event catalog, sample payload, or editor context
- **THEN** that metadata does not become an implicit runtime eligibility condition
- **AND** switching the active event-source registration does not require duplicate canonical alert rules
