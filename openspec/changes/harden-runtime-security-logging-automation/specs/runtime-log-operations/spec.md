## ADDED Requirements

### Requirement: Runtime Structured Logs Are Written
The system SHALL write structured runtime logs for provider activity, management security decisions, playback, diagnostics, and operational errors.

#### Scenario: Provider error is logged
- **WHEN** a provider call fails
- **THEN** the runtime writes a structured log entry with provider, event, severity, and redacted error details

### Requirement: Runtime Logs Are Redacted
The system SHALL redact secrets, OAuth tokens, overlay route keys, local credential references, and sensitive provider payload fields from runtime logs.

#### Scenario: Secret is redacted from log
- **WHEN** a log entry is created from data containing a token or route key
- **THEN** the persisted log contains a redacted placeholder instead of the sensitive value

### Requirement: Log Level And Retention Are Configurable
The system SHALL support configurable runtime log level and retention policy with safe defaults.

#### Scenario: Retention removes old logs
- **WHEN** log retention runs with files older than the configured retention period
- **THEN** old log files are removed while current log files remain available

### Requirement: Diagnostics Explain Log State
The system SHALL expose safe diagnostics about logging configuration and export behavior to management users.

#### Scenario: Diagnostics export includes safe log metadata
- **WHEN** a management user exports diagnostics
- **THEN** the export includes safe log metadata and redacted operational entries without raw secrets
