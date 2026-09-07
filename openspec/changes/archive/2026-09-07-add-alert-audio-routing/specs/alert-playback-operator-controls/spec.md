## MODIFIED Requirements

### Requirement: Existing Playback Controls Are Directly Operable
Authorized operators SHALL be able to pause or resume queue advancement, mute or unmute alert audio, enable or disable do-not-disturb, skip the current item, and replay a known recent item through the existing protected playback commands. These commands SHALL control both browser and local-device playback through one authoritative state without changing TTS routing.

#### Scenario: Reversible playback state is changed
- **WHEN** an operator changes pause, mute, or do-not-disturb state
- **THEN** the returned authoritative snapshot updates the operator surface immediately
- **AND** the persistent status remains visible until the state is reversed
- **AND** queue-pause copy states that the current alert continues while queued alerts wait
- **AND** local device playback follows the same queue-advancement semantics

#### Scenario: Current alert is skipped
- **WHEN** an operator skips the current playback item
- **THEN** the current item is completed with skipped status
- **AND** every active overlay instruction is removed and device playback for that occurrence is stopped before the next item is delivered
- **AND** if device stop is not acknowledged within 2 seconds, the owned audio renderer is destroyed before next delivery
- **AND** the next eligible queued item starts according to existing pause and do-not-disturb rules

#### Scenario: Recent alert is replayed
- **WHEN** an operator replays a known recent item
- **THEN** the runtime enqueues the same resolved alert content and selected route IDs using existing queue priority semantics and a new playback occurrence ID
- **AND** device bindings are resolved for that new occurrence without retargeting another active occurrence
- **AND** replay of an unknown or expired item fails without mutating the queue
- **AND** missing routes fail closed without selecting replacement outputs

#### Scenario: Alert audio is muted
- **WHEN** an operator mutes alert audio
- **THEN** connected browser sources immediately mute explicit alert audio and browser speech, and alert video layers remain silent
- **AND** local device elements immediately receive the same muted state
- **AND** reconnecting browser sources and recreated device players receive the authoritative muted state before new playback
- **AND** remote TTS is not triggered for items that begin while muted

#### Scenario: Alert audio is unmuted
- **WHEN** an operator unmutes alert audio
- **THEN** connected and reconnecting browser sources and local device players receive the authoritative unmuted state for explicit audio
- **AND** alert video layers remain silent
- **AND** future items may trigger configured remote TTS normally
- **AND** the system does not claim it can recall speech already handed to an external TTS provider

#### Scenario: Safety state cannot be persisted
- **WHEN** a mute, pause, or do-not-disturb update cannot be persisted
- **THEN** neither the local player nor the browser path applies a different successful state
- **AND** the existing actionable failure is returned
