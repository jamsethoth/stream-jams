## ADDED Requirements

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
