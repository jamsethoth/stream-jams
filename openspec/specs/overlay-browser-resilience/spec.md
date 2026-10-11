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
Scene browser outputs for Alerts and Screen Effects SHALL render their fixed target profile in profile pixels, uniformly scaled to fit and centered within the actual transparent browser viewport. Music, Timers and Videos content browser outputs SHALL instead use their authoritative content canvas at one CSS pixel per configured unit, with transparent extra viewport area or clipping as defined by output-specific-module-rendering. Private desktop presentation SHALL retain its scene fit.

#### Scenario: Canonical viewport is used
- **WHEN** a scene browser viewport matches its selected fixed profile dimensions
- **THEN** profile geometry renders at 1:1 scale

#### Scenario: Noncanonical viewport is used
- **WHEN** a scene browser viewport has a different size or aspect ratio
- **THEN** the entire fixed profile remains visible without clipping or distortion
- **AND** unused viewport space remains transparent

### Requirement: Production Overlay Failures Render No Diagnostic Content
The production overlay SHALL fail closed with an empty transparent rendering tree when transport or internal rendering fails.

#### Scenario: Transport fails on a live route
- **WHEN** the live overlay cannot connect or receives an internal failure
- **THEN** no error message, reference, stack detail, or hidden diagnostic text is rendered in the overlay DOM
- **AND** operator diagnostics remain available through management or logs

### Requirement: Management Test Audio Can Be Activated In Place
Ordinary browser outputs SHALL apply the same transparent failure policy to manually submitted and subscribed events. They SHALL NOT expose an audio activation prompt or retain failed audio for an automatic later retry merely because event provenance is manual. Management SHALL explain required OBS/browser audio setup and allow an explicit new manual submission after correction. Local editor previews SHALL retain their own explicit audio activation controls without becoming a separate event output.

#### Scenario: Browser blocks manual-event audio
- **WHEN** a manually submitted event reaches ordinary output and audio playback requires user activation
- **THEN** that failed playback follows the existing transparent failure/report contract and renders no operator control on stream
- **AND** management reports the setup correction and an explicit new submission is required to play again

#### Scenario: Browser blocks subscribed-event audio
- **WHEN** subscribed event audio is rejected for the same reason
- **THEN** identical failure handling applies without an on-stream prompt or retained auto-retry

#### Scenario: Editor preview needs activation
- **WHEN** the operator enables audio in a local editor preview
- **THEN** the preview's explicit gesture may activate its local playback without publishing a bus event or sending device audio

### Requirement: Overlay Playback Failures Retain Stage And Cause Off Stream
The browser-source overlay SHALL report a bounded structured exception, stable reference and exact playback stage through its authenticated connection before failed content is removed, while rendering no diagnostic content on stream. The server SHALL derive connection identity and target profile from the authorized registered client. Structured exception detail SHALL be available only in Raw logs and debug exports.

#### Scenario: Timed video preparation fails
- **WHEN** video source loading, metadata readiness, seeking or decoding fails during timed preparation
- **THEN** Raw logs identify the source-load, metadata, seek or decode stage and retain the redacted original cause
- **AND** the overlay remains transparent

#### Scenario: Browser rejects playback
- **WHEN** `play()` rejects during ordinary browser-output playback
- **THEN** Raw logs identify the play stage and retain the redacted rejection
- **AND** no stack, reference or diagnostic text is rendered in the production overlay DOM

#### Scenario: Overlay submits untrusted route identity
- **WHEN** a failure payload attempts to supply client or target-profile identity
- **THEN** the server ignores that identity and uses the authorized connection registration

#### Scenario: Failure payload is malformed or oversized
- **WHEN** an overlay submits exception data outside the strict schema or size bounds
- **THEN** the server rejects it without persisting attacker-controlled unbounded content
