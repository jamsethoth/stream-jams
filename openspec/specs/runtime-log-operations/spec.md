# runtime-log-operations

## Purpose

Define local runtime logging behavior for troubleshooting provider, management, playback, diagnostics, and operational failures without persisting secrets.

## Requirements

### Requirement: Runtime Structured Logs Are Written

The system SHALL write structured JSONL runtime logs under the app data log directory for provider activity, management security decisions, playback, diagnostics, and operational errors.

#### Scenario: Provider error is logged

- **WHEN** a provider call fails
- **THEN** the runtime writes a structured log entry with timestamp, level, event, component, correlation identifiers when available, outcome, reason or error code, and redacted error details

#### Scenario: Log files roll over hourly

- **WHEN** runtime logging crosses an hour boundary
- **THEN** new log entries are written to the current hour's JSONL log file while previous files remain available until retention removes them

### Requirement: Runtime Logs Are Redacted

The system SHALL log provider/runtime data through allowlisted per-event schemas and then redact secrets, OAuth tokens, overlay route keys, local credential references, authorization headers, sensitive URLs, and sensitive provider fields before persisting runtime logs.

#### Scenario: Secret is redacted from log

- **WHEN** a log entry is created from data containing a token or route key
- **THEN** the persisted log contains a redacted placeholder instead of the sensitive value

#### Scenario: Raw provider payload is not persisted

- **WHEN** provider payloads or provider HTTP error bodies are logged
- **THEN** the persisted log contains only allowlisted fields and does not contain the raw payload or raw HTTP body

### Requirement: Log Level And Retention Are Configurable

The system SHALL support configurable runtime log level and retention policy with safe defaults of `INFO` level and 48-hour retention.

#### Scenario: Retention removes old logs

- **WHEN** log retention runs with files older than the configured retention period
- **THEN** old log files are removed while current log files remain available

### Requirement: Diagnostics Explain Log State

The system SHALL expose safe diagnostics about logging configuration and export behavior to management users.

#### Scenario: Diagnostics export includes safe log metadata

- **WHEN** a management user exports diagnostics
- **THEN** the default export includes safe log settings, log location metadata, retention metadata, and file window metadata without runtime log entries or raw secrets

#### Scenario: Debug diagnostics export includes bounded redacted logs

- **WHEN** a management user explicitly requests a debug diagnostics export with a bounded recent log window
- **THEN** the export includes the default diagnostics data plus redacted recent runtime log entries, marks that debug logs are included, and indicates when entries were truncated by the requested or maximum limit
