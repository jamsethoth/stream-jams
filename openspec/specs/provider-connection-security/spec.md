# provider-connection-security

## Purpose

Define credential-free local provider connections, authenticated event intake, redaction, and fail-closed security acceptance without live configuration changes.

## Requirements

### Requirement: Provider connection fields are local and credential free
The system SHALL allow Streamer.bot and Speaker.bot connections only to canonical loopback destinations and path-only endpoints, and SHALL reject credential-bearing URLs and remote destinations at setup, runtime connection, and backup boundaries.

#### Scenario: Unsafe host or endpoint is rejected
- **WHEN** a host contains credentials, a remote address, query/fragment syntax, or an ambiguous address, or an endpoint contains query/fragment syntax
- **THEN** validation fails without opening a socket or persisting the input

#### Scenario: Legacy unsafe configuration is contained
- **WHEN** an existing configuration contains unsafe connection fields
- **THEN** runtime connection and backup export fail closed and management responses do not disclose embedded credentials

#### Scenario: Local compatibility is preserved
- **WHEN** the operator configures a canonical loopback destination and path-only endpoint
- **THEN** the supported local ws/wss transport is usable without disabling certificate verification

### Requirement: Streamer.bot intake waits for the required handshake
The system SHALL deliver events only after the current socket has completed its required handshake. A configured password SHALL require challenge-response authentication. Unauthenticated local operation SHALL require explicit persisted opt-in.

#### Scenario: Authentication downgrade or early event
- **WHEN** a password-configured server omits authentication, authentication fails, or an event arrives before readiness
- **THEN** no event is delivered and no unauthenticated downgrade is accepted

#### Scenario: Explicit local unauthenticated operation
- **WHEN** no password is configured, local unauthenticated operation is explicitly allowed, and a valid Hello arrives
- **THEN** the client becomes ready and processes subsequent valid events

#### Scenario: Duplicate or stale handshake
- **WHEN** a handshake is repeated on an established socket or an obsolete authentication response arrives after reconnect
- **THEN** it cannot authorize event delivery on the current socket

### Requirement: Provider security limitations are visible
The setup UI SHALL explain local transport, Streamer.bot Authentication/Enforce setup, and Speaker.bot's lack of documented native WebSocket authentication.

#### Scenario: Operator selects a provider
- **WHEN** the operator sets up Streamer.bot or Speaker.bot
- **THEN** applicable guidance is visible and unauthenticated Streamer.bot consent starts unchecked

### Requirement: Secret redaction survives logger failures
Normal and emergency diagnostics SHALL redact URL credentials and overlay, media, and timer capabilities from messages and exception chains.

#### Scenario: Primary logging fails
- **WHEN** filesystem or serialization failure invokes the emergency logger with capability-bearing diagnostic data
- **THEN** neither the emergency file nor stderr exposes the secret values

### Requirement: Provider security acceptance exercises real lifecycle boundaries
Security acceptance SHALL use real local WebSocket peers and disposable persistent runtimes to verify authentication, legacy rejection, restart, secret exclusion, and backup restore. Installed vendor compatibility SHALL run against binary-only disposable profiles using synthetic credentials; unavailable required capabilities SHALL fail explicitly.

#### Scenario: Runtime restarts or credentials are unavailable
- **WHEN** an authenticated saved provider restarts with its secret store or its required secret disappears
- **THEN** successful authentication and intake resume only with the required credential, and missing credentials fail closed without disclosing secret values in HTTP responses or runtime log files

#### Scenario: Portable backup or unsafe restore
- **WHEN** a backup containing authenticated and explicitly consenting local providers is exported and restored into another disposable runtime, or an unsafe provider archive is submitted
- **THEN** consent persists without secrets, authenticated providers require reconnection credentials, and rejected imports leave stored configuration unchanged

### Requirement: Operational security checks fail closed without live changes
Dependency acceptance SHALL fail for moderate, high, or critical advisories without advisory exceptions, and for registry errors, while retaining JSON evidence and an always-run summary. Installed Windows acceptance SHALL provision pinned vendor binaries into disposable profiles. Exposure diagnostics SHALL be read-only and report unknown remote reachability without changing firewall or application configuration.

#### Scenario: Dependency input changes or registry fails
- **WHEN** a root or nested manifest, workspace, lockfile or audit workflow changes, or an audit runs weekly or manually
- **THEN** moderate-or-higher findings and registry errors fail the gate without advisory exceptions and its report and summary remain available

#### Scenario: Installed CI and local exposure diagnostics
- **WHEN** installed acceptance runs in Windows CI or an operator selects application listeners and explicit Node PIDs for exposure reporting
- **THEN** pinned disposable binaries are used, missing required capabilities fail explicitly, and diagnostics preserve live configuration and distinguish observations from unknown remote reachability


#### Scenario: Vulnerable development dependency has no patched release
- **WHEN** a development dependency has an advisory without a patched release
- **THEN** the vulnerable chain is eliminated or replaced and the audit remains blocking without an advisory exception

#### Scenario: Published candidate verification
- **WHEN** the authorized security change is published as a pull request
- **THEN** ordinary CI, dependency audit, and installed Windows acceptance are verified for its exact pushed candidate SHA before reporting hosted acceptance complete; merging and branch-protection changes remain separate actions
