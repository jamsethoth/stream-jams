## ADDED Requirements

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
