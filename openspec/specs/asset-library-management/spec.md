# asset-library-management Specification

## Purpose
Define global media discovery, metadata, usage-aware mutation, and asset selection within authoring workflows.
## Requirements
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

### Requirement: Asset Event Labels Are Readable
The asset library SHALL display readable event labels while retaining original event values for filtering and API requests.

#### Scenario: Event label contains delimiters
- **WHEN** an asset event value is `channel_point_redemption` or another delimited value
- **THEN** the UI shows a sentence-cased readable label and submits the original value unchanged

### Requirement: Persist Timed-Media Duration
The system SHALL extract and persist nullable duration metadata for accepted audio and video assets without parsing media during a live trigger.

#### Scenario: Import records normalized duration
- **WHEN** an accepted audio or video asset completes validation and transcoding
- **THEN** the system SHALL inspect its normalized bytes and persist a positive duration in milliseconds when available
- **AND** metadata failure SHALL preserve the accepted asset with null duration

#### Scenario: Images remain untimed
- **WHEN** an image or GIF is imported
- **THEN** the system SHALL persist null duration without invoking the timed-media probe

#### Scenario: Replacement changes automatic timing
- **WHEN** an operator replaces an in-use timed asset with the same asset ID
- **THEN** the replacement duration SHALL apply to the next admitted automatic-duration playback
- **AND** an occurrence already in progress SHALL keep its original duration snapshot

#### Scenario: Legacy metadata is repaired through management
- **WHEN** an operator requests details for a selected timed asset whose stored duration is null
- **THEN** the management path SHALL inspect bounded asset bytes and persist the result
- **AND** live trigger handling SHALL NOT read or parse the asset file
