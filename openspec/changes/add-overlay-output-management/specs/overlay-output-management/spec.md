## ADDED Requirements

### Requirement: Management Can List Overlay Outputs
The system SHALL allow authorized management users to list module-specific and unified overlay outputs for live and test purposes.

#### Scenario: Output list includes module and unified entries
- **WHEN** an authorized management user requests overlay outputs
- **THEN** the system returns available module-specific and unified output records with type, purpose, enabled state, and copyable URL status

### Requirement: Management Can Create And Regenerate Route Keys
The system SHALL allow authorized management users to create or regenerate unguessable route keys for individual overlay outputs.

#### Scenario: Route key is created
- **WHEN** an authorized management user creates a route key for a module live output
- **THEN** the system stores only a protected verifier for the key and returns a copyable browser-source URL for that output

#### Scenario: Route key is regenerated
- **WHEN** an authorized management user regenerates a route key for an existing output
- **THEN** the old key no longer authorizes overlay HTTP or WebSocket access and the new URL is returned

### Requirement: Management Can Revoke Route Keys
The system SHALL allow authorized management users to revoke overlay route keys without affecting unrelated outputs.

#### Scenario: Route key is revoked
- **WHEN** an authorized management user revokes a unified test output key
- **THEN** requests using that key are rejected and other live/test output keys continue to work

### Requirement: Overlay Clients Are Visible To Management
The system SHALL allow authorized management users to view connected overlay browser-source clients.

#### Scenario: Connected client list is returned
- **WHEN** overlay clients are connected to module and unified WebSocket routes
- **THEN** the management client list shows each connected client with its output type, purpose, and connection metadata

### Requirement: Overlay Authorization Remains Separate
The system SHALL keep management APIs protected by management authorization and overlay routes protected only by scoped overlay keys.

#### Scenario: Overlay key cannot access management API
- **WHEN** a request presents a valid overlay route key to a management endpoint
- **THEN** the request is rejected as unauthorized for management access
