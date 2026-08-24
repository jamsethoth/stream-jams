# normalized-twitch-events Specification

## Purpose
TBD - created by archiving change add-normalized-twitch-event-types. Update Purpose after archive.
## Requirements
### Requirement: Expanded Canonical Twitch Event Catalog
The system SHALL represent gift subscriptions, community gifts, Hype Train lifecycle phases, poll lifecycle phases, prediction lifecycle phases, and stream online/offline transitions as separate normalized Twitch-origin event types in addition to the existing canonical types.

#### Scenario: Lifecycle phases remain distinct
- **WHEN** a supported Hype Train, poll, prediction, or stream lifecycle notification is normalized
- **THEN** the resulting event type identifies the specific start, progress, lock, end, online, or offline phase
- **AND** alert matching does not require a separate phase condition to distinguish it

### Requirement: Stable Normalized Payloads
The system SHALL validate each new event through an explicit typed schema containing the existing normalized base fields and stable cross-provider fields needed for matching, templates, samples, and diagnostics.

#### Scenario: Provider-specific payload becomes canonical
- **WHEN** direct Twitch or Streamer.bot supplies a valid supported event
- **THEN** the normalizer produces the same canonical event type and stable field meanings for either ingestion provider
- **AND** sanitized upstream provenance is retained in metadata without making raw provider fields part of the alert contract

#### Scenario: Channel lifecycle actor is normalized
- **WHEN** a Hype Train, poll, prediction, stream online, or stream offline event is normalized
- **THEN** the normalized actor identifies the broadcaster

### Requirement: Explicit Gift Subscription Semantics
The system SHALL distinguish recipient gift-subscription events from aggregate community-gift events and SHALL NOT normalize gifted subscriptions as ordinary subscriptions.

#### Scenario: Individual gifted subscription is received
- **WHEN** Twitch reports a subscription whose `is_gift` value is true or Streamer.bot reports `Twitch.GiftSub`
- **THEN** the system emits one `gift_subscription` event for the recipient
- **AND** it does not emit an ordinary `subscription` event for that notification

#### Scenario: Community gift is received
- **WHEN** Twitch reports an aggregate subscription gift or Streamer.bot reports `Twitch.GiftBomb`
- **THEN** the system emits one `community_gift` event with normalized gift count and tier
- **AND** recipient gift-subscription events from the same upstream gift remain independently eligible for alerts

### Requirement: Direct Twitch Subscription Coverage
The direct Twitch runtime SHALL request EventSub subscriptions for every canonical event in this change using the documented subscription version and broadcaster condition.

#### Scenario: Authorized Twitch runtime starts
- **WHEN** an active Twitch account has all required scopes and EventSub establishes a WebSocket session
- **THEN** the runtime requests gift, Hype Train, poll, prediction, stream online, and stream offline subscriptions in addition to existing subscriptions

### Requirement: Expanded Twitch Authorization Readiness
The standard Twitch Device Code authorization SHALL request `channel:read:hype_train`, `channel:read:polls`, and `channel:read:predictions`, and a saved account missing any required scope SHALL remain saved but SHALL NOT be reported ready for direct Twitch intake.

#### Scenario: Existing grant lacks an added scope
- **WHEN** token validation finds a connected Twitch account missing one or more required scopes
- **THEN** management status reports `Authorization update required`
- **AND** identifies the missing capability in human-readable form
- **AND** provides the existing reconnect action without deleting the saved account first

#### Scenario: Expanded authorization succeeds
- **WHEN** the user completes the reconnect flow and Twitch grants all required scopes
- **THEN** the account becomes ready
- **AND** EventSub can subscribe to the expanded catalog

### Requirement: Supported Event Failure Diagnostics
The system SHALL reject a supported event whose required normalized fields are malformed without terminating provider intake and SHALL record an actionable diagnostic containing a reference ID and sanitized provider context.

#### Scenario: Supported payload is malformed
- **WHEN** a provider delivers a recognized event type with missing or invalid required fields
- **THEN** no alert-compatible event is emitted
- **AND** diagnostics records a human-readable error, next step, reference ID, ingest provider, and upstream source/type
- **AND** the runtime remains able to process later events
