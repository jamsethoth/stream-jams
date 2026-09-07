## MODIFIED Requirements

### Requirement: Management Presents Module Profile Browser Sources In Context

The system SHALL present browser-source outputs inside the owning module, grouped by fixed target profile, with configuration readiness as the primary status, profile enablement, secondary connection telemetry, masked URL, and explicit reveal, copy, regenerate, and test actions. Device-audio destinations SHALL NOT require additional browser-source URLs or alter browser-source readiness.

#### Scenario: Alert set shows landscape and vertical outputs

- **WHEN** a management user opens the selected alert set
- **THEN** the Browser sources section shows landscape and vertical module outputs with primary `Ready` or `Needs setup` status
- **AND** each output shows whether its target profile is enabled in the selected set
- **AND** only the live output for each target profile is presented
- **AND** no top-level Overlays page is required

#### Scenario: Browser sources remain compact and module-scoped

- **WHEN** a management user opens the Alerts module
- **THEN** Browser sources appears as a compact sibling section above and outside alert-set management
- **AND** the section is collapsed by default with readiness and stale-refresh rollups visible
- **AND** expanding the section reveals landscape and vertical readiness, listening telemetry, and URL actions
- **AND** a deep link to Browser sources expands the section before scrolling it into view
- **AND** each profile keeps readiness, listening telemetry, and URL actions without requiring a large card or selected-set detail panel

#### Scenario: Connection telemetry refreshes without becoming configuration state

- **WHEN** a management user keeps the selected alert set open
- **THEN** the system refreshes `Listening now`, `Not listening`, and last-seen telemetry at least every five seconds without a page reload
- **AND** the readiness badge remains derived from route-key URL availability rather than current listeners
- **AND** a refresh failure retains the last known telemetry, marks it stale, and shows an actionable error with a reference ID when available

#### Scenario: Test send reuses the profile browser source

- **WHEN** a management user sends test content to a valid enabled and reviewed target profile with a connected browser recipient
- **THEN** the browser portion of test playback is delivered to that profile's live browser source
- **AND** no separate test browser-source URL, key, or setup step is presented

#### Scenario: Device-only test needs no new browser source

- **WHEN** an alert test delivers only to selected local device routes
- **THEN** the system does not create a browser-source URL or claim an existing browser profile is connected

#### Scenario: Included audio cannot start in the browser source

- **WHEN** a delivered alert includes audio and the browser rejects audio playback
- **THEN** the overlay fails that instruction closed without leaving stale output visible
- **AND** the failed playback report gives the operator a human-readable cause and next step
- **AND** independent healthy device recipients are not cancelled solely because that browser recipient failed

#### Scenario: Route key remains masked until reveal

- **WHEN** an output URL is displayed
- **THEN** the route-key portion is masked by default
- **AND** reveal is temporary and is not persisted

#### Scenario: Copy operation reports its result

- **WHEN** a user copies an output URL
- **THEN** the system gives immediate success feedback or an actionable failure with a next step and reference ID when available
