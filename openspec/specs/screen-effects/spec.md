# Screen Effects Specification

## Purpose

Define safe local Screen Effect authoring, trusted event admission, independent bounded playback, routed media delivery, and operator controls across browser and desktop surfaces.

## Requirements

### Requirement: Operators Author Local Screen Effects
Authorized management users SHALL create, inspect, edit, duplicate, enable, disable and delete Screen Effects with stable identity, name, optional description/category, event bindings, integer queue priority and unified weighted variants. New effects SHALL start disabled. Definitions SHALL persist through typed repositories and validated backup/restore.

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
Each variant SHALL contain one optional image/GIF/video visual and one optional explicit sound, with at least one valid media source, bounded duration, validated layout and output selections. Custom duration SHALL accept 1 through 120 seconds; Media duration SHALL follow the media-synchronized duration requirement. Screen Effect variants SHALL NOT expose animation settings. Video soundtracks SHALL use the shared routed-video-audio controls. Arbitrary code, filesystem paths and remote media URLs SHALL be rejected.

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

### Requirement: Screen Effect Saved Tests Name Their Destinations

The Screen Effects editor SHALL label protected variant delivery as `Test saved…`, SHALL summarize the saved input and selected destinations using human-readable names, and SHALL preserve its explicit live-output confirmation.

#### Scenario: User reviews a saved effect test

- **WHEN** a user chooses Test saved for an effect variant
- **THEN** the interface identifies that the saved variant will be used
- **AND** lists selected browser, desktop, and device destinations exposed by the existing contract without route keys or secret URLs
- **AND** unavailable destinations remain visible with their existing correction path

#### Scenario: User confirms saved effect test

- **WHEN** the saved effect can reach a live output
- **THEN** no occurrence is queued until the user completes the existing explicit confirmation
- **AND** cancellation queues nothing

### Requirement: Effect Admission Is Deduplicated And Bounded
Screen Effects SHALL enforce module-scoped duplicate protection, an optional module cooldown and at most 100 pending occurrences. Capacity overflow SHALL reject the new admission without evicting current/pending work. The module cooldown SHALL be recorded only after at least one matching effect is admitted. Eligible bindings SHALL be evaluated deterministically before admission.

#### Scenario: Event triggers an alert and effect
- **WHEN** one normalized event matches both modules and is then redelivered
- **THEN** it can produce one valid occurrence in each module
- **AND** redelivery produces no second occurrence in either module

#### Scenario: Queue is full
- **WHEN** 100 effects are already pending and another otherwise eligible event arrives
- **THEN** the new effect is rejected with a queue-full result
- **AND** no current or pending effect is replaced and no module cooldown is recorded for the rejection

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
- **THEN** the coordinator requests stop and completes the failed occurrence after local outputs acknowledge stop
- **AND** a rejected local stop retains the occurrence for explicit retry and reports the failure instead of advancing into possible overlapping playback

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

### Requirement: Screen Effect Binary Output Controls Are Inline And Associated
Screen Effect output and embedded-media audio selections SHALL render each native checkbox inline with its associated label using scoped form styling without changing destination semantics or unrelated form controls.

#### Scenario: Output checkbox is operated through its label
- **WHEN** an operator clicks the text for OBS Browser Source or Desktop overlay
- **THEN** only the associated checkbox changes
- **AND** checked, unchecked, disabled, and keyboard focus states remain visible at desktop and 390 CSS pixels wide

#### Scenario: Embedded media audio is configured
- **WHEN** a Screen Effect variant exposes embedded-media audio toggles
- **THEN** each checkbox remains inline with its label, including when the label wraps
- **AND** other consumers of shared media-audio controls retain their existing layout and behavior

### Requirement: Screen Effect Sets Select One Live Collection
The system SHALL persist named Screen Effect sets with one active set. Each effect SHALL belong to exactly one set. Only enabled effects in the active set SHALL respond to newly admitted trusted events. Set activation SHALL require explicit confirmation and SHALL preserve previously admitted occurrence snapshots.

#### Scenario: Existing data is upgraded
- **WHEN** a database without Screen Effect sets is upgraded
- **THEN** existing effects belong to an active Default set with their IDs, media, bindings and enabled states preserved

