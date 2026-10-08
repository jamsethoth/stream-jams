## ADDED Requirements

### Requirement: Template backup
Versioned backups SHALL include saved user templates with their slots and asset references. Bundled starters SHALL NOT be exported.

#### Scenario: Templates round trip
- **WHEN** a profile with two saved templates is exported and restored
- **THEN** both templates are available with their slots
