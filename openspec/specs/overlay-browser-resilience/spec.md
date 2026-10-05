# overlay-browser-resilience Specification

## Purpose
Define bounded browser-overlay reconnection, playback cleanup, and transparent failure behavior.
## Requirements
### Requirement: Overlay Transport Reconnects After Interruption
The browser-source overlay SHALL reconnect after an unexpected WebSocket close using bounded backoff and SHALL stop reconnecting after the overlay is disposed.

#### Scenario: Socket closes unexpectedly
- **WHEN** an authorized overlay WebSocket closes while the browser source remains loaded
- **THEN** the client retries with increasing delays capped at 10 seconds
- **AND** a successful open resets the retry delay

#### Scenario: Overlay is disposed
- **WHEN** the overlay client is disposed
- **THEN** pending reconnect timers are cancelled
- **AND** no additional WebSocket is created

### Requirement: Fixed Profiles Scale To The Browser Viewport
The overlay SHALL render the 1920x1080 Landscape profile and 1080x1920 Vertical profile in profile pixels, uniformly scaled to fit and centered within the actual transparent browser viewport.

#### Scenario: Canonical viewport is used
- **WHEN** the browser viewport matches the selected profile dimensions
- **THEN** profile geometry renders at 1:1 scale

#### Scenario: Noncanonical viewport is used
- **WHEN** the browser viewport has a different size or aspect ratio
- **THEN** the entire fixed profile remains visible without clipping or distortion
- **AND** unused viewport space remains transparent

### Requirement: Production Overlay Failures Render No Diagnostic Content
The production overlay SHALL fail closed with an empty transparent rendering tree when transport or internal rendering fails.

#### Scenario: Transport fails on a live route
- **WHEN** the live overlay cannot connect or receives an internal failure
- **THEN** no error message, reference, stack detail, or hidden diagnostic text is rendered in the overlay DOM
- **AND** operator diagnostics remain available through management or logs

### Requirement: Management Test Audio Can Be Activated In Place
The browser-source overlay SHALL let an operator recover management-triggered test audio when the browser requires a user interaction, without exposing the activation control during live-event playback.

#### Scenario: Browser blocks management test audio
- **WHEN** a management-triggered test reaches an authorized browser source and audio playback is rejected because user activation is required
- **THEN** the overlay offers an `Enable alert audio` action and retains the test audio for retry
- **AND** activating the action retries that audio immediately within the trusted interaction

#### Scenario: Browser blocks live-event audio
- **WHEN** audio from a live event is rejected because user activation is required
- **THEN** the overlay renders no operator diagnostic or activation control
- **AND** the failure remains available through management Diagnostics

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
