## ADDED Requirements

### Requirement: Runtime Uses Durable Secret Store
The system SHALL use a durable OS-backed secret store for real local runtime secrets when supported by the platform.

#### Scenario: Twitch token survives restart
- **WHEN** a Twitch account is connected and the app restarts over the same local profile
- **THEN** the app can retrieve the stored access token through the secret store reference without storing token material in SQLite

### Requirement: Development Secret Store Is Explicit
The system SHALL use the development in-memory secret store only when an explicit development or test mode selects it.

#### Scenario: Production startup does not use dev store
- **WHEN** the app starts in production/local-app mode with Twitch OAuth enabled
- **THEN** `DevSecretStore` is not selected

### Requirement: Unsupported Credential Store Fails Closed
The system SHALL fail closed with actionable diagnostics when no supported durable secret store is available for real OAuth secrets.

#### Scenario: Credential store unavailable
- **WHEN** the app starts in production/local-app mode and the OS credential adapter cannot be initialized
- **THEN** startup or OAuth enablement fails with a clear non-secret error message

### Requirement: Secrets Are Redacted
The system SHALL keep secret values out of logs, diagnostics exports, config files, browser bundles, and overlay URLs.

#### Scenario: Diagnostics export excludes token material
- **WHEN** diagnostics are exported after Twitch OAuth token storage
- **THEN** the export contains only redacted secret references and no access or refresh token values
