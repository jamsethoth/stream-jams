# alert-tts-configuration Specification

## Purpose
Define per-alert TTS configuration, normalized template inputs, and safe failure reporting.
## Requirements
### Requirement: Alert Variants Can Configure TTS
The system SHALL allow authorized management users to configure supported TTS behavior per alert variant.

#### Scenario: Variant TTS config is saved
- **WHEN** a management user enables Speaker.bot TTS for an alert variant and saves the rule
- **THEN** the variant persists provider kind, enabled state, and template text
- **AND** voice selection and safety controls remain owned by the registered Speaker.bot provider

### Requirement: Alert TTS Uses Normalized Event Data
The system SHALL render alert TTS text from normalized event data rather than raw provider payloads.

#### Scenario: TTS template is rendered
- **WHEN** a configured alert variant matches a normalized Twitch event
- **THEN** TTS text is rendered using the same safe normalized event fields available to alert text templates

### Requirement: TTS Failure Does Not Leak Secrets
The system SHALL log and display TTS failures without exposing secrets, local credentials, or raw provider payloads.

#### Scenario: Provider failure is redacted
- **WHEN** a configured Speaker.bot TTS trigger fails
- **THEN** diagnostics include provider, status, and safe message details without secret values

### Requirement: Browser Speech Numeric Controls Explain Units
Browser Speech volume and rate controls SHALL expose their unchanged normalized values with explicit units and associated explanatory guidance.

#### Scenario: Speech safety values are edited
- **WHEN** the user edits volume, minimum rate, or maximum rate
- **THEN** labels read `Volume (0–1)`, `Minimum rate (×)`, and `Maximum rate (×)` with associated explanations for zero, one, half, and double speed
- **AND** saving submits the same numeric typed payload and validation boundaries
