## ADDED Requirements

### Requirement: Operators Author Local Screen Effects
Authorized management users SHALL create, inspect, edit, duplicate, enable, disable and delete Screen Effects with stable identity, name, optional description/category, event bindings, integer priority, cooldown and default/weighted variants. New effects SHALL start disabled. Definitions SHALL persist through typed repositories and validated backup/restore.

#### Scenario: New effect is created
- **WHEN** an operator saves a valid effect
- **THEN** it receives stable effect/variant identities and remains disabled until explicitly enabled
- **AND** no media plays merely because the effect was created or edited

#### Scenario: Draft is invalid
- **WHEN** a save contains an unknown asset/route, invalid weight, unbounded media duration or invalid trigger
- **THEN** the entire save is rejected with field-level actionable feedback and prior data remains unchanged

#### Scenario: Referenced asset is deleted
- **WHEN** an operator attempts to delete an asset referenced by an effect variant
- **THEN** deletion is blocked with an effect-qualified impact list and no dangling reference is created

#### Scenario: Effects are restored from backup
- **WHEN** a valid backup containing effects is restored
- **THEN** effect/variant/media references round-trip without secrets or runtime occurrences
- **AND** restored effects remain disabled until unresolved output bindings are reviewed

### Requirement: Variants Resolve Coordinated Trusted Media
Each variant SHALL contain one optional image/GIF/video visual and one optional explicit sound, with at least one valid media source, a duration from 1 through 120 seconds, validated bounded layout/style/animation values and output selections. Video soundtracks SHALL use the shared routed-video-audio controls. Arbitrary code, filesystem paths and remote media URLs SHALL be rejected.

#### Scenario: Visual and audio outputs differ
- **WHEN** a variant selects OBS visuals and an enabled video soundtrack only on a headphone route
- **THEN** OBS receives the visual while the soundtrack is delivered only through the selected explicit route
- **AND** the desktop visual and Browser Source audio do not become enabled implicitly

#### Scenario: Audio-only variant is selected
- **WHEN** a variant has no visual and has valid selected explicit audio
- **THEN** it is eligible for playback without a desktop or browser visual recipient

#### Scenario: Video has additional sound
- **WHEN** embedded video audio and the explicit sound are both enabled
- **THEN** both follow the variant-wide destinations with their own volumes
- **AND** selecting the sound does not silently change the video setting

#### Scenario: Visual is sent to another fixed output profile
- **WHEN** a Landscape effect canvas is sent to a selected fixed profile or desktop display
- **THEN** it is uniformly fitted without stretching
- **AND** output expansion does not multiply device audio

### Requirement: Effect Triggers Use Existing Event Sources
Effects SHALL match stable Twitch broadcaster/reward IDs or exact configured Streamer.bot external-event source/type identities through the existing validated event-source boundary. The existing single-active-provider model SHALL remain unchanged. Operator tests SHALL require explicit protected actions and SHALL name their target destinations.

#### Scenario: Reward is renamed
- **WHEN** the selected Twitch reward's title changes but its broadcaster/reward IDs remain the same
- **THEN** the same effect binding continues to match

#### Scenario: Reward is missing from the catalog
- **WHEN** a saved reward binding is no longer resolvable
- **THEN** management shows it as unresolved rather than binding a similarly named reward

#### Scenario: Streamer.bot payload contains an asset path
- **WHEN** an external event's user-controlled payload contains a URL, file path or command-like text
- **THEN** that data cannot choose media, routes or executable behavior
- **AND** only exact configured identities and allowlisted normalized summary fields are used

#### Scenario: Configured event is not subscribed
- **WHEN** an effect references a Streamer.bot event outside the configured subscription boundary
- **THEN** management reports the missing setup and links to existing provider configuration
- **AND** saving the effect does not silently expand subscriptions or activate another provider

#### Scenario: Local admission fails for a Twitch redemption
- **WHEN** an event is rejected by cooldown, duplicate protection, missing output or capacity checks
- **THEN** the local result includes the rejection reason
- **AND** this module does not automatically fulfill, cancel or refund the Twitch redemption

