## ADDED Requirements

### Requirement: Empty Alert Initialization Is Explicit And Non-Destructive
The system SHALL persist new default alerts and first-run starter alerts as disabled, needs-review editor documents with zero text, shape, image, video, audio, or TTS layers and empty Landscape and Vertical layer layouts. Default reset SHALL produce the same empty document. Existing stored alerts SHALL NOT be rewritten, while variations and duplicates SHALL continue copying their source alert design.

#### Scenario: First-run starter alerts are created
- **WHEN** the system creates the first Default alert set
- **THEN** each seeded starter alert has a stored editor document with no layers
- **AND** its Landscape and Vertical layouts contain no layer geometry
- **AND** it remains disabled and needs review

#### Scenario: New default alert is created
- **WHEN** a management user creates a supported default alert
- **THEN** its stored editor document has no layers or profile geometry
- **AND** no starter theme is selected or materialized

#### Scenario: Default alert is reset
- **WHEN** a management user confirms reset of a default alert
- **THEN** its design is replaced by the empty alert document
- **AND** its variations retain their own saved designs

#### Scenario: Existing and copied designs are preserved
- **WHEN** the change is deployed or a management user creates a variation or duplicate
- **THEN** existing stored alert documents are not rewritten
- **AND** the variation or duplicate retains the source alert's layers and profile geometry

## MODIFIED Requirements

### Requirement: Alert Variants Are Fully Managed

The system SHALL allow authorized management users to create, edit, enable, disable, duplicate, reset, and delete alert defaults and variations with layers, global asset references, per-profile layout, duration, conditions, weight, and priority.

#### Scenario: Alert is created from the selected set

- **WHEN** a management user chooses `Add alert` in an expanded alert set and selects a supported canonical event type
- **THEN** the system creates a disabled empty alert for that event type
- **AND** both target profiles and the alert are marked for review
- **AND** the focused editor opens for the new alert without changing which alert set is active
- **AND** creation failure remains visible with a human-readable cause, next step, and reference ID when available

#### Scenario: Variant with media assets is saved

- **WHEN** a management user selects visual and audio assets for an alert variation
- **THEN** the system persists global asset IDs and overlay playback renders them through overlay-safe asset URLs

#### Scenario: Asset pickers filter by layer role

- **WHEN** a management user chooses media for a visual or audio layer
- **THEN** the picker offers only compatible asset types
- **AND** it presents preview and imported metadata instead of requiring manual asset IDs or URLs

#### Scenario: Canvas and numeric edits share one layout

- **WHEN** a management user changes layer geometry on the canvas or in the inspector
- **THEN** both controls update the same `x`, `y`, `width`, `height`, and ordering values for the selected target profile

#### Scenario: Variation delete shows impact before acceptance

- **WHEN** a management user requests deletion of an alert variation
- **THEN** the system shows a confirmation with an impact summary before deletion is accepted
- **AND** the summary explains that only the selected variation and its profile layouts are removed

### Requirement: Event-Grouped Mutations Preserve Existing Semantics And Focus
Event grouping SHALL reuse current empty-default creation, source-copy duplicate and variation, reset, enable/disable, preview, test, and delete behavior and SHALL restore useful keyboard focus after a row is created, duplicated, or deleted.

#### Scenario: Alert is created from an event group
- **WHEN** a user chooses Add alert from an event group and creation succeeds
- **THEN** the empty-alert workflow creates the default for that event
- **AND** the owning group expands and focus moves to the new row

#### Scenario: Alert is created from the global action
- **WHEN** a user chooses the global Add alert action and creation succeeds
- **THEN** Alert Sets refreshes without navigating to the editor
- **AND** the owning group expands and focus moves to the new row

#### Scenario: Default or variation is duplicated
- **WHEN** a user duplicates an alert row
- **THEN** the existing default-versus-variation copy semantics remain unchanged
- **AND** the owning group expands and focus moves to the returned duplicate

#### Scenario: Focused row is deleted
- **WHEN** deletion succeeds for the currently focused row
- **THEN** focus moves to the next sibling, previous sibling, or owning event header in that order
- **AND** existing destructive confirmation and live-impact behavior remain unchanged

## REMOVED Requirements

### Requirement: Alert Creation Selects A Starter Theme Compatibly
**Reason**: New alerts now start empty and the Add alert workflow no longer offers starter-theme selection.
**Migration**: Create the empty alert, then add layers directly or use the existing Copy design from workflow.

### Requirement: Existing Alert Re-theming Preserves Behavior And Resets Visual Review
**Reason**: Focused-editor re-theming is disabled and its management control is removed.
**Migration**: Existing saved alerts remain unchanged; operators can edit layers or copy a design from another alert.

### Requirement: Re-theming Preserves The Primary Message Deterministically
**Reason**: The active editor no longer applies starter themes to existing alerts.
**Migration**: The dormant materializer remains in source, while active authoring uses direct layer edits or Copy design from.

### Requirement: Theme Previews And Review Guidance Are Actionable
**Reason**: Theme chooser and Apply starter theme UI entry points are removed.
**Migration**: No saved data migration is required; existing alerts remain ordinary editable documents.
