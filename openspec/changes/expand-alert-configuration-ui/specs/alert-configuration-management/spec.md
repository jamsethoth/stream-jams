## ADDED Requirements

### Requirement: Alert Collections Are Fully Managed
The system SHALL allow authorized management users to create, edit, enable, disable, and delete alert collections.

#### Scenario: Collection is updated
- **WHEN** a management user edits an alert collection name and enabled state
- **THEN** the updated collection is persisted and shown in the alert editor

### Requirement: Alert Rules Are Fully Managed
The system SHALL allow authorized management users to create, edit, enable, disable, and delete alert rules with event type, collection membership, conditions, cooldown, and priority.

#### Scenario: Rule with condition is saved
- **WHEN** a management user creates a cheer rule with a minimum amount condition
- **THEN** the system persists the rule and applies that condition during alert matching

### Requirement: Alert Variants Are Fully Managed
The system SHALL allow authorized management users to create, edit, enable, disable, and delete alert variants with text, media assets, layout, duration, weight, and priority.

#### Scenario: Variant with media assets is saved
- **WHEN** a management user selects visual and audio assets for an alert variant
- **THEN** the system persists the asset IDs and overlay playback can render the referenced media through overlay-safe asset URLs

### Requirement: Alert Test Workflow Uses Real Matching Path
The system SHALL provide a local test alert workflow that sends realistic sample events through the same matching, resolution, and playback path used by provider events.

#### Scenario: Test cheer alert is enqueued
- **WHEN** a management user runs a sample cheer event that matches an enabled rule
- **THEN** the system resolves matching variants and enqueues playback for connected overlays

### Requirement: TTS Controls Are Deferred
The alert editor SHALL NOT expose provider-specific TTS configuration until the Speaker.bot TTS capability is implemented.

#### Scenario: TTS provider is not available
- **WHEN** the Speaker.bot TTS capability has not landed
- **THEN** alert editing does not present a provider-specific TTS control that cannot be saved and played