### Requirement: Effect Admission Is Deduplicated And Bounded
Screen Effects SHALL enforce module-scoped duplicate protection, module/effect cooldowns and at most 100 pending occurrences. Capacity overflow SHALL reject the new admission without evicting current/pending work. Cooldowns SHALL be recorded only for successfully admitted work. Eligible bindings SHALL be evaluated deterministically before admission.

#### Scenario: Event triggers an alert and effect
- **WHEN** one normalized event matches both modules and is then redelivered
- **THEN** it can produce one valid occurrence in each module
- **AND** redelivery produces no second occurrence in either module

#### Scenario: Queue is full
- **WHEN** 100 effects are already pending and another otherwise eligible event arrives
- **THEN** the new effect is rejected with a queue-full result
- **AND** no current or pending effect is replaced and no successful-playback cooldown is recorded for the rejection

#### Scenario: Multiple effects intentionally bind the same event
- **WHEN** distinct enabled effects match one event
- **THEN** each eligible binding admits at most once in priority-descending and stable-effect-ID order
- **AND** duplicate copies of the same binding within one effect are rejected during configuration

### Requirement: Screen Effects Playback Is Sequential And Independent
Screen Effects SHALL own one active occurrence across all of its outputs. Pending work SHALL use priority descending and FIFO within equal priority; higher priority SHALL NOT interrupt the current occurrence. Alerts SHALL retain an independent queue and be able to play concurrently.

#### Scenario: Second effect arrives during playback
- **WHEN** an effect is active and another is admitted
- **THEN** the new occurrence remains pending until its predecessor's required obligations settle
- **AND** it does not overlap the active effect on another selected surface

#### Scenario: Alert arrives during an effect
- **WHEN** Alerts is eligible to advance while Screen Effects is active
- **THEN** the alert can start without waiting for Screen Effects
- **AND** their visual overlap follows each selected surface's module order

#### Scenario: One output never completes
- **WHEN** a selected recipient does not settle before duration plus 5 seconds
- **THEN** its work is stopped/failed and released from completion tracking
- **AND** it cannot hold the effect queue indefinitely

### Requirement: Occurrences Snapshot Their Selected Variant
The runtime SHALL choose one eligible weighted variant at admission and snapshot resolved media, audio toggles/volumes, output route IDs, duration and priority. Replay SHALL retain that variant snapshot with a new occurrence ID and fresh device bindings, without rerolling or rematching the original provider event.

#### Scenario: Effect changes while queued
- **WHEN** an operator edits a definition after an occurrence is admitted
- **THEN** the pending occurrence keeps its snapshotted content and settings
- **AND** later automatic admissions use the saved changes

#### Scenario: Known recent effect is replayed
- **WHEN** an authorized operator replays a retained recent occurrence
- **THEN** the same selected variant is re-admitted with a new occurrence ID under current capacity/safety rules
- **AND** current bindings of its retained route IDs apply without retargeting already active work

#### Scenario: Runtime restarts
- **WHEN** the app restarts after effects were active or pending
- **THEN** saved definitions and safety settings remain available
- **AND** active, pending and recent media occurrences are not restored for automatic playback

### Requirement: Effect Operations Preserve Local Safety Boundaries
Authoring/tests/operations SHALL retain management auth, CSRF, origin validation, rate limits, sanitized summaries and accessible feedback. Production media SHALL fail closed without diagnostic text. Module and per-effect disabled states, global safety and recipient availability SHALL be checked before playback.

#### Scenario: Test requested while globally muted
- **WHEN** an operator explicitly tests an eligible effect while mute is active
- **THEN** visual work may proceed but browser/device media audio remains muted
- **AND** merely selecting an asset or destination remains silent

#### Scenario: No eligible output remains
- **WHEN** an occurrence has no usable selected visual or audio recipient
- **THEN** it settles with an actionable no-output result rather than becoming permanently current or choosing a fallback
