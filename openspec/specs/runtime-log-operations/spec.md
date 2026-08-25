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

The system SHALL support configurable runtime log level and retention policy with safe defaults of `INFO` level and 48-hour retention, and SHALL apply that retention window to both runtime log files and relational diagnostic history.

#### Scenario: Retention removes old logs

- **WHEN** log retention runs with files older than the configured retention period
- **THEN** old log files are removed while current log files remain available

#### Scenario: Retention removes old relational diagnostics

- **WHEN** maintenance runs with event, alert-match, or playback diagnostic rows older than the configured retention period
- **THEN** expired rows are removed in bounded batches
- **AND** rows at or newer than the cutoff remain available

#### Scenario: Rows share the retention timestamp

- **WHEN** more expired rows share one timestamp than fit in a pruning batch
- **THEN** repeated maintenance batches delete each expired row deterministically by timestamp and ID
- **AND** newly appended rows remain writable between batches

### Requirement: Diagnostics Explain Log State

The system SHALL expose logging configuration, redacted recent runtime entries, copy actions, and sanitized export behavior to authorized management users without exposing secrets or raw provider payloads.

#### Scenario: Raw logs view shows redacted entries

- **WHEN** a management user opens Raw logs or selects a log detail
- **THEN** the system shows bounded structured entries after allowlisting and redaction
- **AND** tokens, credentials, authorization headers, sensitive URLs, provider secrets, and overlay route keys are not displayed

#### Scenario: Sanitized event is copied

- **WHEN** a management user chooses `Copy sanitized event`
- **THEN** the copied record contains diagnostic context and reference IDs but no secret or disallowed raw payload fields

#### Scenario: Selected problem is copied as JSON

- **WHEN** a management user chooses `Copy error JSON` for the selected Diagnostics problem
- **THEN** the clipboard receives a formatted JSON document containing the sanitized problem identifier, area, summary, cause, next step, severity, occurrence time, reference ID, and correction target
- **AND** the UI reports copy success or a human-readable copy failure with a next step
- **AND** the copied JSON contains no secret or disallowed raw payload fields

#### Scenario: Diagnostics export includes safe log metadata

- **WHEN** a management user exports diagnostics
- **THEN** the default export includes safe log settings, log location metadata, retention metadata, and file window metadata without runtime log entries or raw secrets

#### Scenario: Debug diagnostics export includes bounded redacted logs

- **WHEN** a management user explicitly requests a debug diagnostics export with a bounded recent log window
- **THEN** the export includes the default diagnostics data plus redacted recent runtime log entries, marks that debug logs are included, and indicates when entries were truncated by the requested or maximum limit

#### Scenario: Diagnostics export fails visibly

- **WHEN** diagnostics or debug export fails
- **THEN** the UI shows a human-readable error, next step, and reference ID when available

### Requirement: Diagnostics Separate Problems Events And Raw Logs

The system SHALL provide Problems, Events, and Raw logs diagnostics views over sanitized operational data with session-only search, filters, and sorting.

#### Scenario: Active problems are grouped for correction

- **WHEN** active operational failures exist
- **THEN** Problems groups them by severity and owning area
- **AND** each problem shows a human-readable summary, cause when known, next step, timestamp when useful, reference ID, and correction deep link when available

#### Scenario: Normalized event opens detail

- **WHEN** a user selects an event from the sortable and filterable Events table
- **THEN** Diagnostics shows normalized event-source, event-type, outcome, timing, test/live state, and linked alert/playback details without exposing raw provider payloads

#### Scenario: Reference ID search locates evidence

- **WHEN** a user searches Diagnostics for a known reference ID
- **THEN** matching problems, events, and redacted log entries are discoverable in their owning views

#### Scenario: Provider runtime failure creates traceable evidence

- **WHEN** a provider runtime or its event-ingestion pipeline creates a distinct live failure
- **THEN** the failure source generates a reference ID and records redacted diagnostic evidence with the same ID
- **AND** provider status and management error detail expose that reference ID
- **AND** repeated status reads do not create duplicate diagnostic entries for the same failure

#### Scenario: Overlay playback failure creates traceable evidence

- **WHEN** an overlay client reports that browser playback failed
- **THEN** the runtime records redacted error evidence with the instruction ID as its reference ID
- **AND** the failure is discoverable in Problems and Raw logs without exposing it on the live overlay

### Requirement: Diagnostic Correction Links Preserve Context

The system SHALL link diagnostic failures to the provider, alert, asset, browser-source output, or settings location that can correct them.

#### Scenario: Provider failure opens provider detail

- **WHEN** a user follows the correction action for a provider validation failure
- **THEN** the system opens that registered provider or setup flow with the failed check identified
