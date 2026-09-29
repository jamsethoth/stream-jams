## ADDED Requirements

### Requirement: Reusable Timer Definitions Are Persisted And Validated
The system SHALL let authorized management users create, inspect, edit, and delete reusable timer definitions with a stable opaque ID, non-empty display label, positive duration, optional compatible image/GIF icon asset, optional compatible start and end audio assets, and explicit audio output selection. The system SHALL persist definitions in SQLite and validate asset and route references atomically.

#### Scenario: Management creates a reusable timer
- **WHEN** an authorized user saves a valid `Cat Paws` definition with a five-minute duration, icon, cues, and outputs
- **THEN** the system persists it under a stable ID and returns it in the Timers module inventory
- **AND** editing its label later does not change that ID

#### Scenario: Definition references an incompatible asset
- **WHEN** a save uses an audio asset as the icon or a non-audio asset as a cue
- **THEN** the save is rejected without changing the prior definition

#### Scenario: Active definition deletion is attempted
- **WHEN** a timer definition is running, paused, or holding its completed state
- **THEN** deletion is rejected with an actionable instruction to stop the timer first

### Requirement: Each Definition Owns At Most One Ephemeral Run
The system SHALL allow different timer definitions to run concurrently while allowing at most one active run for each definition. Runtime state SHALL be in memory only and SHALL begin idle after every application start.

#### Scenario: Two definitions start
- **WHEN** the user starts `Cat Paws` and `Hydration`
- **THEN** both definitions have independent active runs
- **AND** neither run delays or replaces the other

#### Scenario: Application restarts with timers active
- **WHEN** Stream Jams restarts after one or more timers were running or paused
- **THEN** every saved definition remains available
- **AND** every definition starts idle without replaying a cue or prior run

### Requirement: Timer Commands Have Deterministic Retry-Safe Semantics
The system SHALL implement start, pause, resume, stop, and restart against a server-authoritative timer generation. Start, pause, resume, and stop SHALL be idempotent for already-satisfied states, while restart SHALL deliberately create a new full-duration generation.

#### Scenario: Start is retried while running
- **WHEN** Start is received more than once for an already running definition
- **THEN** the original generation and deadline remain unchanged
- **AND** the start cue is not replayed

#### Scenario: Running timer is paused and resumed
- **WHEN** Pause freezes a running timer and Resume is later invoked
- **THEN** the frozen positive remainder is preserved while paused
- **AND** Resume creates a new end epoch from that remainder without playing the start cue

#### Scenario: Timer is stopped
- **WHEN** Stop targets a running, paused, or completed-hold timer
- **THEN** its scheduled work and owned cue playback are cancelled and it returns immediately to idle
- **AND** no end cue is emitted

#### Scenario: Timer is restarted
- **WHEN** Restart targets a timer in any state
- **THEN** any prior generation is invalidated and a new full-duration run begins
- **AND** the start cue is emitted once for the new generation

### Requirement: Natural Completion Is Server Authoritative
The server SHALL determine natural completion from the active generation's deadline, emit the end cue once, expose a completed `00:00` state for three seconds, and then return the definition to idle. Stale callbacks and acknowledgements SHALL NOT complete or mutate a replacement generation.

#### Scenario: Running timer reaches zero
- **WHEN** the authoritative deadline for the current generation is reached
- **THEN** the server emits one completed state and one end-cue occurrence
- **AND** the card remains at `00:00` for three seconds before becoming idle

#### Scenario: Old completion fires after restart command
- **WHEN** a scheduler callback belongs to a generation replaced by Restart
- **THEN** it cannot emit an end cue, hide, or otherwise mutate the replacement generation

### Requirement: Overlay Clients Derive Time From Authoritative Snapshots
Running snapshots SHALL include absolute timing and generation identity, paused snapshots SHALL include a frozen remainder, and clients SHALL derive display time without owning the lifecycle. Reconnecting and late clients SHALL receive the current snapshot and join at the correct remainder.

#### Scenario: Browser source reconnects during a run
- **WHEN** a browser source reconnects after a timer has been running for part of its duration
- **THEN** it renders the remainder derived from the current deadline rather than restarting from the saved duration

#### Scenario: Every overlay disconnects
- **WHEN** no browser or desktop visual recipient remains connected
- **THEN** the server continues the timer and completes it at the same authoritative deadline

#### Scenario: Long timer exceeds one platform timeout interval
- **WHEN** a valid duration cannot be represented by one native scheduler delay
- **THEN** the coordinator reschedules bounded waits against the same deadline
- **AND** it does not truncate or extend the timer

