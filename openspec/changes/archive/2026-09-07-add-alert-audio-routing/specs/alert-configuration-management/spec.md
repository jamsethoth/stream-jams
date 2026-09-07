## MODIFIED Requirements

### Requirement: Alert Test Workflow Uses Real Matching Path

The system SHALL provide separate editor Preview and Send test workflows: Preview renders the selected saved-or-draft alert locally from sample data, while Send test sends normalized test playback through the same downstream browser and device delivery paths used after real event matching. Availability SHALL be checked per destination rather than requiring a browser connection for device-only audio.

#### Scenario: Preview works without provider or overlay connection

- **WHEN** a management user previews an alert with a built-in or session-edited sample payload
- **THEN** the canvas renders the selected alert and target profile without calling a provider or requiring an overlay client
- **AND** audio and TTS remain muted unless explicitly enabled for preview
- **AND** preview does not dispatch sound to configured live device routes

#### Scenario: Test alert reaches connected selected output

- **WHEN** a management user sends a test for a connected valid enabled and reviewed target profile
- **THEN** the system enqueues normalized test playback for the selected alert and output
- **AND** configured audio and TTS are included by default unless the user explicitly disables them for the editor session
- **AND** explicit audio follows the alert's output selection, including any available selected device routes
- **AND** logs and history distinguish the item as test data

#### Scenario: Completed test playback leaves the overlay

- **WHEN** a rendered test instruction reaches its configured duration or reports playback failure
- **THEN** the overlay reports the terminal playback state to the server
- **AND** the terminal instruction is removed from the rendered overlay without waiting for a server response

#### Scenario: Saved alert is tested from alert-set inventory

- **WHEN** a management user chooses Test from an alert row
- **THEN** the UI uses the saved alert document and its first built-in sample payload
- **AND** one available target profile sends immediately while multiple available profiles require an explicit target choice
- **AND** when no browser profile is available but included device audio is deliverable, device-only testing is available without selecting a fictitious connected profile
- **AND** success names the delivered profile or device destinations and reference ID
- **AND** failure remains visible with a human-readable cause, next step, and reference ID

#### Scenario: Test send is blocked without connected output

- **WHEN** no browser-source client can receive the selected profile and no included audio layer has an available selected device destination
- **THEN** Send test does not enqueue playback
- **AND** the UI explains how to connect or choose an available output

#### Scenario: Device-only test does not require visual readiness

- **WHEN** included explicit audio has an available selected device destination but the selected visual profile is disconnected, disabled, or needs review
- **THEN** Send test can enqueue device audio without rendering or enabling that visual profile
- **AND** the result identifies the device delivery and any skipped browser destination

#### Scenario: Some selected destinations are unavailable

- **WHEN** a test has deliverable included content on at least one selected destination and other selected destinations are unavailable
- **THEN** healthy destinations receive the test and the result lists unavailable destinations
- **AND** no unavailable destination is replaced by an automatic fallback

#### Scenario: Audio inclusion is disabled

- **WHEN** an operator disables Include audio for the editor session
- **THEN** Send test emits no explicit audio through either Browser Source or device routes
- **AND** visual and independently controlled TTS inclusion retain their existing semantics
