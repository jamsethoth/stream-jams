## ADDED Requirements

### Requirement: Audio Route Definitions Are Portable But Device Bindings Are Local
Portable backups SHALL include stable audio-route IDs, names and alert assignments while explicitly excluding device IDs and device-label bindings as local-only data. Restore SHALL require rebinding and validate every saved route reference. Operational rollback SHALL preserve the exact prior bindings.

#### Scenario: Routed alerts are exported
- **WHEN** a configuration backup is exported
- **THEN** it contains route IDs/names and alert output assignments with local device binding fields cleared
- **AND** schema-drift checks explicitly account for the local-only fields

#### Scenario: Valid routed configuration is restored
- **WHEN** a compatible backup is restored
- **THEN** route identities and assignments survive unchanged, device bindings are cleared, and management names the routes requiring setup
- **AND** no route falls back to the default audio device

#### Scenario: Archive contains an orphaned route reference
- **WHEN** preflight finds an alert assignment whose route is absent
- **THEN** restore is blocked before mutation with a correction message

#### Scenario: Restore fails after route replacement
- **WHEN** replacement fails after capturing the destination state
- **THEN** rollback restores prior route definitions, device bindings, and alert assignments together

#### Scenario: Local device audio is active during restore
- **WHEN** a restore is requested while device playback is active even without browser clients
- **THEN** the existing live-runtime restore blocker prevents replacement

#### Scenario: Older archive schema is unsupported
- **WHEN** an archive uses a schema version not supported by the current restore implementation
- **THEN** existing compatibility preflight rejects it explicitly rather than silently inventing route data or loosening validation