### Requirement: Timers Render Through Registered Shared Outputs
The Timers module SHALL produce normalized visual snapshots for module-specific and unified browser outputs and the opt-in desktop overlay. Module enablement and per-surface visibility SHALL suppress visual contribution without stopping timer state or independently selected cue audio.

#### Scenario: One timer appears on browser and desktop
- **WHEN** an active timer is enabled and visible on a connected browser surface and configured desktop surface
- **THEN** both render the same definition snapshot, state, and remaining time

#### Scenario: Timer layer is hidden on one surface
- **WHEN** the Timers layer is hidden on one shared surface
- **THEN** that surface renders no timer cards
- **AND** active timers, other surfaces, and selected cue outputs remain unchanged

### Requirement: Timer Stack Presentation Is Configurable And Deterministic
Each target profile SHALL store one bounded draggable/resizable timer region, vertical or horizontal orientation, and a bounded positive visible maximum. The system SHALL render equal-sized timer boxes inside that region, show a default clock icon when no user icon is configured, left-align and truncate long labels with a single-line ellipsis, right-align the countdown, and use a small `+N more` badge outside the timer-slot count when additional active timers are hidden.

#### Scenario: Running and paused timers share a region
- **WHEN** several timers are active
- **THEN** completed-hold timers appear first at zero, running timers follow by earliest projected finish, and paused timers follow by least frozen remaining time
- **AND** equal values use stable definition identity as a deterministic tie-break

#### Scenario: Horizontal capacity is configured
- **WHEN** a horizontal region has a visible maximum of four and at least four timers are active
- **THEN** up to four actual timer boxes divide the region into consistent equal slots
- **AND** a long label truncates without changing its box dimensions

#### Scenario: Active count exceeds the visible maximum
- **WHEN** six timers are active in a region configured to show four
- **THEN** the four highest-priority timers remain visible
- **AND** a small `+2 more` badge appears without consuming one of the four timer slots

### Requirement: Timer Cues Follow Explicit Audio Outputs
Each timer definition SHALL apply one Browser Source flag and zero or more named local-device routes to both its start and end cues. Cue admission SHALL occur once per applicable run transition before visual profile expansion, and cue failure SHALL NOT block, cancel, or extend timer state.

#### Scenario: Start cue uses browser and device outputs
- **WHEN** a timer starts with Browser Source and two available named routes selected
- **THEN** each selected browser recipient receives its normalized cue and each distinct selected physical device receives one cue
- **AND** visual delivery to multiple profiles does not duplicate physical-device playback

#### Scenario: End cue asset is unavailable
- **WHEN** a timer naturally completes but its end cue cannot be prepared
- **THEN** the timer still enters the three-second completed state and then becomes idle
- **AND** management or Operator receives an actionable cue diagnostic

### Requirement: Management And Operator Expose Appropriate Timer Controls
The Timers management page SHALL author every definition, preview profile presentation, manage automation setup, and expose full state-aware controls. Operator SHALL show only running, paused, or completed-hold timers with compact pause/resume, stop, and restart controls in authoritative display order.

#### Scenario: Idle timer is visible in management
- **WHEN** a saved definition is idle
- **THEN** the Timers page shows Start and Edit for that definition
- **AND** Operator does not show it

#### Scenario: Paused timer is controlled from Operator
- **WHEN** a keyboard user resumes a paused timer from Operator
- **THEN** focus remains predictable and the resulting state is announced semantically
- **AND** the same resumed state appears in management and overlay snapshots

#### Scenario: Active definition is edited
- **WHEN** management saves changes to a definition with an active run
- **THEN** the current run retains its admitted label, duration, assets, and outputs
- **AND** the next run uses the saved changes

### Requirement: Timer Failures Are Bounded And Fail Closed
Invalid timer presentation, missing assets, disconnected outputs, and cue failures SHALL be isolated to the affected element or recipient. Production overlays SHALL remain transparent without debug text, while management, Operator, and logs SHALL expose redacted actionable diagnostics.

#### Scenario: Icon asset is missing
- **WHEN** an active timer's saved icon cannot be resolved
- **THEN** its label and countdown remain visible without an icon
- **AND** a management diagnostic identifies the affected timer without exposing a filesystem path

#### Scenario: Region configuration is invalid
- **WHEN** management submits out-of-bounds geometry, orientation, or visible capacity
- **THEN** the save is rejected atomically and the prior configuration remains authoritative
