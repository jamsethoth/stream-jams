## ADDED Requirements

### Requirement: Timer Automation Uses A Dedicated Revocable Credential
The system SHALL let authorized management create, rotate, and revoke one active timer automation bearer credential. The raw bearer SHALL be returned only when created or rotated, while durable persistence contains only a protected verifier and non-secret lifecycle metadata.

#### Scenario: Management creates an automation credential
- **WHEN** an authorized management user explicitly creates the timer automation credential
- **THEN** the system returns the raw bearer once with setup guidance
- **AND** subsequent persistence, logs, diagnostics, backups, screenshots, and browser bundles contain no raw bearer value

#### Scenario: Credential is rotated
- **WHEN** management confirms rotation
- **THEN** the prior bearer stops authorizing requests and one new raw bearer is returned

#### Scenario: Credential is revoked
- **WHEN** management revokes the active credential
- **THEN** later requests using it are rejected without affecting management sessions or overlay keys

### Requirement: Automation Is Loopback Only And Scope Is Isolated
Timer automation routes SHALL accept only a valid timer bearer from a loopback peer, reject browser-origin requests, and SHALL NOT accept management sessions or overlay route keys. The timer bearer SHALL NOT authorize management, overlay, provider, asset, configuration, or other playback APIs.

#### Scenario: Valid local automation request arrives
- **WHEN** a loopback client sends a timer automation request with the active bearer in the Authorization header and no browser Origin
- **THEN** the request proceeds to timer-specific validation

#### Scenario: Non-loopback request presents a valid bearer
- **WHEN** a request originates from a non-loopback peer
- **THEN** it is rejected before reading or mutating timer state

#### Scenario: Timer bearer is used on management
- **WHEN** the timer bearer is presented to a management endpoint
- **THEN** the endpoint rejects it as unauthorized for management access

#### Scenario: Credential appears in a URL
- **WHEN** an automation request supplies credential material in the path or query instead of the Authorization header
- **THEN** the request remains unauthorized and no credential value is logged

### Requirement: Automation Exposes Timer Discovery And State
The API SHALL provide `GET /automation/timers` returning allowlisted stable IDs, labels, and current states for saved timer definitions without exposing asset paths, route bindings, secrets, or mutable authoring data.

#### Scenario: Stream Deck helper lists timers
- **WHEN** an authorized local automation client lists timers
- **THEN** the response contains each definition's stable ID, display label, state, and applicable remaining/deadline data
- **AND** it contains no bearer, management token, overlay key, asset path, or device identifier

### Requirement: Automation Commands Match Authoritative Timer Semantics
The API SHALL provide POST commands at `/automation/timers/:id/start`, `/pause`, `/resume`, `/stop`, and `/restart`. Each response SHALL return the resulting allowlisted timer state and whether the command changed it. The API SHALL NOT create or edit definitions, change outputs, select assets, or override saved duration.

#### Scenario: Start action is retried
- **WHEN** a generic HTTP action sends Start more than once for a running timer
- **THEN** each authorized request succeeds with the same active generation and `changed: false` after the first transition
- **AND** no duplicate cue is emitted

#### Scenario: Explicit restart action is invoked
- **WHEN** Restart targets a running or paused timer
- **THEN** the response identifies a new full-duration generation with `changed: true`

#### Scenario: Request attempts a duration override
- **WHEN** a command body includes duration or authoring fields
- **THEN** the request is rejected without changing the saved definition or active run

### Requirement: Automation Errors And Load Are Bounded
The automation boundary SHALL validate identifiers and payloads before service work, apply dedicated rate limits, use constant-time verifier comparison where applicable, and return redacted structured errors for invalid bearer, unknown timer, malformed command, and excessive requests.

#### Scenario: Unknown timer is targeted
- **WHEN** an authorized command names a timer ID that does not exist
- **THEN** the API returns not found without creating state

#### Scenario: Invalid bearer is presented repeatedly
- **WHEN** a client exceeds the failed-authentication rate limit
- **THEN** subsequent attempts are bounded without logging the presented bearer

#### Scenario: Malformed command is submitted
- **WHEN** a POST command has an unexpected body or invalid identifier
- **THEN** the API rejects it before dispatching a cue or timer transition
