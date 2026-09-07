## ADDED Requirements

### Requirement: Desktop Close Preference Round Trips
Portable configuration SHALL include the non-secret desktop close-to-tray preference, default an omitted preference to true, and preserve the destination's original value during failed-restore rollback. Restoring the preference SHALL NOT itself close a window or terminate a service.

#### Scenario: Older configuration omits desktop preferences
- **WHEN** otherwise compatible configuration without a desktop section is parsed
- **THEN** close-to-tray defaults to true without invalidating other configuration

#### Scenario: Desktop preference is restored
- **WHEN** a compatible backup with close-to-tray disabled is restored successfully
- **THEN** the persisted preference is disabled and the running desktop host adopts it for the next window-close decision

#### Scenario: Restore fails after preference replacement
- **WHEN** configuration replacement fails after changing desktop preferences
- **THEN** rollback restores the original preference and the running host receives the restored value
