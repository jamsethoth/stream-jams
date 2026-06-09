## ADDED Requirements

### Requirement: Persisted Streamer.bot Connection Configuration

Stream Jams SHALL persist one local Streamer.bot connection profile through the existing Stream Jams SQLite migration and repository integration, containing only non-secret connection settings and safe management metadata.

#### Scenario: Default connection configuration is returned

- **WHEN** management reads Streamer.bot connection configuration before any saved settings exist
- **THEN** the response contains `enabled: false`
- **AND** the response contains protocol `ws`, host `127.0.0.1`, port `8080`, and endpoint `/`
- **AND** the response contains empty selected subscriptions
- **AND** the response reports `hasPassword: false`
- **AND** the response does not contain password values, authentication hashes, or secret refs

#### Scenario: Existing SQLite integration is reused

- **WHEN** Streamer.bot connection persistence is implemented
- **THEN** it uses the existing `node:sqlite` migration registry and repository pattern
- **AND** repository tests use `createInMemoryStreamJamsDatabase()`
- **AND** no new database library, ORM, or config-store replacement is introduced

#### Scenario: Non-secret connection settings are persisted

- **WHEN** management saves a valid Streamer.bot connection configuration
- **THEN** the existing SQLite database persists enabled state, protocol, host, port, endpoint, warning opt-ins, selected subscriptions, and safe status metadata
- **AND** subsequent reads return the saved non-secret settings
- **AND** no SQLite column stores password plaintext, authentication hashes, or raw secret values

#### Scenario: Password is stored only through SecretStore

- **WHEN** management saves a non-empty Streamer.bot password
- **THEN** the password is written through `SecretStore` using the `streamerbot` namespace
- **AND** SQLite persists only the corresponding secret reference metadata
- **AND** management responses report `hasPassword: true`
- **AND** management responses do not include the password or secret ref

#### Scenario: Password update omission keeps existing secret

- **WHEN** a Streamer.bot connection already has a password secret
- **AND** management updates other connection settings without a password field
- **THEN** the existing password secret remains available
- **AND** the response still reports `hasPassword: true`

#### Scenario: Password null clears existing secret

- **WHEN** a Streamer.bot connection already has a password secret
- **AND** management updates the connection with password set to `null`
- **THEN** the existing Streamer.bot password secret is deleted through `SecretStore`
- **AND** SQLite clears the stored password secret ref
- **AND** the response reports `hasPassword: false`

### Requirement: Local-Only Security Policy

Stream Jams SHALL enforce first-wave local-only Streamer.bot connection policy before saving enabled configurations or using connection settings for protocol calls.

#### Scenario: Loopback hosts are accepted

- **WHEN** management saves or tests a Streamer.bot connection using `localhost`, `127.0.0.1`, another IPv4 `127.0.0.0/8` address, `::1`, or a bracketed loopback IPv6 host
- **THEN** host validation succeeds
- **AND** the normalized configuration remains local-only

#### Scenario: Non-local hosts are rejected

- **WHEN** management saves, enables, tests, or discovers events for a Streamer.bot connection using a LAN IP, public IP, or non-local hostname
- **THEN** the request is rejected with a safe validation error
- **AND** no protocol connection attempt is made
- **AND** no password value is written to the protocol client

#### Scenario: Credential-bearing ws requires insecure-local opt-in

- **WHEN** a Streamer.bot connection has a password
- **AND** protocol is `ws`
- **AND** `allowInsecureLocalConnection` is false
- **THEN** save, enable, test, and discover operations that would use the password are rejected
- **AND** the response includes a warning or error code for credential-bearing insecure local transport

#### Scenario: Unauthenticated mode requires explicit opt-in

- **WHEN** a Streamer.bot connection has no password
- **AND** `allowUnauthenticatedLocalConnection` is false
- **THEN** enable, test, and discover operations are rejected
- **AND** the response includes a warning or error code for unauthenticated local mode

#### Scenario: Unauthenticated ws requires both opt-ins

- **WHEN** a Streamer.bot connection has no password
- **AND** protocol is `ws`
- **AND** either `allowUnauthenticatedLocalConnection` or `allowInsecureLocalConnection` is false
- **THEN** enable, test, and discover operations are rejected
- **AND** no protocol connection attempt is made

