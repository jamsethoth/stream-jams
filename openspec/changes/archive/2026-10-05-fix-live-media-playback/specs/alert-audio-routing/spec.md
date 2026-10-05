## MODIFIED Requirements

### Requirement: Unavailable Devices Never Cause Automatic Rerouting
The system SHALL fail closed for unavailable, disconnected or rejected device sinks. It SHALL NOT automatically redirect their audio to another device or the Browser Source, and recovery SHALL apply only to future playback.

#### Scenario: Device is unplugged
- **WHEN** an active destination disappears
- **THEN** that destination stops and an actionable management warning is shown
- **AND** other healthy outputs continue without a fallback copy

#### Scenario: Device returns with a different ID
- **WHEN** a device label reappears with a different ID
- **THEN** the route requires explicit rebinding rather than guessing identity from its name

#### Scenario: Player crashes and recovers
- **WHEN** the hidden player crashes, including repeated failures
- **THEN** outstanding work fails and no interrupted audio is replayed on recreation
- **AND** subsequent requests wait for automatic recreation with bounded backoff, without a permanent manual-retry lockout

#### Scenario: Owning service is lost
- **WHEN** the server exits, its IPC link closes, or its 10-second ownership lease expires
- **THEN** the desktop host stops local audio rather than continuing unsupervised playback

#### Scenario: Current service resumes its ownership lease
- **WHEN** the active service worker sends a valid lease after ownership expired without being replaced or entering shutdown
- **THEN** the desktop host restores audio-device availability without requiring an app restart
- **AND** it preserves mute state and bounded recovery backoff, recreates the renderer only when new work requires it, and does not replay interrupted audio
- **AND** leases from an old worker generation or during shutdown cannot restore ownership
