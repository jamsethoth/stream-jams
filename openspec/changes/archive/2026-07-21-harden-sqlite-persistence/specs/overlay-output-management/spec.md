## ADDED Requirements

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
