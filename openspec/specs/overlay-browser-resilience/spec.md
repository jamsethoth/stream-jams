# overlay-browser-resilience Specification

## Purpose
TBD - created by archiving change improve-management-ui-ux-audit-followups. Update Purpose after archive.
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
