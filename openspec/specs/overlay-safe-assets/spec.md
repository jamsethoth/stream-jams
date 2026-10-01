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

### Requirement: Authorized Media Supports Byte Range Seeking

Management and overlay asset reads SHALL support single byte-range GET requests after their existing authorization checks, with accurate Content-Length, Content-Range and Accept-Ranges headers. Responses SHALL stream from a registered file version without buffering the full representation. HEAD SHALL return full representation headers without a body read. Unsupported or malformed ranges SHALL be ignored; valid unsatisfiable ranges SHALL return 416 without asset bytes. Version-specific strong ETags SHALL support If-None-Match and If-Range with standard precondition precedence. Media responses SHALL use no-store and preserve byte offsets without response transformation.

#### Scenario: Late recipient seeks media
- **WHEN** an authorized browser requests a closed, open-ended or suffix byte range
- **THEN** the server returns only that interval with status 206 and its full representation length
- **AND** the browser can seek nonzero media positions without a whole-file application buffer

#### Scenario: Invalid or unsatisfiable range
- **WHEN** a syntactically valid requested interval does not overlap the asset
- **THEN** the server returns 416 with `Content-Range: bytes */length` and no asset bytes

#### Scenario: Authorization precedes range handling
- **WHEN** an unauthorized or wrong-scope request supplies a Range or conditional header
- **THEN** it is rejected by the existing access boundary without disclosing asset bytes, size, or validators

#### Scenario: HEAD and unsupported conditions
- **WHEN** HEAD, an unsupported range unit, multiple ranges, or malformed range syntax is requested
- **THEN** the server uses full-representation response semantics and HEAD emits no body or file-body read

#### Scenario: Strong If-Range matches
- **WHEN** an authorized GET has a satisfiable Range and If-Range matching the pinned version's strong ETag
- **THEN** the server returns 206 for that version's requested interval

#### Scenario: If-Range cannot be validated
- **WHEN** If-Range is weak, mismatched, malformed, or a date without a strong date validator
- **THEN** the server ignores Range and streams the complete selected representation

#### Scenario: Representation is unmodified
- **WHEN** an authorized GET or HEAD has a matching If-None-Match condition
- **THEN** the server returns 304 before opening a file-body stream

#### Scenario: Read fails after headers
- **WHEN** an active response encounters a storage error or its client disconnects
- **THEN** the server closes the stream and file handle without appending an error document to media bytes
- **AND** unexpected storage failures retain correlated diagnostic evidence
