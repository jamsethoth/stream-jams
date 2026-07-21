## ADDED Requirements

### Requirement: Playback Operations Use A Separate Operator Surface
The system SHALL provide a local `/operator` surface for stream-time alert playback operations and SHALL keep alert editing and configuration in management routes.

#### Scenario: Operator surface is opened from management
- **WHEN** an authorized user chooses `Open operator console` from management
- **THEN** the application opens the `/operator` route using the same local authenticated session
- **AND** the operator surface does not show management editing navigation

#### Scenario: Configuration correction is required
- **WHEN** playback state contains an actionable configuration or runtime failure
- **THEN** the operator surface links to the applicable management or filtered Diagnostics route
- **AND** it does not duplicate the configuration workflow

### Requirement: Operator Surface Shows Authoritative Playback State
The operator surface SHALL show the authoritative current, queued, recent, paused, muted, and do-not-disturb state while retaining the last known snapshot during temporary refresh failure.

#### Scenario: Playback snapshot is available
- **WHEN** the operator surface loads a playback snapshot
- **THEN** it shows the current item, queued items in playback order, and replayable recent items
- **AND** each row shows an allowlisted normalized summary rather than raw provider metadata

#### Scenario: Playback refresh fails
- **WHEN** a later playback refresh fails after a snapshot has loaded
- **THEN** the last known state remains visible and is marked stale
- **AND** the failure includes a human-readable cause, next step, and reference ID when available

#### Scenario: Operator tab is hidden
- **WHEN** the operator document becomes hidden
- **THEN** periodic polling pauses
- **AND** polling resumes with an immediate refresh when the document becomes visible

### Requirement: Existing Playback Controls Are Directly Operable
Authorized operators SHALL be able to pause or resume playback, mute or unmute alert audio, enable or disable do-not-disturb, skip the current item, and replay a known recent item through the existing protected playback commands.

#### Scenario: Reversible playback state is changed
- **WHEN** an operator changes pause, mute, or do-not-disturb state
- **THEN** the returned authoritative snapshot updates the operator surface immediately
- **AND** the persistent status remains visible until the state is reversed

#### Scenario: Current alert is skipped
- **WHEN** an operator skips the current playback item
- **THEN** the current item is completed with skipped status
- **AND** the next eligible queued item starts according to existing pause and do-not-disturb rules

#### Scenario: Recent alert is replayed
- **WHEN** an operator replays a known recent item
- **THEN** the runtime enqueues the same resolved alert content using existing queue priority semantics
- **AND** replay of an unknown or expired item fails without mutating the queue

### Requirement: Playback Safety State Survives Restart
The system SHALL persist paused, muted, and do-not-disturb state as non-secret local configuration and SHALL restore that state before new playback begins after restart.

#### Scenario: Muted runtime restarts
- **WHEN** Stream Jams restarts while muted or in do-not-disturb mode
- **THEN** the restored playback snapshot retains that state
- **AND** the operator surface prominently reports the restored protection

#### Scenario: Safety-state persistence fails
- **WHEN** a playback safety-state command cannot be persisted
- **THEN** the command fails without changing the active runtime state
- **AND** the operator receives an actionable error

#### Scenario: Older configuration is loaded
- **WHEN** configuration has no stored playback safety state
- **THEN** paused, muted, and do-not-disturb default to false
- **AND** no queue or recent playback item is restored

### Requirement: Operator Controls Preserve Local Security And Accessibility
The operator surface and playback commands SHALL retain management authentication, rate limiting, redaction, keyboard access, visible focus, and semantic status announcements.

#### Scenario: Unauthenticated control is attempted
- **WHEN** a request without a valid local management session attempts a playback command
- **THEN** the request is rejected before playback state is read or changed

#### Scenario: Keyboard operator changes playback state
- **WHEN** an operator reaches a playback control using the keyboard and activates it
- **THEN** focus remains predictable
- **AND** the changed state or failure is announced through an accessible status region
