## MODIFIED Requirements

### Requirement: Alert Collections Are Fully Managed
The system SHALL allow authorized management users to create, edit, activate, and delete alert collections while preserving exactly one active collection after alert-set initialization.

#### Scenario: Collection is updated
- **WHEN** a management user edits an alert collection name without changing activation
- **THEN** the updated collection is persisted and shown in the alert editor

#### Scenario: Collection delete shows impact before acceptance
- **WHEN** a management user requests deletion of an alert collection
- **THEN** the system shows a confirmation with an impact summary before deletion is accepted
- **AND** the summary explains that deleting the collection removes collection membership links without deleting alert rules or variants

#### Scenario: Sole active collection is disabled without replacement
- **WHEN** a supported mutation attempts to disable the only active collection without selecting another collection
- **THEN** the mutation is rejected
- **AND** the existing active collection remains active

#### Scenario: Another collection is activated
- **WHEN** a management user activates an eligible inactive collection
- **THEN** the prior active collection is disabled and the selected collection is enabled atomically
- **AND** exactly one collection remains active
