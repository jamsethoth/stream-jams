## ADDED Requirements

### Requirement: Assets Are Searchable Reviewable Global Resources

The system SHALL provide a global asset library with preview, metadata, file health, usage links, search, and filters for type, usage, status, module/set/event linkage, and tags.

#### Scenario: User filters assets by tags and usage

- **WHEN** a user selects multiple tags and the unused filter
- **THEN** the system returns unused assets containing every selected tag
- **AND** tag matching is case-insensitive, trimmed, and de-duplicated

#### Scenario: Usage link opens owning alert context

- **WHEN** a user activates an asset usage link
- **THEN** the system opens the alert editor with set, event, alert, and target-profile context selected

### Requirement: Alert Editing Can Select Or Register Assets In Context

The system SHALL provide an alert-editor asset picker that can search and select compatible existing assets or validate and register a new global asset without leaving the editor flow.

#### Scenario: Compatible existing asset is selected

- **WHEN** a user opens a picker for an image layer
- **THEN** the picker offers compatible visual assets with previews, tags, and usage counts
- **AND** selection stores the global asset ID on that layer

#### Scenario: Invalid inline upload remains in context

- **WHEN** an inline upload has an unsupported type or exceeds the allowed size
- **THEN** registration does not complete
- **AND** the picker shows allowed types, size limits, and a corrective next step

### Requirement: Global Asset Changes Report Usage Impact

The system SHALL keep asset references by stable asset ID and SHALL show affected usages before replacing or deleting an in-use asset.

#### Scenario: In-use asset is replaced

- **WHEN** a user confirms replacement after reviewing affected usages
- **THEN** the system keeps the asset ID, updates derived metadata and preview, and reports compatibility warnings
- **AND** every compatible reference resolves to the replacement file

#### Scenario: In-use asset deletion is guarded

- **WHEN** a user requests deletion of an asset with active references
- **THEN** the system blocks deletion or requires explicit reassignment through the approved destructive-confirmation pattern

#### Scenario: Unused asset is not automatically deleted

- **WHEN** an asset has no current usages
- **THEN** the system retains it until a user confirms deletion
