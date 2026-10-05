## MODIFIED Requirements

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