#### Scenario: Inactive set is prepared
- **WHEN** an operator creates, duplicates or edits an inactive set
- **THEN** its effects remain ineligible for automatic live triggers until the operator activates that set

#### Scenario: A set is activated
- **WHEN** an operator confirms activation of another set
- **THEN** that set becomes the sole active set atomically and subsequent events match only its enabled effects

#### Scenario: Protected deletion and unique names
- **WHEN** an operator attempts to delete the active set or use a case-insensitive duplicate set name
- **THEN** the operation is rejected without changing existing data

### Requirement: Screen Effect Hierarchy Exposes Variants
The module page and focused editor SHALL present a collapsible set/effect/variant hierarchy, preserve explicit save and dirty-navigation behavior, and allow opening a specific variant directly.

#### Scenario: A variant is opened from inventory
- **WHEN** an operator expands a set and effect and selects a variant
- **THEN** the focused editor opens that effect with the chosen variant selected and preserves that selection on reload

#### Scenario: Unsaved edits are protected
- **WHEN** an operator selects another effect while the current effect has unsaved edits
- **THEN** the existing Save and leave, Discard and Cancel guard applies

#### Scenario: A variant is removed from a draft
- **WHEN** an operator confirms Remove variant for a removable selection
- **THEN** only the draft changes, selection moves to a remaining variant, and Undo restores the removed variant
- **AND** the change persists only after Save
- **AND** the last variant or the only enabled variant cannot be removed

### Requirement: Screen Effects Uses Familiar Bounded Management Layouts
The system SHALL present Screen Effects using the Alerts module's compact inventory and focused editor conventions while preserving Screen Effects data and explicit live actions.

#### Scenario: Editing at laptop dimensions
- **WHEN** an operator opens an effect at a 1366 by 768 viewport
- **THEN** Save remains visible, the canvas fits available space, and every setting is reachable through scrolling inspector panels without page overflow

#### Scenario: Switching inspector sections
- **WHEN** an operator changes between Variant, Effect and Triggers by pointer or keyboard
- **THEN** the selected panel is accessible and unsaved edits are retained without persistence or live output

#### Scenario: Smaller viewport
- **WHEN** the editor viewport cannot fit three columns
- **THEN** the workspace stacks with scrolling access to all panels and the header remains reachable

#### Scenario: Creating a distinct variant
- **WHEN** an operator chooses New variant
- **THEN** the editor adds and selects a disabled blank variant with independent media and weighting controls
- **AND** Copy variant remains a separate action for cloning the selected variant

#### Scenario: Related actions wrap
- **WHEN** Screen Effect or set actions wrap at the available width
- **THEN** horizontal and vertical spacing keeps adjacent controls visually distinct

#### Scenario: Compact choices and dependent fields
- **WHEN** the editor presents checkbox or radio choices
- **THEN** each control SHALL remain inline with its label with consistent spacing
- **AND** a dependent numeric field SHALL remain hidden until its controlling choice is selected

#### Scenario: Module configuration
- **WHEN** an operator opens Screen Effects configuration
- **THEN** a collapsed Browser sources section with a configuration summary precedes the compact effects inventory and exposes existing URL actions when expanded

#### Scenario: Secondary effect actions
- **WHEN** an operator opens an effect row's More menu by pointer or keyboard
- **THEN** Copy and Delete appear in an anchored overlay without changing row dimensions or adding inventory scrolling
- **AND** the menu remains within the viewport, supports arrow, Home, End and Escape keys, and returns focus to its trigger when dismissed with Escape

### Requirement: Local Draft Effect Preview
The editor SHALL preview the selected unsaved variant in its central canvas, without a separate dialog, locally with its layout, duration and configured audio volumes. Preview SHALL provide Play, Stop and Mute controls without admitting a live occurrence or using configured output routes.

#### Scenario: Preview with sound and mute
- **WHEN** an operator presses the toolbar Preview or the canvas Play preview control
- **THEN** its visual, enabled video soundtrack and separate sound play locally at their configured volumes
- **AND** Mute preview suppresses both audio sources without modifying the draft

#### Scenario: Stop and cleanup
- **WHEN** the duration elapses, the operator stops playback, or the selected variant changes or the editor unmounts
- **THEN** media playback and preview timers stop and closed-preview media URLs are released

