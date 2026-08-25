# streamerbot-event-source

## Purpose

Define the Streamer.bot event-source foundation: event source identity, external event contracts, secret namespace support, diagnostics compatibility, and provider-path alert conditions before Streamer.bot runtime, persistence, management APIs, or UI are introduced.
## Requirements
### Requirement: Normalized Event Source Identity

Normalized stream events SHALL distinguish the viewer-facing source platform from the ingestion provider while preserving the existing `providerId` compatibility field.

#### Scenario: Direct Twitch EventSub event is normalized

- GIVEN Stream Jams receives a supported direct Twitch EventSub notification
- WHEN the notification is normalized into a `NormalizedStreamEvent`
- THEN the event has `providerId` set to `"twitch"`
- AND the event has `sourcePlatform` set to `"twitch"`
- AND the event has `ingestProvider` set to `"twitch"`

#### Scenario: Existing Twitch compatibility field remains available

- GIVEN an existing alert rule, template, playback dedupe key, or diagnostics view reads `providerId`
- WHEN a direct Twitch event is processed
- THEN `providerId` remains available with the value `"twitch"`
- AND existing behavior does not require a Streamer.bot-specific rule or template change

### Requirement: Generic External Event Contract

The core event model SHALL define a generic external stream event contract for future aggregator intake without requiring the event to be alert-compatible.

#### Scenario: External Streamer.bot event identity is represented

- GIVEN a future Streamer.bot envelope has an ingest provider, subscription source key, upstream source, upstream type, occurred timestamp, received timestamp, payload, and metadata
- WHEN the envelope is represented as an external stream event
- THEN the external event preserves `ingestProvider`
- AND it preserves `subscriptionSourceKey`
- AND it preserves `upstreamSource`
- AND it preserves `upstreamType`
- AND it preserves the original payload separately from metadata

#### Scenario: Unknown source and type are not forced into alert types

- GIVEN a future Streamer.bot envelope has an upstream source/type pair that Stream Jams does not normalize
- WHEN the event is represented by the external event contract
- THEN the contract can represent the event without adding a new `StreamEventType`
- AND no alert-compatible normalized event is implied by the external event type alone

### Requirement: Streamer.bot Secret Namespace

Secret references SHALL include a Streamer.bot namespace for password secrets and future Streamer.bot credentials.

#### Scenario: Streamer.bot secret reference validates

- GIVEN a secret reference with namespace `"streamerbot"`
- AND a non-empty account ID
- AND a non-empty secret name
- WHEN the secret reference is validated
- THEN validation succeeds

#### Scenario: Malformed Streamer.bot secret reference is rejected

- GIVEN a secret reference with namespace `"streamerbot"`
- AND an empty account ID or empty secret name
- WHEN the secret reference is validated
- THEN validation fails

### Requirement: Legacy Diagnostics Event Compatibility

Diagnostics event-log parsing SHALL remain compatible with previously stored Twitch normalized event JSON that lacks explicit source identity fields.

#### Scenario: Legacy Twitch event log row is read

- GIVEN an event-log row contains otherwise-valid Twitch normalized event JSON
- AND the stored event JSON does not include `sourcePlatform`
- AND the stored event JSON does not include `ingestProvider`
- WHEN diagnostics reads the event-log row
- THEN the event is interpreted with `sourcePlatform` set to `"twitch"`
- AND the event is interpreted with `ingestProvider` set to `"twitch"`
- AND the stored JSON does not need to be rewritten

#### Scenario: Invalid legacy event remains invalid

- GIVEN an event-log row contains malformed normalized event JSON
- WHEN diagnostics reads the event-log row
- THEN parsing fails instead of silently coercing unrelated malformed data into a valid event

### Requirement: Provider Path Alert Conditions

Alert conditions SHALL be able to match normalized events by `providerId`, `sourcePlatform`, and `ingestProvider`.

#### Scenario: Alert condition matches ingestion provider

- GIVEN a normalized event has `ingestProvider` set to `"twitch"`
- AND an alert condition checks field `ingestProvider` equals `"twitch"`
- WHEN the condition is evaluated
- THEN the condition matches

#### Scenario: Alert condition can distinguish source platform from ingestion provider

- GIVEN a future normalized event has `sourcePlatform` set to `"twitch"`
- AND the event has `ingestProvider` set to `"streamerbot"`
- WHEN alert conditions evaluate `sourcePlatform` and `ingestProvider`
- THEN a condition for `sourcePlatform == "twitch"` can match
- AND a condition for `ingestProvider == "streamerbot"` can match

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

### Requirement: Expanded Streamer.bot Twitch Event Parity
The Streamer.bot event source SHALL normalize supported gift, Hype Train, poll, prediction, and stream lifecycle events to the same canonical event types and stable fields used by direct Twitch intake.

#### Scenario: Supported expanded event is received
- **WHEN** the active Streamer.bot source receives a valid supported Twitch event from the expanded catalog
- **THEN** the event is normalized with `sourcePlatform` set to `twitch` and `ingestProvider` set to `streamerbot`
- **AND** it enters the existing diagnostics, matching, resolution, and playback pipeline

#### Scenario: Terminal variants are normalized
- **WHEN** Streamer.bot reports a completed, archived, terminated, or canceled poll or prediction
- **THEN** the event maps to the corresponding canonical end type
- **AND** a normalized terminal status preserves the upstream outcome

### Requirement: Expanded Streamer.bot Runtime Subscriptions
The Streamer.bot runtime SHALL discover and subscribe to the exact available Twitch category event names needed for the expanded canonical catalog, excluding alternate events that would create duplicate canonical progress notifications.

#### Scenario: Expanded Twitch events are available
- **WHEN** Streamer.bot discovery returns the supported gift, lifecycle, and stream event names
- **THEN** runtime subscription includes those exact discovered names with the existing canonical event selections

#### Scenario: Required expanded event is unavailable
- **WHEN** the active Streamer.bot instance omits one or more required expanded event names
- **THEN** runtime status is degraded with a safe message naming the missing event names
- **AND** available supported events remain subscribed

### Requirement: Streamer.bot Expanded Event Diagnostics
The Streamer.bot runtime SHALL distinguish unsupported events from malformed supported events in diagnostics for the expanded catalog.

#### Scenario: Expanded supported event is malformed
- **WHEN** a recognized expanded Twitch source/type pair lacks required normalized fields
- **THEN** external-event diagnostics record normalization failure and a reference ID
- **AND** no canonical event is forwarded
- **AND** subsequent valid events remain processable
