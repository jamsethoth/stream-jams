## ADDED Requirements

### Requirement: Management Presents Module Profile Browser Sources In Context

The system SHALL present browser-source outputs inside the owning module, grouped by fixed target profile, with configuration readiness as the primary status, profile enablement, secondary connection telemetry, masked URL, and explicit reveal, copy, regenerate, and test actions.

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

- **WHEN** a management user sends a test alert to a target profile
- **THEN** the test playback is delivered to that profile's live browser source
- **AND** no separate test browser-source URL, key, or setup step is presented

#### Scenario: Included audio cannot start in the browser source

- **WHEN** a delivered alert includes audio and the browser rejects audio playback
- **THEN** the overlay fails that instruction closed without leaving stale output visible
- **AND** the failed playback report gives the operator a human-readable cause and next step

#### Scenario: Route key remains masked until reveal

- **WHEN** an output URL is displayed
- **THEN** the route-key portion is masked by default
- **AND** reveal is temporary and is not persisted

#### Scenario: Copy operation reports its result

- **WHEN** a user copies an output URL
- **THEN** the system gives immediate success feedback or an actionable failure with a next step and reference ID when available

## MODIFIED Requirements

### Requirement: Management Can Create And Regenerate Route Keys

The system SHALL allow authorized management users to create or regenerate unguessable route keys for individual overlay outputs and SHALL require an impact-aware confirmation before invalidating an existing key.

#### Scenario: Route key is created

- **WHEN** an authorized management user creates a route key for a module target-profile live output
- **THEN** the system stores a protected verifier for authorization, stores the route key encrypted at rest for management recovery, and returns a copyable browser-source URL for that output

#### Scenario: Unused route key is regenerated

- **WHEN** an authorized management user confirms regeneration for an output that has never connected
- **THEN** every previously active key for the same overlay, scope, module, target profile, and purpose no longer authorizes overlay HTTP or WebSocket access
- **AND** the new key is stored with a protected verifier and encrypted recoverable value

#### Scenario: Connected route key requires typed confirmation

- **WHEN** a user requests regeneration for an output that is connected or was recently connected
- **THEN** the system shows affected profile, connection impact, OBS/browser-source update instructions, and recovery limits
- **AND** regeneration does not proceed until the required confirmation text is entered

### Requirement: Overlay Clients Are Visible To Management

The system SHALL allow authorized management users to view current and recent overlay browser-source client state by output and target profile.

#### Scenario: Connected client list is returned

- **WHEN** overlay clients are connected to module and unified WebSocket routes
- **THEN** the management client list shows each connected client with id, output scope, module id when applicable, target profile when applicable, purpose, connected time, last-seen time, and optional management-only user-agent metadata

#### Scenario: Recently disconnected output reports last connection

- **WHEN** an output has no current client but has prior connection metadata
- **THEN** management reports `Disconnected` and the last connected time without exposing route-key secrets
