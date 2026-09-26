## MODIFIED Requirements

### Requirement: Named Routes Bind Explicit Local Devices
Authorized management users SHALL create, rename, bind, inspect, explicitly test and delete reusable named routes. Bindings SHALL identify enumerated output devices rather than automatic default or communications aliases. Each route MAY separately opt in to following its exact saved device name. The server SHALL derive the saved label from the selected current inventory and SHALL NOT accept a client-authored label.

#### Scenario: Route is saved
- **WHEN** a valid unique name and enumerated explicit device ID are saved
- **THEN** a stable route ID, authoritative device label, binding and per-route consent persist across app restart

#### Scenario: Existing or new route has no consent
- **WHEN** an existing route is migrated or a new route is created without explicit automatic-follow consent
- **THEN** automatic following is disabled

#### Scenario: Route is unbound
- **WHEN** an operator clears a route's selected device
- **THEN** its device ID and label are cleared and automatic following is disabled

#### Scenario: Unknown route is assigned
- **WHEN** an alert or Screen Effect save references a nonexistent route ID
- **THEN** validation rejects the save without changing the prior document

#### Scenario: Referenced route deletion is attempted
- **WHEN** deletion targets a route referenced by saved alerts or Screen Effect variants
- **THEN** the server rejects it with a module-qualified affected-item list
- **AND** concurrent saves in either module cannot create a dangling reference during deletion

#### Scenario: Duplicate device aliases are selected
- **WHEN** two selected named routes resolve to the same explicit device ID
- **THEN** each audio layer plays once on that device rather than doubling its sound

#### Scenario: Route is rebound during playback
- **WHEN** a user confirms rebinding a route while one or more module occurrences are playing
- **THEN** every active occurrence keeps its original binding and future starts in either module use the new binding

### Requirement: Unavailable Devices Never Cause Unconsented Or Ambiguous Rerouting
The system SHALL fail closed for unavailable, disconnected or rejected device sinks. It SHALL NOT redirect audio to another device or Browser Source unless the route explicitly opted in and exactly one current device has a label equal to the authoritative saved label using case-sensitive equality. Recovery SHALL be persisted before use and SHALL apply only to future playback.

#### Scenario: Device is unplugged
- **WHEN** an active destination disappears
- **THEN** that destination stops and an actionable management warning is shown
- **AND** other healthy outputs continue without a fallback copy

#### Scenario: Opted-in device returns with a different ID
- **WHEN** a missing route opted in and exactly one current device has the exact saved label under a different ID
- **THEN** the replacement ID is persisted before the route becomes available
- **AND** only later occurrences use the replacement

#### Scenario: Exact saved name is absent or duplicated
- **WHEN** no current device or more than one current device has the exact saved label
- **THEN** the route remains unavailable with actionable absent-or-ambiguous guidance
- **AND** enumeration order, partial labels and default devices do not break the tie

#### Scenario: Consent is disabled
- **WHEN** a missing route has automatic following disabled
- **THEN** it requires an explicit manual rebind

#### Scenario: Automatic persistence fails
- **WHEN** an exact unique replacement is found but cannot be persisted
- **THEN** the old binding remains authoritative and unavailable
- **AND** the runtime does not use the inferred replacement ephemerally

#### Scenario: Manual mutation wins a race
- **WHEN** an operator rebinds or deletes a route while automatic enumeration is pending
- **THEN** stale reconciliation neither overwrites nor resurrects that route

#### Scenario: Player crashes and recovers
- **WHEN** the hidden player crashes
- **THEN** outstanding work fails and no interrupted audio is replayed on recreation
- **AND** automatic recreation is bounded to one attempt before explicit retry is required

#### Scenario: Owning service is lost
- **WHEN** the server exits, its IPC link closes, or its 10-second ownership lease expires
- **THEN** the desktop host stops local audio rather than continuing unsupervised playback
