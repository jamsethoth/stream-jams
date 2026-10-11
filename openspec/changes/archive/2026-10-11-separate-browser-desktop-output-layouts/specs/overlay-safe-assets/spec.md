## MODIFIED Requirements

### Requirement: Invalid Overlay Media Requests Fail Closed

The system SHALL reject overlay media reads when the route key is invalid, revoked, expired, or scoped to a different output.

#### Scenario: Revoked overlay key cannot read media

- **WHEN** an overlay media request uses a revoked route key
- **THEN** the server rejects the request and does not reveal filesystem storage paths

#### Scenario: Missing asset returns safe error

- **WHEN** an authorized overlay requests an asset ID that does not exist
- **THEN** the server returns a not-found response without leaking storage implementation details

#### Scenario: Retired output tries another media endpoint
- **WHEN** a test or unified output key is presented to asset, artwork, font, range-read or composition routes
- **THEN** the request is rejected without returning media bytes, redirects or storage paths
- **AND** presenting that key to an ordinary module path cannot widen its identity

#### Scenario: Ordinary profile retains media access
- **WHEN** an existing ordinary module/profile key requests its authorized media after upgrade
- **THEN** existing scoped asset versions, streaming/range semantics and redaction remain intact
