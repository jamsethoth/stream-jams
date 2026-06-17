# overlay-module-config-persistence Specification

## Purpose
TBD - created by archiving change persist-overlay-module-config. Update Purpose after archive.
## Requirements
### Requirement: Module Config Persists Across Restart
The system SHALL persist overlay module enablement and schema-backed config in SQLite across local app restarts.

#### Scenario: Saved config is read after restart
- **WHEN** a management user saves the Alerts module canvas config and the app is restarted over the same database
- **THEN** the saved enabled state and canvas config are returned by the module config API

### Requirement: Module Config Is Schema Validated
The system SHALL validate overlay module config against the module definition schema before saving it.

#### Scenario: Invalid canvas config is rejected
- **WHEN** a management user submits invalid canvas dimensions
- **THEN** the system rejects the save and does not update persisted config

### Requirement: Missing Module Config Uses Defaults
The system SHALL return module definition defaults when no persisted config exists.

#### Scenario: Fresh database returns default config
- **WHEN** the app starts with a fresh database and management requests Alerts module config
- **THEN** the system returns the enabled default state and canvas config defined by the Alerts module definition

### Requirement: Unknown Config Fields Are Not Treated As Durable
The system SHALL NOT silently depend on unknown module config fields that are not accepted by the module config schema.

#### Scenario: Unknown field is rejected
- **WHEN** a module config request includes fields outside the schema-backed config
- **THEN** the system rejects the save and does not update persisted config

