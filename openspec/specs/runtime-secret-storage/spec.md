# runtime-secret-storage

## Purpose

Define durable local secret storage requirements for real runtime secrets while keeping fake or in-memory stores limited to tests.
## Requirements
### Requirement: Runtime Uses Durable Secret Store

The system SHALL use a durable OS-backed secret store for real local runtime secrets in normal development and production/local-app runtime modes when supported by the platform.

#### Scenario: Twitch token survives restart

- **WHEN** a Twitch account is connected and the app restarts over the same local profile
- **THEN** the app can retrieve the stored access token through the secret store reference without storing token material in SQLite

#### Scenario: Development runtime uses durable storage

- **WHEN** the app is started through the normal development runtime path
- **THEN** Twitch OAuth and EventSub token access use the same durable OS-backed secret-store selection as production/local-app startup

#### Scenario: Later runtime features can store local secrets

- **WHEN** a server-side feature needs to persist local secret material for later recovery
- **THEN** the runtime secret-store path supports storing and retrieving that material without requiring plaintext secret values in SQLite or browser-accessible files

### Requirement: In-Memory Secret Stores Are Test-Only

The system SHALL keep in-memory or fake secret stores out of normal development and production/local-app runtime selection.

#### Scenario: Runtime startup does not use dev store

- **WHEN** the app starts in normal development or production/local-app mode with Twitch OAuth enabled
- **THEN** `DevSecretStore` is not selected

#### Scenario: Tests inject fake secret storage

- **WHEN** automated tests need deterministic secret storage
- **THEN** they can inject a fake or in-memory `SecretStore` without changing normal runtime secret-store selection

### Requirement: Unsupported Credential Store Fails Closed

The system SHALL keep unrelated local app features available but fail closed with actionable diagnostics for real OAuth secret operations when no supported durable secret store is available.

#### Scenario: Credential store unavailable

- **WHEN** the app starts in normal development or production/local-app mode and the OS credential adapter cannot be initialized
- **THEN** startup reports a clear non-secret credential-store health warning
- **AND** Twitch OAuth connect, refresh, and token-storage operations fail without storing token material insecurely

### Requirement: Secrets Are Redacted

The system SHALL keep secret values out of logs, diagnostics exports, config files, browser bundles, and overlay URLs.

#### Scenario: Diagnostics export excludes token material

- **WHEN** diagnostics are exported after Twitch OAuth token storage
- **THEN** the export contains only redacted secret references and no access or refresh token values

### Requirement: Credential Names Are Scoped By Profile
The OS-backed secret store SHALL name every credential `<prefix>:<namespace>:<name>`, with account `<accountId>`. The prefix SHALL come from the runtime profile: `stream-jams` for `production`, `stream-jams-dev` for `dev`, and `stream-jams-test-<runId>` for `test`, where `STREAM_JAMS_KEYRING_PREFIX` supplies the test run ID. A `dev` or `test` runtime SHALL never read, write or delete a credential with the `stream-jams` prefix.

#### Scenario: Dev connects music without touching production
- **WHEN** a `dev` runtime pairs Pear Desktop
- **THEN** it creates or reads `stream-jams-dev:music:client-id`, and the production `stream-jams:music:client-id` entry is unchanged

#### Scenario: Test run cleanup
- **WHEN** a desktop test run with prefix `stream-jams-test-<runId>` finishes
- **THEN** the harness deletes every credential with that prefix and no other credential

