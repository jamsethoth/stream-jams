## MODIFIED Requirements

### Requirement: Management Can List Overlay Outputs

The system SHALL allow authorized management users to list ordinary module-specific browser outputs only. Alerts, Music and Timers SHALL retain landscape and vertical variants. Videos and Screen Effects SHALL retain their existing ordinary module output without invented orientation variants. Output records SHALL provide enabled/readiness state, exact browser canvas dimensions and copyable URLs when encrypted route keys are recoverable. Public test and unified records SHALL NOT be returned.

#### Scenario: Output list includes only ordinary module entries
- **WHEN** an authorized management user requests overlay outputs
- **THEN** the response includes only remaining module outputs with profile and canvas dimensions
- **AND** module UI shows width/height and source setup guidance without test or unified choices

#### Scenario: Existing key can be copied after restart
- **WHEN** an authorized management user lists overlay outputs after the app restarts over the same local profile and secret store
- **THEN** active recoverable ordinary output keys are decrypted only for the management response and returned as full browser-source URLs

### Requirement: Management Can Revoke Route Keys

The system SHALL allow authorized management users to revoke ordinary module route keys without affecting unrelated outputs.

#### Scenario: Route key is revoked
- **WHEN** an authorized management user revokes a module profile output key
- **THEN** requests using that key are rejected and other module/profile output keys continue to work

### Requirement: Overlay Clients Are Visible To Management

The system SHALL allow authorized management users to view current and recent ordinary module browser-source client state by output and target profile.

#### Scenario: Connected client list is returned
- **WHEN** ordinary module overlay clients are connected
- **THEN** the management client list shows each client's id, module id, target profile when applicable, connected time, last-seen time and optional management-only user-agent metadata
- **AND** it does not expose active test or unified output choices

#### Scenario: Recently disconnected output reports last connection
- **WHEN** an output has no current client but has prior connection metadata
- **THEN** management reports `Disconnected` and the last connected time without exposing route-key secrets

## ADDED Requirements

### Requirement: Removed browser outputs fail closed

The system SHALL reject public test and unified output creation/regeneration and HTTP, media, composition and WebSocket access. Persisted removed-output keys SHALL be deactivated without authorizing ordinary module outputs. Existing ordinary keys SHALL retain their module/profile scopes. Management preview/test commands SHALL remain available through the intended ordinary-output delivery path without changing internal queue semantics or duplicating playback.

#### Scenario: Existing test or unified source reconnects
- **WHEN** a removed source uses its previous route key for shell, media or WebSocket access
- **THEN** access is rejected and no ordinary output content is delivered

#### Scenario: Existing ordinary source reconnects
- **WHEN** a remaining ordinary source uses its existing valid module/profile key
- **THEN** it continues to authenticate for that output and cannot authenticate for another profile or management API

#### Scenario: Management test action remains usable
- **WHEN** the operator invokes an existing supported management test action
- **THEN** the intended remaining output receives the test without requiring a public test source
- **AND** existing queue ownership, preview isolation and single-playback/audio guarantees are preserved
