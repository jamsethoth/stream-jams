## MODIFIED Requirements

### Requirement: Assets Are Searchable Reviewable Global Resources
The system SHALL provide a global asset library with preview, metadata, file health, usage links, search, and filters for type, usage, status, module/set/event linkage, and tags. Search and Type SHALL remain visible on every supported viewport. Usage, Health, Module, Set, Event, and tags SHALL appear in an initially collapsed More filters disclosure that retains values when closed, reports each active non-default field and selected tag in its active count, and exposes the existing clear-filter behavior.

#### Scenario: User filters assets by tags and usage
- **WHEN** a user selects multiple tags and the unused filter
- **THEN** the system returns unused assets containing every selected tag
- **AND** tag matching is case-insensitive, trimmed, and de-duplicated
- **AND** the More filters count includes Usage once and each selected tag once
- **AND** closing and reopening the disclosure preserves the selected values and results

#### Scenario: Secondary filters are collapsed
- **WHEN** the asset library first renders on desktop or mobile
- **THEN** Search and Type remain visible
- **AND** Usage, Health, Module, Set, Event, and tags are hidden behind the collapsed More filters control
- **AND** hidden controls are not keyboard reachable

#### Scenario: Hidden secondary filters are active
- **WHEN** one or more secondary filters have non-default values while the disclosure is closed
- **THEN** the More filters control reports the active secondary-filter count
- **AND** each non-default Usage, Health, Module, Set, or Event field counts once
- **AND** each selected tag counts once
- **AND** Search and Type do not contribute to the count

#### Scenario: Secondary filters are cleared
- **WHEN** the user activates Clear filters
- **THEN** existing reset semantics restore secondary fields and tags to defaults
- **AND** the results and active secondary-filter count update accordingly

#### Scenario: Usage link opens owning alert context
- **WHEN** a user activates an asset usage link
- **THEN** the system opens the alert editor with set, event, alert, and target-profile context selected
