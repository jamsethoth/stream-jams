## MODIFIED Requirements

### Requirement: Desktop Display Selection Fails Closed
The system SHALL persist enablement, an explicitly selected enumerated display identity, its authoritative display label and opacity from 0 through 1. First use SHALL default disabled with no chosen display and automatic following disabled. The operator MAY separately opt in to following the exact saved display name. The browser SHALL NOT author the trusted label. A missing identity SHALL be replaced only when exactly one current display has a case-sensitive label equal to the saved label; coordinates, primary-display status, enumeration order, partial labels and fuzzy labels SHALL NOT be used.

#### Scenario: Opted-in display returns with a different ID
- **WHEN** a missing selected display opted in and exactly one current display has the exact saved label under a different ID
- **THEN** the replacement ID is persisted before the desktop surface is configured ready
- **AND** only future work uses the replacement

#### Scenario: Display name is absent or ambiguous
- **WHEN** no current display or more than one current display has the exact saved label
- **THEN** the desktop surface remains unavailable with actionable absent-or-ambiguous guidance
- **AND** no fallback display is selected

#### Scenario: Legacy binding lacks a trusted label
- **WHEN** an existing desktop configuration has an ID but no saved display label
- **THEN** it remains valid with automatic following disabled
- **AND** a current display must be selected and saved before consent can be enabled

#### Scenario: Display selection is cleared
- **WHEN** the operator clears the selected display
- **THEN** its ID and label are cleared and automatic following is disabled

#### Scenario: Overlay is disabled
- **WHEN** the operator disables a desktop surface with a valid saved binding
- **THEN** its display ID, label and automatic-follow preference are preserved

#### Scenario: Selected display disconnects
- **WHEN** the selected display disappears during playback
- **THEN** desktop visuals are hidden and affected desktop obligations are settled as unavailable
- **AND** no content moves to another display, no content is replayed, and healthy OBS/audio recipients continue

#### Scenario: Automatic persistence fails
- **WHEN** an exact unique replacement is found but cannot be persisted
- **THEN** the old binding remains authoritative and the replacement is not configured

#### Scenario: Manual save wins a race
- **WHEN** an operator saves another display while automatic enumeration is pending
- **THEN** stale reconciliation does not overwrite the manual selection

#### Scenario: Display geometry changes
- **WHEN** the same selected display changes resolution or scale factor
- **THEN** the window follows that display's bounds and uniformly fits the Landscape canvas without stretching
- **AND** the saved display identity is unchanged

#### Scenario: Imported monitor binding belongs to another machine
- **WHEN** a configuration backup is restored
- **THEN** its layer/opacity settings are retained but desktop output stays disabled until the operator explicitly chooses a current display
