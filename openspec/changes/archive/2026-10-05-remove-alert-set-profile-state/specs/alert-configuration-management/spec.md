## MODIFIED Requirements

### Requirement: Alert Test Workflow Uses Real Matching Path

The system SHALL provide separate editor Preview and Test draft workflows: Preview renders the selected draft alert locally from sample data, while Test draft sends normalized test playback through the same downstream browser and device delivery paths used after real event matching. Alert inventory SHALL provide a corresponding Test saved workflow for the saved alert document. Saved visual targets SHALL come from enabled and reviewed profiles on that document; availability SHALL be checked per destination rather than by alert-set profile state or a required browser connection.

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

### Requirement: Alert Sets Are Fully Managed

The system SHALL allow authorized management users to create, rename, duplicate, save, activate, validate, and delete alert sets while enforcing exactly one active set and retaining at least one set. Alert-set summaries and activation SHALL derive target-profile usage from saved alert documents and SHALL NOT maintain separate set-level profile enablement or review state.

#### Scenario: Inactive valid set is activated

- **WHEN** a management user activates an inactive set with no relevant blockers and at least one enabled alert has an enabled and reviewed target profile
- **THEN** that set becomes the only active set
- **AND** the previous active set remains saved but inactive

#### Scenario: Set has no playable enabled alert profile

- **WHEN** no enabled saved alert has an enabled and reviewed target profile
- **THEN** activation is unavailable
- **AND** the validation summary directs the user to enable and review a profile on an alert

#### Scenario: Activation blockers prevent runtime change

- **WHEN** validation finds a global blocker or a blocker for a profile used by an enabled alert in the selected set
- **THEN** activation is unavailable
- **AND** the validation summary links each blocker to its target profile, event type, and alert correction context

#### Scenario: Saving active-set changes reports live impact

- **WHEN** a user saves changes that affect enabled live outputs in the active set
- **THEN** the system names affected target profiles derived from saved alerts and affected event types before applying the save

#### Scenario: Active or only set cannot be deleted directly

- **WHEN** a user requests deletion of the active set or the only remaining set
- **THEN** deletion is blocked
- **AND** the system offers the applicable activate-another-set or reset-default recovery path

#### Scenario: Alert sets use a compact expandable hierarchy

- **WHEN** a management user opens the Alerts module
- **THEN** alert sets appear as full-width expandable rows with activation, rename, duplicate, and delete actions inline
- **AND** module-level Browser sources are outside the Alert sets region
- **AND** expanding the selected set reveals its alerts with Edit, Test saved, and Enable/Disable actions inline
- **AND** no separate selected-set overview panel is required

#### Scenario: Validation rolls up without duplicating details

- **WHEN** an alert or set has validation blockers, warnings, or review-required state
- **THEN** the affected alert row shows the applicable severity and count
- **AND** the alert-set row derives rolled-up counts from its alerts while they are collapsed
- **AND** only enabled saved profiles contribute profile-review counts, with the same rollup before and after set details load
- **AND** opening an affected alert shows the full messages and correction steps in the focused editor
