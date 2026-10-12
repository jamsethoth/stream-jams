## MODIFIED Requirements

### Requirement: Concurrent Media Ownership Is Occurrence Scoped
Browser, desktop and local-device work SHALL carry globally unique occurrence identity and owning module. Normal stop/completion SHALL affect only that occurrence. Surface visual membership SHALL NOT determine independent Browser Source or device audio membership.

#### Scenario: Effect is skipped while an alert is audible
- **WHEN** the effect's normal stop succeeds
- **THEN** its audio and visuals stop before the next effect starts
- **AND** the active alert's healthy device/browser audio and visuals continue

#### Scenario: Visual module layer is hidden
- **WHEN** an effect is hidden on the desktop surface while its ordinary Browser Source audio remains selected
- **THEN** its selected audio can continue through that recipient without a visible effect layer

#### Scenario: Shared audio renderer must be destroyed
- **WHEN** a stop is not acknowledged within 2 seconds and the shared player is destroyed to guarantee silence
- **THEN** every affected module's audio obligations are explicitly failed and settled
- **AND** healthy visual recipients continue according to their own bounds without falsely reporting isolated audio failure

#### Scenario: Old completion arrives after player recreation
- **WHEN** an acknowledgement belongs to an older host generation or expired occurrence
- **THEN** it cannot mutate a current occurrence in any module
