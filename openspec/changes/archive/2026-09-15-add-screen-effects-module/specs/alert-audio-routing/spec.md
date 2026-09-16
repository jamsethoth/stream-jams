## MODIFIED Requirements

### Requirement: Named Routes Bind Explicit Local Devices
Authorized management users SHALL create, rename, bind, inspect, explicitly test and delete reusable named routes. Bindings SHALL identify enumerated output devices rather than inferred labels or automatic default/communications aliases.

#### Scenario: Route is saved
- **WHEN** a valid unique name and enumerated explicit device ID are saved
- **THEN** a stable route ID and its binding persist across app restart

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
