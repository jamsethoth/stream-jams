# overlay-output-management

## Purpose

Define management workflows for browser-source overlay outputs, recoverable route keys, and connected overlay client visibility while keeping overlay authorization separate from management authorization.
## Requirements
### Requirement: Management Can List Overlay Outputs

The system SHALL allow authorized management users to list module-specific and unified overlay outputs for live and test purposes.

#### Scenario: Output list includes module and unified entries

- **WHEN** an authorized management user requests overlay outputs
- **THEN** the system returns available module-specific and unified output records with type, purpose, enabled state, and copyable browser-source URLs when their encrypted route keys are recoverable

#### Scenario: Existing key can be copied after restart

- **WHEN** an authorized management user lists overlay outputs after the app restarts over the same local profile and secret store
- **THEN** active recoverable output keys are decrypted only for the management response and returned as full browser-source URLs

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

### Requirement: Route Key Secrets Are Recoverable Only Through Management

The system SHALL keep overlay route keys encrypted at rest and expose raw route keys only through management-authenticated URL responses.

#### Scenario: SQLite does not contain raw route keys

- **WHEN** overlay route keys have been created or regenerated
- **THEN** SQLite persistence contains authorization verifiers and encrypted secret references or payloads, but no plaintext `ovl_` route key values

#### Scenario: Recoverable key cannot be decrypted

- **WHEN** a stored overlay output has an active key whose encrypted route key cannot be decrypted
- **THEN** the management response does not expose a guessed or partial URL and indicates that regeneration is required

### Requirement: Management Can Revoke Route Keys

The system SHALL allow authorized management users to revoke overlay route keys without affecting unrelated outputs.

#### Scenario: Route key is revoked

- **WHEN** an authorized management user revokes a unified test output key
- **THEN** requests using that key are rejected and other live/test output keys continue to work

### Requirement: Overlay Clients Are Visible To Management

The system SHALL allow authorized management users to view current and recent overlay browser-source client state by output and target profile.

#### Scenario: Connected client list is returned

- **WHEN** overlay clients are connected to module and unified WebSocket routes
- **THEN** the management client list shows each connected client with id, output scope, module id when applicable, target profile when applicable, purpose, connected time, last-seen time, and optional management-only user-agent metadata

#### Scenario: Recently disconnected output reports last connection

- **WHEN** an output has no current client but has prior connection metadata
- **THEN** management reports `Disconnected` and the last connected time without exposing route-key secrets

### Requirement: Overlay Authorization Remains Separate

The system SHALL keep management APIs protected by management authorization and overlay routes protected only by scoped overlay keys.

#### Scenario: Overlay key cannot access management API

- **WHEN** a request presents a valid overlay route key to a management endpoint
- **THEN** the request is rejected as unauthorized for management access

### Requirement: Overlay Key Verification Is Exact And Deterministic

The system SHALL store a unique protected verifier for each overlay route key and SHALL begin authorization with an exact verifier lookup before applying output scope and revocation checks.

#### Scenario: Exact active key is presented

- **WHEN** an overlay request presents a route key whose verifier matches one active stored row and whose output fields match the route
- **THEN** authorization succeeds for that output only

#### Scenario: Historical revoked key is presented

- **WHEN** an overlay request presents a previously valid verifier whose row is revoked
- **THEN** authorization is rejected
- **AND** unrelated active output keys continue to authorize their own outputs

#### Scenario: Key belongs to another output

- **WHEN** an exact verifier exists but its scope, module, target profile, purpose, or overlay ID differs from the requested output
- **THEN** authorization is rejected with the existing non-secret denial behavior

#### Scenario: Duplicate verifier is persisted

- **WHEN** persistence attempts to store a key hash already used by another overlay key row
- **THEN** SQLite rejects the duplicate

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

### Requirement: Browser-Source Setup Shows Required Profile Dimensions
The management UI SHALL show the required width and height for every browser-source target profile together with concise manual setup guidance.

#### Scenario: Landscape source is ready
- **WHEN** a user expands the Landscape browser-source row
- **THEN** the row shows `1920 x 1080` and explains that the copied URL is added as a browser source

#### Scenario: Vertical source is ready
- **WHEN** a user expands the Vertical browser-source row
- **THEN** the row shows `1080 x 1920` and explains that the copied URL is added as a browser source

### Requirement: Revealed Route Keys Can Be Re-Masked
The management UI SHALL let a user hide a revealed browser-source URL without reloading or changing its route key.

#### Scenario: User hides revealed URL
- **WHEN** a browser-source URL is currently revealed and the user activates Hide
- **THEN** the same URL is immediately masked
- **AND** no server mutation or route-key regeneration occurs

### Requirement: Browser-Source Summary Shows Only Applicable Setup States
The collapsed browser-source summary SHALL omit setup warnings whose count is zero.

#### Scenario: Every browser-source URL is available
- **WHEN** every target profile has an available browser-source URL
- **THEN** the collapsed summary shows the ready count
- **AND** it does not show a zero-value `needs setup` warning
