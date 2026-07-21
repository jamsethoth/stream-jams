## ADDED Requirements

### Requirement: Alert Lists Use Canonical Event-Type Disclosures
Alert Sets and focused-editor navigation SHALL organize alert rows into collapsible canonical event-type groups, SHALL retain multiple defaults per event, and SHALL nest each variation beneath its owning default without creating persisted event-group records.

#### Scenario: Event contains multiple defaults and variations
- **WHEN** an alert set contains multiple default rules for one event and those defaults own variations
- **THEN** one event disclosure contains every default
- **AND** each variation appears beneath only its owning default
- **AND** rule and variation IDs remain the editor route identities

#### Scenario: Canonical event has no alert
- **WHEN** the canonical event catalog contains an event type with no stored default
- **THEN** its collapsed event group remains available with zero counts
- **AND** it offers an Add alert action preselected to that event type

#### Scenario: Stored event is unknown to the catalog
- **WHEN** stored alert rows contain an event type absent from the current canonical catalog
- **THEN** those rows remain visible under an `Other` catalog group
- **AND** no default or variation is deleted or hidden because its event is unknown

### Requirement: Event Headers Summarize Existing Alert State
Each event header SHALL derive default, variation, enabled, and highest validation-status summaries from the current inventory rows and validation issues and SHALL NOT introduce event-level runtime enablement.

#### Scenario: Event group is collapsed
- **WHEN** a non-empty event group is collapsed
- **THEN** its header shows default and variation counts, enabled count, and highest blocker, warning, review-required, or valid state
- **AND** full issue details remain available from the affected alert editor

#### Scenario: Conditional variation summary is shown
- **WHEN** a variation has condition, priority-group, or relative-chance context
- **THEN** its row uses the structured summaries supplied by variation authoring
- **AND** this grouping capability does not calculate a second matching or probability result

#### Scenario: User looks for event enablement
- **WHEN** an event group header is rendered
- **THEN** it exposes no event-level enable or disable control
- **AND** each default and variation retains its existing individual enabled state and action

### Requirement: Group Search And Filters Preserve Ownership Context
Search and filters SHALL operate over complete event groups, SHALL preserve the owning default when a variation matches, and SHALL force matching groups open without overwriting manual disclosure state.

#### Scenario: Variation alone matches search
- **WHEN** a search term matches one variation but not its default name
- **THEN** the result shows that variation beneath its owning default context
- **AND** unrelated siblings may remain filtered out

#### Scenario: Filters are cleared
- **WHEN** active search or filters temporarily force matching groups open and the user clears them
- **THEN** the user's prior manual expanded/collapsed state is restored

#### Scenario: Nothing matches
- **WHEN** no event or alert row matches active search and filters
- **THEN** the surface names that no alerts match
- **AND** it offers a Clear filters action without replacing the loaded set

### Requirement: Event-Grouped Mutations Preserve Existing Semantics And Focus
Event grouping SHALL reuse current create, duplicate, reset, enable/disable, preview, test, and delete behavior and SHALL restore useful keyboard focus after a row is created, duplicated, or deleted.

#### Scenario: Alert is created from an event group
- **WHEN** a user chooses Add alert from an event group and creation succeeds
- **THEN** the existing starter-template workflow creates the default for that event
- **AND** the owning group expands and focus moves to the new row

#### Scenario: Default or variation is duplicated
- **WHEN** a user duplicates an alert row
- **THEN** the existing default-versus-variation copy semantics remain unchanged
- **AND** the owning group expands and focus moves to the returned duplicate

#### Scenario: Focused row is deleted
- **WHEN** deletion succeeds for the currently focused row
- **THEN** focus moves to the next sibling, previous sibling, or owning event header in that order
- **AND** existing destructive confirmation and live-impact behavior remain unchanged

### Requirement: Event Disclosures Use Supported Accessible Layouts
Event disclosures SHALL use native keyboard-operable controls and ordinary semantic row content, SHALL retain usable Alert Sets actions at its narrow breakpoint, and SHALL preserve the focused editor's larger-screen requirement.

#### Scenario: Keyboard user toggles an event
- **WHEN** keyboard focus is on an event disclosure and the user presses Enter or Space
- **THEN** the event content expands or collapses
- **AND** Tab reaches only currently visible row actions
- **AND** no custom tree or treegrid keyboard model is required

#### Scenario: Alert Sets uses a narrow viewport
- **WHEN** Alert Sets crosses its existing narrow-layout breakpoint
- **THEN** grouped alert rows stack their identity, status, profiles, summaries, and actions without horizontal page scrolling

#### Scenario: Focused editor viewport is unsupported
- **WHEN** the focused editor is opened below its supported workspace width
- **THEN** the existing larger-screen requirement remains visible and actionable
- **AND** this change does not compress the canvas or add a mobile editor drawer

### Requirement: Event Group Data States Remain Actionable
Grouped alert surfaces SHALL preserve explicit loading, request-error, empty-set, and empty-event states using existing management feedback patterns.

#### Scenario: Set detail fails to load
- **WHEN** the grouped inventory or editor navigation cannot load set detail
- **THEN** the existing actionable error presentation provides cause, next step, retry, and reference ID when available

#### Scenario: Set has no stored alerts
- **WHEN** a valid alert set contains no stored alert rows
- **THEN** canonical event groups remain available for creation
- **AND** the surface does not present the set as an unrecoverable empty state
