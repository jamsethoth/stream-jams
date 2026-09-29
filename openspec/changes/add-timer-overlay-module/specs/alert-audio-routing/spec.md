## ADDED Requirements

### Requirement: Timer Cues Reuse Named Audio Routes
Reusable named audio routes SHALL be selectable for timer start and end cues through one timer-wide Browser Source flag and route-ID set. Route validation, physical-device deduplication, unavailability behavior, rebinding snapshots, and deletion impact SHALL apply to Timers as they do to other explicit local media owners.

#### Scenario: Timer selects duplicate physical destinations
- **WHEN** two selected named routes resolve to the same explicit physical device for a timer cue
- **THEN** that cue plays once on the device rather than doubling its sound

#### Scenario: Referenced route deletion is attempted
- **WHEN** a named route is referenced by one or more timer definitions
- **THEN** deletion is rejected with module-qualified affected timer names
- **AND** concurrent timer saves cannot create a dangling route reference during deletion

#### Scenario: Route is rebound during an active timer
- **WHEN** a user confirms rebinding a selected route while a timer run is active
- **THEN** the active run retains its admitted binding for any already-admitted cue work
- **AND** future timer starts use the replacement binding

#### Scenario: Selected timer route is unavailable
- **WHEN** a timer transition emits a cue to an unavailable named route
- **THEN** that destination fails closed without falling back to another device or Browser Source
- **AND** timer progression and healthy recipients continue
