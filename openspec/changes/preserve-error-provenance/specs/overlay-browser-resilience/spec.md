## ADDED Requirements

### Requirement: Overlay Playback Failures Retain Stage And Cause Off Stream
The browser-source overlay SHALL report a bounded structured exception, stable reference and exact playback stage through its authenticated connection before failed content is removed, while rendering no diagnostic content on stream. The server SHALL derive connection identity and target profile from the authorized registered client. Structured exception detail SHALL be available only in Raw logs and debug exports.

#### Scenario: Timed video preparation fails
- **WHEN** video source loading, metadata readiness, seeking or decoding fails during timed preparation
- **THEN** Raw logs identify the source-load, metadata, seek or decode stage and retain the redacted original cause
- **AND** the overlay remains transparent

#### Scenario: Browser rejects playback
- **WHEN** `play()` rejects for a reason other than the existing recoverable management-test activation case
- **THEN** Raw logs identify the play stage and retain the redacted rejection
- **AND** no stack, reference or diagnostic text is rendered in the production overlay DOM

#### Scenario: Overlay submits untrusted route identity
- **WHEN** a failure payload attempts to supply client or target-profile identity
- **THEN** the server ignores that identity and uses the authorized connection registration

#### Scenario: Failure payload is malformed or oversized
- **WHEN** an overlay submits exception data outside the strict schema or size bounds
- **THEN** the server rejects it without persisting attacker-controlled unbounded content
