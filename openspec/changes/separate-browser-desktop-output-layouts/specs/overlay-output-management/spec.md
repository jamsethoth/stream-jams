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

### Requirement: Browser-Source Setup Shows Required Profile Dimensions
The management UI SHALL show the authoritative saved browser canvas width and height for each module/profile with concise manual OBS setup guidance. Alerts and Screen Effects SHALL retain full-scene dimensions; Music, Timers and Videos SHALL show their stable content envelope dimensions. Horizontal/vertical profile labels SHALL not imply full-screen aspect ratio for content outputs. Readiness SHALL remain URL availability, separate from connection state or current content visibility.

#### Scenario: Landscape Alerts source is ready
- **WHEN** a user expands the Alerts Landscape source row
- **THEN** it shows `1920 x 1080` and browser-source setup guidance

#### Scenario: Vertical Alerts source is ready
- **WHEN** a user expands the Alerts Vertical source row
- **THEN** it shows `1080 x 1920` and browser-source setup guidance

#### Scenario: Content module is idle
- **WHEN** a user expands a Music, Timers or Videos source row while no content is visible
- **THEN** it still shows exact configured content dimensions using the same geometry helper as its renderer

#### Scenario: Saved content size changes
- **WHEN** a saved appearance change alters the declared browser envelope
- **THEN** management updates the dimensions and shows persistent setup guidance to update OBS width/height
- **AND** it does not claim OBS was automatically resized or regenerate the source key

## ADDED Requirements

### Requirement: Removed browser outputs fail closed

The system SHALL reject public test and unified output creation/regeneration and HTTP, media, artwork, composition and WebSocket access. Persisted removed-output keys SHALL be deactivated without authorizing ordinary module outputs. Existing ordinary keys SHALL retain their exact module/profile scopes. Alerts and Screen Effects live-impact test commands SHALL retain their existing ordinary-recipient paths. Music and Timer editor previews SHALL remain isolated. Video test playback SHALL NOT be implicitly remapped into an ordinary-output recipient; the video-request-queue preview contract governs its destination.

#### Scenario: Existing test or unified source reconnects
- **WHEN** a removed source uses its previous route key for shell, media or WebSocket access
- **THEN** access is rejected and no ordinary output content is delivered

#### Scenario: Existing ordinary source reconnects
- **WHEN** a remaining ordinary source uses its existing valid module/profile key
- **THEN** it continues to authenticate for that output and cannot authenticate for another profile or management API

#### Scenario: Management live-impact test remains usable
- **WHEN** the operator confirms an Alerts or Screen Effects test using its existing recipient preflight
- **THEN** the intended ordinary output receives the test without requiring a public test source
- **AND** existing queue ownership, independent device recipients and single-playback/audio guarantees are preserved

#### Scenario: Music fixture is not broadcast
- **WHEN** a Music editor preview shows its sample track
- **THEN** ordinary output still uses authoritative provider state and no fixture is broadcast

#### Scenario: Legacy profileless source is preserved without widening scope
- **WHEN** a pre-upgrade ordinary profileless source reconnects
- **THEN** its existing identity remains a hidden compatibility output with existing profileless behavior
- **AND** it is not reinterpreted as a profile-scoped key or offered as a new source choice

#### Scenario: Removed output is requested through another API
- **WHEN** a client attempts a test or unified key creation or surface update through management APIs
- **THEN** the request is rejected before secret or persistent surface creation
