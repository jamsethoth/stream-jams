## ADDED Requirements

### Requirement: Operator Merges Views Without Merging Schedulers
The separate `/operator` surface SHALL project all registered queue owners into merged current, pending and recent views. Current rows SHALL include every active module occurrence; pending rows SHALL sort by enqueue timestamp and stable sequence; recent rows SHALL sort by completion timestamp and stable sequence. Every row SHALL identify its owning module and occurrence, and pending rows SHALL expose their actual module queue position.

#### Scenario: Two modules are active
- **WHEN** an Alert and a Screen Effect are playing simultaneously
- **THEN** both appear under Now playing with independent progress/status
- **AND** neither is hidden behind a single global-current field

#### Scenario: Pending priority differs from chronological order
- **WHEN** an effect with higher priority was enqueued later than another effect or alert
- **THEN** the merged list retains its documented chronological display order and shows each module's actual queue position
- **AND** the UI does not imply one global playback sequence

#### Scenario: One module snapshot cannot refresh
- **WHEN** a refresh fails after state was previously shown
- **THEN** last-known data remains marked stale with the affected scope and actionable failure
- **AND** stale rows are not represented as confirmed current playback

### Requirement: Commands Target The Owning Module And Occurrence
Skip, remove and replay SHALL validate module and occurrence identity. Clear-pending SHALL target an explicitly identified module, and queue pause SHALL support that module independently. Stale or mismatched commands SHALL fail without mutating replacement or unrelated work.

#### Scenario: Skip races completion
- **WHEN** a requested occurrence has already completed and its module has started another item
- **THEN** the stale skip returns a conflict and refreshed state
- **AND** the new item and the other module remain unchanged

#### Scenario: One pending item is removed
- **WHEN** an operator removes a known pending effect occurrence
- **THEN** only that effect queue entry is removed and remaining positions update
- **AND** active Alerts/Screen Effects continue

#### Scenario: Module queue is cleared
- **WHEN** an operator confirms Clear pending with the module name and affected count
- **THEN** only that module's pending work is cleared
- **AND** active work and other module queues are retained

#### Scenario: Replay item belongs to another module
- **WHEN** a replay command supplies a module that does not own the identified recent item
- **THEN** it fails without re-enqueueing anything

### Requirement: Global Safety Is Authoritative Across Queue Owners
Global pause, mute and DND SHALL be one durable safety state shared by every queue owner and desktop/tray/browser/device consumer. Per-module pause SHALL persist separately. Effective advancement hold SHALL include global pause, module pause and existing DND behavior; resuming global pause SHALL NOT clear module pauses.

#### Scenario: Global pause is enabled
- **WHEN** an operator pauses all queues while both modules are active
- **THEN** current items can finish and no held module starts its next item
- **AND** management, Operator and tray report the same authoritative safety state

#### Scenario: Global pause is resumed with one module paused
- **WHEN** global pause is cleared while Screen Effects remains module-paused
- **THEN** eligible Alerts may advance and Screen Effects remains held

#### Scenario: DND is enabled
- **WHEN** the operator enables DND
- **THEN** the existing queue-advancement hold applies to both modules without silently discarding admitted items
- **AND** existing Alerts intake semantics remain intact

#### Scenario: Safety persistence fails
- **WHEN** a global safety update cannot persist
- **THEN** no queue, tray or recipient applies a contradictory successful state
- **AND** an actionable failure is returned

#### Scenario: Safety state is restored
- **WHEN** the application restarts
- **THEN** global and module safety state is applied before any new playback starts
- **AND** no prior active/pending/recent occurrence is replayed

### Requirement: Concurrent Media Ownership Is Occurrence Scoped
Browser, desktop and local-device work SHALL carry globally unique occurrence identity and owning module. Normal stop/completion SHALL affect only that occurrence. Surface visual membership SHALL NOT determine independent Browser Source or device audio membership.

#### Scenario: Effect is skipped while an alert is audible
- **WHEN** the effect's normal stop succeeds
- **THEN** its audio and visuals stop before the next effect starts
- **AND** the active alert's healthy device/browser audio and visuals continue

#### Scenario: Visual module layer is hidden
- **WHEN** an effect is hidden on a unified browser surface while its Browser Source audio remains selected
- **THEN** its selected audio can continue through that recipient without a visible effect layer

#### Scenario: Shared audio renderer must be destroyed
- **WHEN** a stop is not acknowledged within 2 seconds and the shared player is destroyed to guarantee silence
- **THEN** every affected module's audio obligations are explicitly failed and settled
- **AND** healthy visual recipients continue according to their own bounds without falsely reporting isolated audio failure

#### Scenario: Old completion arrives after player recreation
- **WHEN** an acknowledgement belongs to an older host generation or expired occurrence
- **THEN** it cannot mutate a current occurrence in any module

### Requirement: Merged Operations Retain Security And Accessibility
Merged snapshots and commands SHALL use existing local management authorization, CSRF/origin controls for mutations, rate limits and allowlisted summaries. The Operator surface SHALL remain separate from configuration and provide stable focus, accessible module-qualified actions and semantic status announcements.

#### Scenario: Overlay credential attempts an operator command
- **WHEN** a request presents only an overlay credential
- **THEN** the command is rejected before reading or changing management playback state

#### Scenario: Keyboard operator skips one module
- **WHEN** the user activates a module-qualified skip button by keyboard
- **THEN** focus remains predictable and the module-qualified success or failure is announced
- **AND** no editor or route configuration is required inside Operator
