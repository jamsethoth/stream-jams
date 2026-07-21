# overlay-output-management

## Purpose

Define management workflows for browser-source overlay outputs, recoverable route keys, and connected overlay client visibility while keeping overlay authorization separate from management authorization.

## Requirements

### Requirement: Management Can List Overlay Outputs

The system SHALL allow authorized management users to list module-specific and unified overlay outputs for live and test purposes.

#### Scenario: Output list includes module and unified entries

- **WHEN** an authorized management user requests overlay outputs
- **THEN** the system returns available module-specific and unified output records with type, purpose, enabled state, and copyable browser-source URLs when their encrypted route keys are recoverable

#### Scenario: Existing key can be copied after restart

- **WHEN** an authorized management user lists overlay outputs after the app restarts over the same local profile and secret store
- **THEN** active recoverable output keys are decrypted only for the management response and returned as full browser-source URLs

### Requirement: Management Can Create And Regenerate Route Keys

The system SHALL allow authorized management users to create or regenerate unguessable route keys for individual overlay outputs.

#### Scenario: Route key is created

- **WHEN** an authorized management user creates a route key for a module live output
- **THEN** the system stores a protected verifier for authorization, stores the route key encrypted at rest for management recovery, and returns a copyable browser-source URL for that output

#### Scenario: Route key is regenerated

- **WHEN** an authorized management user regenerates a route key for an existing output
- **THEN** every previously active key for the same overlay, scope, module, and purpose no longer authorizes overlay HTTP or WebSocket access, the new key is stored with a protected verifier and encrypted recoverable value, and the new URL is returned

### Requirement: Route Key Secrets Are Recoverable Only Through Management

The system SHALL keep overlay route keys encrypted at rest and expose raw route keys only through management-authenticated URL responses.

#### Scenario: SQLite does not contain raw route keys

- **WHEN** overlay route keys have been created or regenerated
- **THEN** SQLite persistence contains authorization verifiers and encrypted secret references or payloads, but no plaintext `ovl_` route key values

#### Scenario: Recoverable key cannot be decrypted

- **WHEN** a stored overlay output has an active key whose encrypted route key cannot be decrypted
- **THEN** the management response does not expose a guessed or partial URL and indicates that regeneration is required

### Requirement: Management Can Revoke Route Keys

The system SHALL allow authorized management users to revoke overlay route keys without affecting unrelated outputs.

#### Scenario: Route key is revoked

- **WHEN** an authorized management user revokes a unified test output key
- **THEN** requests using that key are rejected and other live/test output keys continue to work

### Requirement: Overlay Clients Are Visible To Management

The system SHALL allow authorized management users to view connected overlay browser-source clients.

#### Scenario: Connected client list is returned

- **WHEN** overlay clients are connected to module and unified WebSocket routes
- **THEN** the management client list shows each connected client with id, output scope, module id when applicable, purpose, connected time, last-seen time, and optional management-only user-agent metadata

### Requirement: Overlay Authorization Remains Separate

The system SHALL keep management APIs protected by management authorization and overlay routes protected only by scoped overlay keys.

#### Scenario: Overlay key cannot access management API

- **WHEN** a request presents a valid overlay route key to a management endpoint
- **THEN** the request is rejected as unauthorized for management access

### Requirement: Overlay Key Verification Is Exact And Deterministic

The system SHALL store a unique protected verifier for each overlay route key and SHALL begin authorization with an exact verifier lookup before applying output scope and revocation checks.

#### Scenario: Exact active key is presented

- **WHEN** an overlay request presents a route key whose verifier matches one active stored row and whose output fields match the route
- **THEN** authorization succeeds for that output only

#### Scenario: Historical revoked key is presented

- **WHEN** an overlay request presents a previously valid verifier whose row is revoked
- **THEN** authorization is rejected
- **AND** unrelated active output keys continue to authorize their own outputs

#### Scenario: Key belongs to another output

- **WHEN** an exact verifier exists but its scope, module, target profile, purpose, or overlay ID differs from the requested output
- **THEN** authorization is rejected with the existing non-secret denial behavior

#### Scenario: Duplicate verifier is persisted

- **WHEN** persistence attempts to store a key hash already used by another overlay key row
- **THEN** SQLite rejects the duplicate
