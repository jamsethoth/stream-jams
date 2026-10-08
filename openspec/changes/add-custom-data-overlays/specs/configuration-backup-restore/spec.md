## ADDED Requirements

### Requirement: Data overlay backup
Versioned backups SHALL include values with their current content and reset defaults, goals with baselines, reset groups, Operator pins, canvases and asset references. Backups SHALL exclude runtime IDs and connection status.

#### Scenario: Round trip
- **WHEN** a profile with a goal shown on two canvases is exported and restored
- **THEN** the goal, its baseline, its value's content and both canvases' references are preserved

### Requirement: Data overlay restore safety
Restore SHALL validate every data overlay reference before mutation and apply all data overlay sections in one transaction under the existing maintenance guard. Restored canvases SHALL start disabled until reviewed. A failed restore SHALL leave the existing profile unchanged.

#### Scenario: Invalid reference
- **WHEN** a backup contains a canvas element bound to a missing value
- **THEN** restore fails and the existing profile is unchanged

#### Scenario: Canvases start disabled
- **WHEN** a valid backup with an enabled canvas is restored
- **THEN** the canvas is present but disabled until the user enables it
