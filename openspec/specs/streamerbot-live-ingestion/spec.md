# streamerbot-live-ingestion Specification

## Purpose
TBD - created by archiving change add-streamerbot-live-event-ingestion. Update Purpose after archive.
## Requirements
### Requirement: Active Streamer.bot Runtime Lifecycle

The system SHALL maintain a persistent Streamer.bot WebSocket connection only while a Streamer.bot registration is the active event-source provider.

#### Scenario: Active Streamer.bot source starts intake

- **WHEN** application startup or provider activation finds an active Streamer.bot event-source registration
- **THEN** the runtime resolves its stored connection configuration and optional password
- **AND** it connects through the existing Streamer.bot protocol client
- **AND** it starts supported event subscriptions

#### Scenario: Streamer.bot source becomes inactive

- **WHEN** the active Streamer.bot registration is deactivated or replaced
- **THEN** the runtime disconnects its WebSocket client
- **AND** no later event from the replaced connection reaches alert ingestion

#### Scenario: Application shuts down

- **WHEN** the Stream Jams runtime closes
- **THEN** the Streamer.bot client disconnects before persistence resources close

### Requirement: Supported Event Discovery And Subscription

The runtime SHALL discover Streamer.bot event categories and subscribe only to the supported Twitch parity event names using the exact discovered category key.

#### Scenario: Twitch category uses different casing

- **WHEN** `GetEvents` returns a category key whose case-insensitive value is `twitch`
- **THEN** the runtime subscribes using the exact returned key
- **AND** it requests only available names from `Follow`, `Sub`, `ReSub`, `Cheer`, `Raid`, and `RewardRedemption`

#### Scenario: Supported event name is unavailable

- **WHEN** the discovered Twitch category omits one or more supported event names
- **THEN** the runtime subscribes to the available supported names
- **AND** runtime status is degraded with a safe message naming the missing event types

#### Scenario: Reconnect restores subscriptions

- **WHEN** the Streamer.bot socket reconnects after an unexpected close
- **THEN** the existing protocol client restores the selected subscriptions
- **AND** intake resumes without a provider reconfiguration

### Requirement: Streamer.bot Twitch Event Normalization

The system SHALL normalize fixture-backed Streamer.bot Twitch events into the existing canonical alert event types with explicit source and ingestion provenance.

#### Scenario: Supported Twitch event is normalized

- **WHEN** a valid `Twitch.Follow`, `Twitch.Sub`, `Twitch.ReSub`, `Twitch.Cheer`, `Twitch.Raid`, or `Twitch.RewardRedemption` envelope is received
- **THEN** it becomes the corresponding canonical `NormalizedStreamEvent`
- **AND** `providerId` and `sourcePlatform` are `twitch`
- **AND** `ingestProvider` is `streamerbot`
- **AND** upstream source, type, and timestamp remain available in metadata

#### Scenario: Stable upstream ID is available

- **WHEN** a supported payload contains a stable message, redemption, or equivalent event ID
- **THEN** the normalized event ID is derived from that upstream ID

#### Scenario: Stable upstream ID is absent

- **WHEN** a supported payload has no stable event ID
- **THEN** the normalized event ID is a deterministic digest of stable envelope and event fields

#### Scenario: Supported payload is malformed

- **WHEN** an envelope has a supported source/type pair but lacks a field required by its canonical event type
- **THEN** no alert event is emitted
- **AND** runtime status and logs expose a safe human-readable normalization failure with a reference ID

#### Scenario: Source or type is unsupported

- **WHEN** a valid Streamer.bot envelope has an unsupported source/type pair
- **THEN** no canonical alert event is emitted
- **AND** diagnostics record safe source/type metadata without storing raw payload content

### Requirement: Shared Event Pipeline Delivery

Normalized Streamer.bot events SHALL use the same ingestion, diagnostics, alert matching, resolution, and playback pipeline as direct Twitch events.

#### Scenario: Streamer.bot raid matches existing rule

- **WHEN** a valid Streamer.bot Twitch raid normalizes to canonical event type `raid`
- **AND** an enabled alert rule matches `raid`
- **THEN** the existing event pipeline records and evaluates the event
- **AND** matching playback is enqueued without a Streamer.bot-specific duplicate rule

#### Scenario: Duplicate Streamer.bot event is received

- **WHEN** two normalized Streamer.bot events have the same deterministic event ID
- **THEN** the first event is accepted
- **AND** the second event is counted and ignored as a duplicate

### Requirement: Event Source Runtime Synchronization

The system SHALL synchronize direct Twitch and Streamer.bot runtimes from the persisted active event-source registration after every relevant lifecycle change.

#### Scenario: Event source switches from Twitch to Streamer.bot

- **WHEN** a user confirms activation of a Streamer.bot registration while Twitch is active
- **THEN** direct Twitch intake disconnects before Streamer.bot intake starts
- **AND** only Streamer.bot events are accepted afterward

#### Scenario: Event source switches from Streamer.bot to Twitch

- **WHEN** a user confirms activation of a Twitch registration while Streamer.bot is active
- **THEN** Streamer.bot intake disconnects before direct Twitch intake starts
- **AND** only direct Twitch events are accepted afterward

#### Scenario: Active event source is deactivated

- **WHEN** the active event-source registration is deactivated without a replacement
- **THEN** both event-source runtimes are disconnected
- **AND** provider configuration remains registered for later reactivation

### Requirement: Streamer.bot Runtime Diagnostics

The diagnostics workspace SHALL expose Streamer.bot live runtime state separately from last validation state.

#### Scenario: Streamer.bot runtime is healthy

- **WHEN** the active Streamer.bot client is connected and all supported subscriptions are active
- **THEN** diagnostics reports the Streamer.bot runtime as ready

#### Scenario: Streamer.bot runtime fails

- **WHEN** connection, authentication, secret retrieval, discovery, subscription, or normalization fails
- **THEN** diagnostics reports a degraded state
- **AND** it provides a safe human-readable message without password, authentication hash, secret reference, or raw provider payload
