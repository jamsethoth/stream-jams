## MODIFIED Requirements

### Requirement: Existing Playback Controls Are Directly Operable
Authorized operators SHALL be able to pause or resume all queues or one module queue, mute or unmute Alerts and Effects media audio together or through scoped per-module automation, enable or disable global do-not-disturb, skip an identified current occurrence, remove an identified pending occurrence, clear a named module's pending queue, and replay a known recent occurrence through protected module-qualified commands. These commands SHALL control both browser and local-device playback through one authoritative state without changing TTS routing.

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
- **THEN** connected browser sources immediately mute the targeted module audio, enabled video soundtracks and browser speech
- **AND** local device elements immediately receive the same muted state
- **AND** reconnecting browser sources and recreated device players receive the authoritative muted state before new playback
- **AND** remote TTS is not triggered for items that begin while muted

#### Scenario: Alert audio is unmuted
- **WHEN** an operator unmutes alert audio
- **THEN** connected and reconnecting browser sources and local device players receive the authoritative unmuted state for explicit audio and enabled video soundtracks in the targeted modules
- **AND** enabled video soundtracks receive the same unmuted state while visual video elements remain internally muted
- **AND** future items may trigger configured remote TTS normally
- **AND** the system does not claim it can recall speech already handed to an external TTS provider

#### Scenario: Safety state cannot be persisted
- **WHEN** a mute, pause, or do-not-disturb update cannot be persisted
- **THEN** neither the local player nor the browser path applies a different successful state
- **AND** the existing actionable failure is returned

#### Scenario: Module mute remains independent
- **WHEN** Alerts is muted independently
- **THEN** Effects and timer cues remain audible according to their own configuration
- **AND** visuals and queue progression continue
- **AND** the Operator Console identifies the per-module mute policy

#### Scenario: All mute does not retain a hidden master gate
- **WHEN** All is selected for Alerts and Effects
- **THEN** mixed state toggles to both muted and both-muted toggles to both unmuted, including individually muted targets
- **AND** timer cues are unaffected and legacy global mute compatibility is not retained
