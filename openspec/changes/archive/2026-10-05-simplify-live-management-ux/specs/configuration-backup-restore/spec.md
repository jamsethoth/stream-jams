## ADDED Requirements

### Requirement: Restore Disclosure Preserves Preflight Safety
The management UI SHALL expose backup selection and preflight clearly while rendering restore confirmation and regeneration controls only after a valid preflight.

#### Scenario: Backup preflight has not succeeded
- **WHEN** no backup has passed preflight or preflight reports a blocker
- **THEN** restore confirmation and regeneration controls are absent and the selection path or blocker remains visible

#### Scenario: Restore deep link opens
- **WHEN** Settings loads with the `#backup-restore` fragment
- **THEN** the native disclosure containing backup and restore is open and keyboard reachable