#### Scenario: Authenticated loopback wss is allowed without insecure opt-in

- **WHEN** a Streamer.bot connection has a password
- **AND** protocol is `wss`
- **AND** host is loopback
- **THEN** validation does not require `allowInsecureLocalConnection`
- **AND** the password may be used for a protocol test or discovery request

### Requirement: Management API Protection And Redaction

Streamer.bot connection management APIs SHALL be management-protected and SHALL expose only safe configuration, warning, and status information.

#### Scenario: Management routes require management session

- **WHEN** a request without a valid management session calls any Streamer.bot connection route
- **THEN** the request is rejected before repository, secret-store, or protocol-probe work starts

#### Scenario: Management routes are rate-limited

- **WHEN** Streamer.bot connection management requests exceed the local management rate limit
- **THEN** the request is rejected before repository, secret-store, or protocol-probe work starts

#### Scenario: Redacted configuration is returned

- **WHEN** management reads or updates Streamer.bot connection configuration
- **THEN** the response includes endpoint settings, enabled desired state, selected subscriptions, `hasPassword`, warning codes, and safe status metadata
- **AND** the response does not include password values, authentication hashes, raw protocol payloads, or secret refs

#### Scenario: Validation errors are safe

- **WHEN** a Streamer.bot connection request fails validation
- **THEN** the error response contains a stable error code and safe message
- **AND** the response does not echo password values, authentication hashes, raw protocol payloads, or secret refs

### Requirement: One-Shot Connection Test And Event Discovery

Stream Jams SHALL expose management-protected one-shot Streamer.bot test and discovery operations without starting the long-lived Streamer.bot runtime.

#### Scenario: Test connection succeeds

- **WHEN** management calls `POST /streamerbot/connection/test` for a valid persisted connection
- **AND** the one-shot probe completes the Streamer.bot Hello and optional authentication flow
- **THEN** the response reports success with safe instance metadata
- **AND** safe last-tested metadata is persisted
- **AND** the one-shot probe is disconnected after the operation

#### Scenario: Test connection failure is safe

- **WHEN** management calls `POST /streamerbot/connection/test`
- **AND** the one-shot probe fails because of connection, authentication, timeout, or malformed protocol response
- **THEN** the response reports failure with a safe error code and message
- **AND** safe last-error metadata is persisted
- **AND** the response does not include password values, authentication hashes, raw protocol payloads, or secret refs

#### Scenario: Discover events preserves category key casing

- **WHEN** management calls `POST /streamerbot/connection/discover-events` for a valid persisted connection
- **AND** Streamer.bot returns available events grouped by category key
- **THEN** the response returns the event map without changing category key casing
- **AND** the operation does not persist discovered events as selected subscriptions
- **AND** the one-shot probe is disconnected after the operation

#### Scenario: Discovery uses stored secret without returning it

- **WHEN** a persisted Streamer.bot connection has a password secret
- **AND** management discovers events
- **THEN** the password is read through `SecretStore` and passed only to the one-shot probe
- **AND** the response reports only safe event and status data

### Requirement: Desired State And Subscription Management

Streamer.bot management APIs SHALL persist desired enabled state and selected subscriptions without starting runtime event intake in this slice.

#### Scenario: Enable persists desired state only

- **WHEN** management calls `POST /streamerbot/connection/enable` for a valid saved connection
- **THEN** the persisted Streamer.bot connection has `enabled: true`
- **AND** no long-lived Streamer.bot runtime socket is started in this slice

#### Scenario: Disable persists desired state only

- **WHEN** management calls `POST /streamerbot/connection/disable`
- **THEN** the persisted Streamer.bot connection has `enabled: false`
- **AND** no long-lived Streamer.bot runtime socket is stopped in this slice

#### Scenario: Subscriptions are persisted separately from discovered events

- **WHEN** management saves Streamer.bot subscription selections
- **THEN** the selected subscription category keys and event names are validated as non-empty strings
- **AND** the selections are persisted for later runtime resubscription
- **AND** selected category key casing is preserved exactly

#### Scenario: Invalid subscriptions are rejected

- **WHEN** management saves subscription selections with empty source keys, empty event names, or empty event lists
- **THEN** the request is rejected with a safe validation error
- **AND** the previously persisted subscriptions remain unchanged
