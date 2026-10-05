## ADDED Requirements

### Requirement: Stable custom error diagnostic names and causes
Application custom errors MUST expose explicit stable diagnostic names. Enrichment of caught failures SHALL preserve native cause provenance without exposing unsafe data. Existing exception transport schemas SHALL remain compatible.

#### Scenario: Previously unnamed error is serialized
- **WHEN** any of the 24 audited unnamed errors is constructed and serialized
- **THEN** its specific stable type and existing serialized code/cause contract are preserved instead of the generic type `Error`, while typed domain fields remain available to their existing consumers

#### Scenario: Safe enrichment preserves cause
- **WHEN** a cause-aware error wraps a safe lower-level exception
- **THEN** native cause serialization preserves that exception and existing redaction behavior

### Requirement: Minimal shared mechanics preserve domain contracts
Shared foundations SHALL centralize stable naming and server safe-HTTP envelope mechanics without removing specialized payloads, changing existing constructor signatures or authorizing arbitrary error disclosure.

#### Scenario: Specialized HTTP error crosses its owning route
- **WHEN** a migrated audio/config/automation/surface error reaches its existing handler
- **THEN** its existing status, code, safe copy and specialized payload remain available

#### Scenario: Unknown error reaches global boundary
- **WHEN** an unrecognized error or unowned shared-envelope instance reaches the global boundary
- **THEN** existing generic handling and safe disclosure rules apply

### Requirement: Screen Effects failures have authoritative identity and complete mapping
Screen Effects services SHALL share one missing-definition constructor. Admission-time missing variants SHALL map to the existing unavailable-variant response.

#### Scenario: Definition disappears between reads
- **WHEN** a definition disappears after management validation and before admission validation
- **THEN** the HTTP response is 404 with `SCREEN_EFFECT_NOT_FOUND` rather than generic 500

#### Scenario: Variant becomes unavailable between reads
- **WHEN** admission cannot find the variant accepted by the management precheck
- **THEN** the HTTP response is 409 with `SCREEN_EFFECT_VARIANT_UNAVAILABLE`

### Requirement: Subscription consolidation preserves externally observable distinctions
The three payload-free subscription failures SHALL use one closed code-discriminated family while preserving existing codes, safe messages, diagnostic names and route statuses. Selection-unavailable typed payloads SHALL remain specialized.

#### Scenario: Each consolidated outcome reaches the boundary
- **WHEN** wrong-provider, inactive or unverified-broadcaster subscription failure occurs
- **THEN** its existing 422, 409 or 409 response respectively and existing diagnostic name are retained

### Requirement: Expected application failures use bounded domain classification
Audited first-party handlers SHALL classify expected outcomes through authoritative local identity or validated module-owned codes and payloads, rather than English message matching or name-only fallback. Unknown failures MUST remain safely generic.

#### Scenario: Missing Screen Effects reference
- **WHEN** a visual asset, sound asset or audio route reference is unavailable
- **THEN** a typed reference failure yields the existing safe conflict response independent of incidental error wording

#### Scenario: Runtime or route receives an unrelated lookalike
- **WHEN** an unrelated error mimics a known message/name or supplies an unknown/malformed domain code
- **THEN** it does not receive expected-domain classification or expose remote error text

#### Scenario: Streamer.bot failure already owns diagnostic context
- **WHEN** the runtime adopts an existing client failure
- **THEN** it preserves the existing diagnostic reference without duplicate logging or changed retry behavior

### Requirement: Vendor compatibility adapters use verified bounded contracts
SQLite and ws classification SHALL use verified vendor error codes. Any retained Zod cross-realm name compatibility SHALL be isolated and validate its required issues shape.

#### Scenario: SQLite foreign key versus unrelated failure
- **WHEN** asset deletion encounters a native SQLite foreign-key violation or an unrelated constraint
- **THEN** only the verified foreign-key result receives asset-in-use handling

#### Scenario: Pear socket protocol versus transport failure
- **WHEN** ws emits a documented protocol/limit code or an unknown network error
- **THEN** only the documented code receives protocol classification, while authentication and safe redaction behavior remain unchanged

### Requirement: Stable naming has automated enforcement
The existing error-provenance gate SHALL reject custom error declarations lacking a stable name while recognizing supported direct, imported and indirect named foundations.

#### Scenario: New unnamed declaration is introduced
- **WHEN** a custom native error subclass omits explicit naming and a supported named foundation
- **THEN** the gate reports its source location and fails

#### Scenario: Legitimate named inheritance is used
- **WHEN** a declaration uses an explicit stable name or inherits supported naming mechanics
- **THEN** the naming gate accepts it without weakening existing provenance rules
