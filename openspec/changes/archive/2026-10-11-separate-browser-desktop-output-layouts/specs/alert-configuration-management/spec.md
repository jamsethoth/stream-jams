## MODIFIED Requirements

### Requirement: Alert Test Workflow Uses Real Matching Path

The system SHALL provide separate editor Preview and Test draft workflows: Preview renders the selected draft alert locally from sample data, while Test draft publishes a validated typed manual event through the central bus and ordinary admission/browser/device paths. Draft payloads and media references are validated before journaling; manual provenance is separate from normal output identity. Alert inventory SHALL provide a corresponding Test saved workflow for the saved alert document. Saved visual targets SHALL come from enabled and reviewed profiles on that document; availability SHALL be checked per destination rather than by alert-set profile state or a required browser connection.

#### Scenario: Preview works without provider or overlay connection

- **WHEN** a management user previews an alert with a built-in or session-edited sample payload
- **THEN** the canvas renders the selected alert and target profile without calling a provider or requiring an overlay client
- **AND** audio and TTS remain muted unless explicitly enabled for preview
- **AND** preview does not dispatch sound to configured live device routes

#### Scenario: Test alert reaches connected selected output

- **WHEN** a management user sends a test for a connected valid enabled and reviewed target profile
- **THEN** the bus consumer admits normalized manual playback for the selected alert and ordinary output
- **AND** configured audio and TTS are included by default unless the user explicitly disables them for the editor session
- **AND** explicit audio follows the alert's output selection, including any available selected device routes
- **AND** logs and history distinguish the item as manually submitted data

#### Scenario: Completed test playback leaves the overlay

- **WHEN** a rendered test instruction reaches its configured duration or reports playback failure
- **THEN** the overlay reports the terminal playback state to the server
- **AND** the terminal instruction is removed from the rendered overlay without waiting for a server response

#### Scenario: Saved alert is tested from alert-set inventory

- **WHEN** a management user chooses Test saved from an alert row
- **THEN** the UI uses the saved alert document and its first built-in sample payload
- **AND** one enabled and reviewed saved target profile sends immediately while multiple enabled and reviewed saved profiles require an explicit target choice
- **AND** alert-set metadata and Browser Source connection state do not remove an enabled and reviewed saved profile from that choice
- **AND** when no visual profile is eligible but included device audio is deliverable, device-only testing is available without selecting a fictitious connected profile
- **AND** success names the delivered profile or device destinations and reference ID
- **AND** failure remains visible with a human-readable cause, next step, and reference ID

#### Scenario: Test send is blocked without connected output

- **WHEN** no browser or desktop visual recipient can receive the selected profile and no included audio layer has an available selected device destination
- **THEN** Test draft or Test saved does not enqueue playback
- **AND** the UI explains how to connect or choose an available output

#### Scenario: Device-only test does not require visual readiness

- **WHEN** included explicit audio has an available selected device destination but the selected visual profile is disconnected, disabled, or needs review
- **THEN** Test draft or Test saved can enqueue device audio without rendering or enabling that visual profile
- **AND** the result identifies the device delivery and any skipped visual destination

#### Scenario: Some selected destinations are unavailable

- **WHEN** a test has deliverable included content on at least one selected destination and other selected destinations are unavailable
- **THEN** healthy destinations receive the test and the result lists unavailable destinations
- **AND** no unavailable destination is replaced by an automatic fallback

#### Scenario: Audio inclusion is disabled

- **WHEN** an operator disables Include audio for the editor session
- **THEN** Test draft emits no explicit audio through either Browser Source or device routes
- **AND** visual and independently controlled TTS inclusion retain their existing semantics
