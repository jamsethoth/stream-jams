## ADDED Requirements

### Requirement: Home Prioritizes Corrective Work

The system SHALL present actionable problems and incomplete setup before routine or completed setup content, while preserving access to all completed readiness data.

#### Scenario: Home has blocked or incomplete setup

- **WHEN** Home has actionable problems or incomplete setup rows
- **THEN** problems appear before setup content and incomplete rows remain in their existing order
- **AND** the first incomplete row is identified as the next action
- **AND** completed rows appear once in an initially collapsed native disclosure labelled with their count

#### Scenario: Home setup is complete

- **WHEN** every setup row is complete
- **THEN** Home shows a concise readiness summary and active alert-set information
- **AND** completed rows remain available in a keyboard-operable native disclosure
- **AND** toggling that disclosure performs no configuration write

#### Scenario: Home cannot establish readiness

- **WHEN** readiness data is empty, unavailable, or has no active alert set
- **THEN** Home retains actionable copy and the existing correction or retry path
- **AND** it does not duplicate full errors into a second summary
