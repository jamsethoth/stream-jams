## MODIFIED Requirements

### Requirement: Audio Route Definitions Are Portable But Device Bindings Are Local
Portable backups SHALL include stable audio-route IDs, names and alert assignments while explicitly excluding device IDs, device-label bindings and automatic-follow consent as local-only data. Restore SHALL require rebinding and validate every saved route reference. Operational rollback SHALL preserve the exact prior bindings and consent.

#### Scenario: Routed alerts are exported
- **WHEN** a configuration backup is exported
- **THEN** it contains route IDs/names and alert output assignments with local device ID and label fields cleared and automatic-follow consent disabled
- **AND** schema-drift checks explicitly account for the local-only fields

#### Scenario: Valid routed configuration is restored
- **WHEN** a compatible backup is restored
- **THEN** route identities and assignments survive unchanged, device bindings are cleared, automatic following is disabled, and management names the routes requiring setup
- **AND** no route falls back to or follows a device until the operator explicitly binds and opts in

#### Scenario: Archive retains local audio consent
- **WHEN** preflight finds an audio device ID, device label or enabled automatic-follow flag in a portable archive
- **THEN** restore is blocked before mutation with an actionable validation error

#### Scenario: Archive contains an orphaned route reference
- **WHEN** preflight finds an alert assignment whose route is absent
- **THEN** restore is blocked before mutation with a correction message

#### Scenario: Restore fails after route replacement
- **WHEN** replacement fails after capturing the destination state
- **THEN** rollback restores prior route definitions, device bindings, consent and alert assignments together

#### Scenario: Local device audio is active during restore
- **WHEN** a restore is requested while device playback is active even without browser clients
- **THEN** the existing live-runtime restore blocker prevents replacement

#### Scenario: Older archive schema is unsupported
- **WHEN** an archive uses a schema version not supported by the current restore implementation
- **THEN** existing compatibility preflight rejects it explicitly rather than silently inventing route data or loosening validation

### Requirement: Portable Desktop Bindings Are Inert
Portable backups SHALL preserve desktop surface layer order and opacity while clearing the machine-local display ID, display label and automatic-follow consent and disabling desktop output. Restore SHALL NOT reactivate automatic display matching on another machine.

#### Scenario: Desktop surface is exported
- **WHEN** a bound opted-in desktop surface is exported
- **THEN** the portable surface is disabled with display ID and label cleared and automatic-follow consent false
- **AND** its layer order and opacity are retained

#### Scenario: Archive retains local desktop consent
- **WHEN** preflight finds a display ID, display label or enabled automatic-follow flag in portable desktop configuration
- **THEN** restore is blocked before mutation with an actionable validation error

#### Scenario: Legacy desktop configuration is restored
- **WHEN** a compatible legacy archive omits display label and automatic-follow fields
- **THEN** they default to null and false while the portable desktop surface remains disabled and unbound
