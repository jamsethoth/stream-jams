## ADDED Requirements

### Requirement: Screen Effect Variants Support Media-Synchronized Duration
The system SHALL let each Screen Effect variant use `media` or `custom` duration mode, default a newly created variant to `media`, and treat an absent persisted mode as `custom`.

#### Scenario: Longest variant media wins
- **WHEN** a Media-mode variant selects a video visual and a separate sound
- **THEN** its effective duration SHALL equal the longest positive stored duration up to 120000 milliseconds

#### Scenario: Variant media duration is unavailable
- **WHEN** no eligible selected asset has positive stored duration
- **THEN** the variant SHALL use 10000 milliseconds
- **AND** the editor SHALL show a fallback warning

#### Scenario: Variant is copied
- **WHEN** an operator copies a variant
- **THEN** its selected duration mode, custom duration, and requested fades SHALL be preserved

### Requirement: Screen Effect Editor Authors Audio Fades
The system SHALL expose independent Fade in and Fade out controls for a variant's separate sound and enabled video soundtrack.

#### Scenario: Draft preview uses timing and fades
- **WHEN** an operator previews an unsaved variant
- **THEN** the inline preview SHALL use its resolved effective duration and requested envelopes
- **AND** its local mute control SHALL remain independent

#### Scenario: Existing variant is opened
- **WHEN** a stored variant lacks duration-mode or fade fields
- **THEN** the editor SHALL present Custom duration and disabled fades
