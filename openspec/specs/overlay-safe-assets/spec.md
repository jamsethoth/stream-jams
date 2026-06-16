# overlay-safe-assets

## Purpose

Define overlay-scoped media asset reads while keeping management asset operations protected.

## Requirements

### Requirement: Overlay Media Reads Are Authorized Separately From Management

The system SHALL allow browser-source overlays to read media assets through overlay-scoped authorization and SHALL NOT require a management session for overlay media playback.

#### Scenario: Valid overlay key loads media

- **WHEN** an overlay client with a valid route key requests a referenced media asset
- **THEN** the server returns the file bytes with the correct MIME type

#### Scenario: Management token is not required

- **WHEN** an OBS browser source loads an authorized overlay media URL without a management bearer token
- **THEN** the media request succeeds

### Requirement: Management Asset Operations Remain Protected

The system SHALL keep asset import, listing, and management download operations protected by management authorization.

#### Scenario: Unauthenticated management asset list is rejected

- **WHEN** a request without management authorization calls the management asset list endpoint
- **THEN** the request is rejected

### Requirement: Invalid Overlay Media Requests Fail Closed

The system SHALL reject overlay media reads when the route key is invalid, revoked, expired, or scoped to a different output.

#### Scenario: Revoked overlay key cannot read media

- **WHEN** an overlay media request uses a revoked route key
- **THEN** the server rejects the request and does not reveal filesystem storage paths

#### Scenario: Missing asset returns safe error

- **WHEN** an authorized overlay requests an asset ID that does not exist
- **THEN** the server returns a not-found response without leaking storage implementation details

### Requirement: Overlay Client Uses Server Media URL Contract

The overlay client SHALL resolve visual and audio asset IDs to the server-supported overlay media URL contract.

#### Scenario: Playback instruction renders asset

- **WHEN** the overlay receives a playback instruction with a visual or audio asset ID
- **THEN** the rendered media element uses an overlay-safe media URL that can be fetched from the local service
