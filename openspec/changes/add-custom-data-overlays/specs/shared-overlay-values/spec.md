## ADDED Requirements

### Requirement: Shared typed value ownership
The system SHALL persist canvas-independent values with stable IDs, unique trimmed case-insensitive names, kind, reset default, typed content and revision. Supported kinds SHALL be safe integers, bounded finite decimal numbers, bounded plain text and supported fixed-currency money in integer minor units. Type/currency changes SHALL require explicit replacement and rebinding. Provider measurements SHALL be read-only; custom values SHALL accept authorized manual or input updates.

#### Scenario: Shared value updates multiple layouts
- **WHEN** an accepted update changes a value referenced on two canvases
- **THEN** both display the committed value and neither maintains its own count

#### Scenario: Invalid arithmetic or currency
- **WHEN** a mutation overflows, supplies non-finite data, coerces text to a number, or uses a different currency
- **THEN** it is rejected without changing content or revision

### Requirement: Persistent manual-reset lifecycle
Values and goal baselines SHALL survive restart. Reset SHALL write the configured default through a guarded explicit action. Restart, reconnect, canvas visibility, module enablement, template use and stream lifecycle events SHALL NOT implicitly reset data. Automatic reset scheduling SHALL be outside this change.

#### Scenario: Restart and manual reset
- **WHEN** a counter at 37 restarts and the operator later explicitly resets it to its saved default of 0
- **THEN** restart first restores 37 and the explicit reset subsequently updates every referencing canvas to 0

### Requirement: Independent compatible goals
Goals SHALL reference numeric or money values independently of canvases and SHALL support fixed-target and saved-baseline modes with compatible units, valid positive progress ranges, clamped visual fill, nonnegative remaining amount and preserved raw values. Saved-baseline goal restart SHALL capture a new baseline without resetting the referenced value. Provider-owned goals SHALL retain provider targets and units and reject manual edits/resets. Completion SHALL NOT automatically reset or trigger playback.

#### Scenario: Additional follower goal
- **WHEN** a custom goal starts from 950 with an additional target of 50 and the value becomes 970
- **THEN** achieved progress is 20 of 50, remaining is 30, and the underlying value remains 970

#### Scenario: Decrease and over-target
- **WHEN** the value drops below baseline or rises above target
- **THEN** fill clamps to zero or full respectively, while raw value remains available and remaining never becomes negative

### Requirement: Reference-safe lifecycle
Renaming a value/goal SHALL preserve references. Deletion of referenced data SHALL be rejected with an impact list until users explicitly remove/rebind its dependents. Canvas deletion SHALL NOT delete values/goals. Draft editing SHALL NOT modify live content before explicit apply.

#### Scenario: Delete shared data
- **WHEN** the user deletes a referenced value or deletes one of its canvases
- **THEN** value deletion is blocked with dependent references, while canvas deletion retains the value and its other references

### Requirement: Source freshness without visible diagnostics
Management SHALL show source status, last update, sanitized failure references and whether a count represents received events or authoritative state. Bound elements SHALL use retain-last or hide stale policy, defaulting to hide for provider measurements and retain-last for custom saved values. Unresolved or unauthorized bindings SHALL always hide on production output; operational diagnostics SHALL remain management-only.

#### Scenario: Provider disconnects
- **WHEN** an authoritative source loses readiness
- **THEN** management identifies stale data and output follows the saved stale policy without rendering diagnostic text
