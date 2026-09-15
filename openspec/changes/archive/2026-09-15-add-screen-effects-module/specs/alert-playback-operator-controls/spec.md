## MODIFIED Requirements

### Requirement: Playback Operations Use A Separate Operator Surface
The system SHALL provide a local `/operator` surface for stream-time playback operations across registered module queues and SHALL keep alert/effect editing and configuration in management routes.

#### Scenario: Operator surface is opened from management
- **WHEN** an authorized user chooses `Open operator console` from management
- **THEN** ordinary activation navigates the current tab to `/operator` using the existing local management-session bootstrap and authorization boundary
- **AND** the link retains native modified-click and browser-context-menu behavior
- **AND** the operator surface does not copy or persist bearer or CSRF values for cross-tab reuse
- **AND** the operator surface does not show management editing navigation

#### Scenario: Configuration correction is required
- **WHEN** playback state contains an actionable configuration or runtime failure
- **THEN** the operator surface links to the applicable management or filtered Diagnostics route
- **AND** it does not duplicate the configuration workflow

### Requirement: Operator Surface Shows Authoritative Playback State
The operator surface SHALL show the authoritative merged current, queued and recent module occurrences, global safety state and per-module queue pause state while retaining the last known snapshot during temporary refresh failure.

#### Scenario: Playback snapshot is available
- **WHEN** the operator surface loads a playback snapshot
- **THEN** it shows every active module occurrence, merged queued rows by enqueue time/sequence with module queue positions, and replayable recent items by completion time/sequence
- **AND** it identifies each item's module and does not imply a global playback order
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
Authorized operators SHALL be able to pause or resume all queues or one module queue, mute or unmute all module media audio, enable or disable global do-not-disturb, skip an identified current occurrence, remove an identified pending occurrence, clear a named module's pending queue, and replay a known recent occurrence through protected module-qualified commands. These commands SHALL control both browser and local-device playback through one authoritative state without changing TTS routing.

#### Scenario: Reversible playback state is changed
- **WHEN** an operator changes pause, mute, or do-not-disturb state
- **THEN** the returned authoritative snapshot updates the operator surface immediately
- **AND** the persistent status remains visible until the state is reversed
- **AND** queue-pause copy states that current module occurrences continue while held queues wait
- **AND** local device playback follows the same queue-advancement semantics

#### Scenario: Current alert is skipped
- **WHEN** an operator skips the identified current playback item in its owning module
- **THEN** the current item is completed with skipped status
- **AND** every active overlay instruction belonging to that occurrence is removed and its device playback is stopped before the next item in that module is delivered
- **AND** successful normal stop leaves other modules' playback unchanged
- **AND** if device stop is not acknowledged within 2 seconds, the owned audio renderer is destroyed before next delivery and every affected module's audio obligations are explicitly failed and settled
- **AND** the next eligible queued item starts according to existing pause and do-not-disturb rules

#### Scenario: Recent alert is replayed
- **WHEN** an operator replays a known recent item
- **THEN** the runtime enqueues the same resolved module content, selected variant and selected route IDs using existing queue priority semantics and a new playback occurrence ID
- **AND** device bindings are resolved for that new occurrence without retargeting another active occurrence
- **AND** replay of an unknown or expired item fails without mutating the queue
- **AND** missing routes fail closed without selecting replacement outputs

#### Scenario: Alert audio is muted
- **WHEN** an operator mutes alert audio
- **THEN** connected browser sources immediately mute explicit module audio, enabled video soundtracks and browser speech
- **AND** local device elements immediately receive the same muted state
- **AND** reconnecting browser sources and recreated device players receive the authoritative muted state before new playback
- **AND** remote TTS is not triggered for items that begin while muted

#### Scenario: Alert audio is unmuted
- **WHEN** an operator unmutes alert audio
- **THEN** connected and reconnecting browser sources and local device players receive the authoritative unmuted state for explicit audio and enabled video soundtracks across modules
- **AND** enabled video soundtracks receive the same unmuted state while visual video elements remain internally muted
- **AND** future items may trigger configured remote TTS normally
- **AND** the system does not claim it can recall speech already handed to an external TTS provider

#### Scenario: Safety state cannot be persisted
- **WHEN** a mute, pause, or do-not-disturb update cannot be persisted
- **THEN** neither the local player nor the browser path applies a different successful state
- **AND** the existing actionable failure is returned