#### Scenario: Unavailable media
- **WHEN** media loading or playback fails
- **THEN** the editor provides actionable recovery guidance without changing saved data or delivering live output

### Requirement: Unified Screen Effect Variant Weighting
The system SHALL treat every enabled Screen Effect variant as a member of one weighted selection pool and SHALL NOT expose a default-versus-weighted kind in current management contracts or authoring controls.

#### Scenario: Automatic selection
- **WHEN** an enabled Screen Effect with multiple enabled variants is admitted
- **THEN** each enabled variant's chance equals its positive integer weight divided by the sum of enabled weights
- **AND** disabled variants are excluded

#### Scenario: Authoring probabilities
- **WHEN** an operator views or changes variant weights and enabled states
- **THEN** every variant row shows its weight and calculated expected percentage
- **AND** Save is unavailable with guidance when no variant is enabled

#### Scenario: Local weight simulation
- **WHEN** an operator chooses Simulate 1,000 selections
- **THEN** the editor uses the same weighted selector as live admission and shows expected percentage, observed count and observed percentage for every variant
- **AND** the counts total 1,000 while disabled variants remain visible with zero selections
- **AND** no draft is saved, occurrence is admitted, trigger is fired or output route is used

#### Scenario: Existing stored variants
- **WHEN** the repository reads stored Screen Effect variants whose legacy kind is `default` or `weighted`
- **THEN** it returns the unified current variant model without losing identity, media, routing, enabled state or weight
- **AND** newly saved rows retain the migration 022 storage shape with neutral legacy kind `weighted`

### Requirement: Event-Owned Cooldown And Explained Queue Priority
The system SHALL leave per-effect cooldown policy to the triggering event and SHALL explain that Screen Effect priority orders queued matches without interrupting current playback.

#### Scenario: Repeated matching events
- **WHEN** distinct accepted events match the same enabled Screen Effect
- **THEN** Screen Effect admission does not suppress either event with a per-effect cooldown

#### Scenario: Multiple effects match one event
- **WHEN** one event matches multiple enabled Screen Effects
- **THEN** higher queue-priority values are admitted first, equal values use stable effect identity order, and current playback is not interrupted

#### Scenario: Existing stored cooldown values
- **WHEN** the repository reads or saves an effect row with the legacy `cooldown_seconds` column
- **THEN** the current Screen Effect contract omits per-effect cooldown and saved rows normalize the legacy column to zero

### Requirement: Screen Effect Variants Support Media-Synchronized Duration
The system SHALL let each Screen Effect variant use `media` or `custom` duration mode, default a newly created variant to `media`, and treat an absent persisted mode as `custom`.

#### Scenario: Longest variant media wins
- **WHEN** a Media-mode variant selects a video visual and a separate sound
- **THEN** its effective duration SHALL equal the longest positive stored duration up to 120000 milliseconds

#### Scenario: Variant media duration is unavailable
- **WHEN** no eligible selected asset has positive stored duration
- **THEN** the variant SHALL use 10000 milliseconds
- **AND** the editor SHALL show a fallback warning

#### Scenario: Variant is copied
- **WHEN** an operator copies a variant
- **THEN** its selected duration mode, custom duration, and requested fades SHALL be preserved

### Requirement: Screen Effect Editor Authors Audio Fades
The system SHALL expose independent Fade in and Fade out controls for a variant's separate sound and enabled video soundtrack.

#### Scenario: Draft preview uses timing and fades
- **WHEN** an operator previews an unsaved variant
- **THEN** the inline preview SHALL use its resolved effective duration and requested envelopes
- **AND** its local mute control SHALL remain independent

#### Scenario: Existing variant is opened
- **WHEN** a stored variant lacks duration-mode or fade fields
- **THEN** the editor SHALL present Custom duration and disabled fades

### Requirement: Screen Effect Editor Uses Percentage Media Volume
The system SHALL present separate-sound and enabled video-soundtrack volume as a percentage from 0% through 200% while persisting normalized gain from 0 through 2.

#### Scenario: Operator amplifies a variant source
- **WHEN** an operator sets either Screen Effect media source to 200%
- **THEN** inline preview and saved playback SHALL use normalized gain 2
- **AND** the editor SHALL restore the value as 200%
