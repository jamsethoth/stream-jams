## ADDED Requirements

### Requirement: Authorized Media Supports Byte Range Seeking
Management and overlay asset reads SHALL support single byte-range GET requests after their existing authorization checks, with accurate Content-Length, Content-Range and Accept-Ranges headers. HEAD SHALL return full representation headers without a body. Unsupported or malformed ranges SHALL be ignored; valid unsatisfiable ranges SHALL return 416 without asset bytes.

#### Scenario: Late recipient seeks media
- **WHEN** an authorized browser requests a closed, open-ended or suffix byte range
- **THEN** the server returns only that interval with status 206 and its full representation length
- **AND** the browser can seek nonzero media positions

#### Scenario: Invalid or unsatisfiable range
- **WHEN** a syntactically valid requested interval does not overlap the asset
- **THEN** the server returns 416 with `Content-Range: bytes */length` and no asset bytes

#### Scenario: Authorization precedes range handling
- **WHEN** an unauthorized or wrong-scope request supplies a Range header
- **THEN** it is rejected by the existing access boundary without disclosing asset bytes or size

#### Scenario: HEAD and unsupported conditions
- **WHEN** HEAD, an unsupported range unit, multiple ranges, malformed syntax or an unvalidated If-Range condition is requested
- **THEN** the server uses full-representation response semantics and HEAD emits no body
