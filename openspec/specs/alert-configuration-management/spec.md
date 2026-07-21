# alert-configuration-management

## Purpose

Define management UI behavior for configuring alert collections, rules, variants, media, layout, and local test alerts.

## Requirements

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

### Requirement: Alert Rules Are Fully Managed

The system SHALL allow authorized management users to create, edit, enable, disable, and delete alert rules with event type, collection membership, conditions, cooldown, and priority.

#### Scenario: Rule with condition is saved

- **WHEN** a management user creates a cheer rule with a minimum amount condition
- **THEN** the system persists the rule and applies that condition during alert matching

#### Scenario: Minimal normalized condition fields are available

- **WHEN** a management user configures rule conditions
- **THEN** the first release exposes normalized `amount`, `tier`, and `rewardId` condition fields
- **AND** broader provider or actor fields are not required in this change

#### Scenario: Rule delete shows impact before acceptance

- **WHEN** a management user requests deletion of an alert rule
- **THEN** the system shows a confirmation with an impact summary before deletion is accepted
- **AND** the summary explains that deleting the rule also deletes its conditions and variants

### Requirement: Alert Variants Are Fully Managed

The system SHALL allow authorized management users to create, edit, enable, disable, and delete alert variants with text, media assets, layout, duration, weight, and priority.

#### Scenario: Variant with media assets is saved

- **WHEN** a management user selects visual and audio assets for an alert variant
- **THEN** the system persists the asset IDs and overlay playback can render the referenced media through overlay-safe asset URLs

#### Scenario: Asset pickers filter by playback role

- **WHEN** a management user chooses media for an alert variant
- **THEN** the visual picker offers only image, GIF, and video assets
- **AND** the audio picker offers only audio assets
- **AND** the UI presents imported asset metadata instead of requiring manual asset ID or overlay URL entry

#### Scenario: Numeric layout edits show a static preview

- **WHEN** a management user edits layout fields for an alert variant
- **THEN** the system exposes numeric `x`, `y`, `width`, `height`, and `zIndex` controls
- **AND** the UI shows a static preview of the configured placement and sizing
- **AND** the UI does not require an interactive drag-and-drop canvas in this change

#### Scenario: Variant delete shows impact before acceptance

- **WHEN** a management user requests deletion of an alert variant
- **THEN** the system shows a confirmation with an impact summary before deletion is accepted
- **AND** the summary explains that deleting the variant removes only that variant

### Requirement: Alert Test Workflow Uses Real Matching Path

The system SHALL provide a local rule-editor test alert workflow that sends realistic sample events through the same matching, resolution, and playback path used by provider events after sample-event construction.

#### Scenario: Test cheer alert is enqueued

- **WHEN** a management user runs a sample cheer event from a saved rule editor and the event matches an enabled rule
- **THEN** the system resolves matching variants and enqueues playback for connected overlays

#### Scenario: Test alert is distinguished from real provider alert

- **WHEN** a management user runs a test alert
- **THEN** the UI labels the event as local test data
- **AND** the system does not call Twitch or EventSub to create the test event
- **AND** the UI reports success, no-match, cooldown, or error state in the rule editor

### Requirement: TTS Controls Are Deferred

The alert editor SHALL NOT expose provider-specific TTS configuration until the Speaker.bot TTS capability is implemented.

#### Scenario: TTS provider is not available

- **WHEN** the Speaker.bot TTS capability has not landed
- **THEN** alert editing does not present a provider-specific TTS control that cannot be saved and played
