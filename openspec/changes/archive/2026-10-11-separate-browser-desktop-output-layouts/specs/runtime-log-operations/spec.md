## MODIFIED Requirements

### Requirement: Diagnostics Separate Problems Events And Raw Logs

The system SHALL provide Problems, Events, and Raw logs diagnostics views over sanitized operational data with session-only search, filters, and sorting.

#### Scenario: Active problems are grouped for correction

- **WHEN** active operational failures exist
- **THEN** Problems groups them by severity and owning area
- **AND** each problem shows a human-readable summary, cause when known, next step, timestamp when useful, reference ID, and correction deep link when available

#### Scenario: Normalized event opens detail

- **WHEN** a user selects an event from the sortable and filterable Events table
- **THEN** Diagnostics shows normalized event-source, event-type, outcome, timing, manual/subscribed provenance, and linked alert/playback details without exposing raw provider payloads

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
