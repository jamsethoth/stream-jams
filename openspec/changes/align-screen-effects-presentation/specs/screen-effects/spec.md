## ADDED Requirements

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

## MODIFIED Requirements

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
