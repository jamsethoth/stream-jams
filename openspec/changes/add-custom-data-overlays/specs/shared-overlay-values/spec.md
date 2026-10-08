## ADDED Requirements

### Requirement: Shared typed values
The system SHALL persist canvas-independent values with a stable ID, a unique name compared case-insensitively after trimming, a kind of `integer` or `text`, a reset default, current content and a revision. Integer content SHALL stay within the JavaScript safe-integer range. Text content SHALL be plain text of at most 2 KiB. A value's kind SHALL NOT change after creation.

#### Scenario: One value on two canvases
- **WHEN** a value referenced by two canvases changes
- **THEN** both canvases show the new committed content

#### Scenario: Integer overflow
- **WHEN** an add would move an integer value outside the safe-integer range
- **THEN** the change is rejected and the content and revision are unchanged

#### Scenario: Text coerced to a number
- **WHEN** a set supplies text for an integer value
- **THEN** the change is rejected and the content and revision are unchanged

#### Scenario: Duplicate name
- **WHEN** a user creates a value named " Deaths " while a value named "deaths" exists
- **THEN** creation fails with a name-conflict error

### Requirement: Values persist without implicit resets
Values and goal baselines SHALL survive restart. Restart, module disablement, canvas hiding, canvas deletion and global output pause SHALL NOT change any value.

#### Scenario: Restart restores the count
- **WHEN** the app restarts while a counter holds 37
- **THEN** the counter still holds 37 after startup

#### Scenario: Hidden canvas keeps its value
- **WHEN** the only canvas showing a value is hidden and later shown
- **THEN** the value is unchanged

### Requirement: Guarded value changes
The system SHALL support set, add, subtract and reset on integer values, and set and reset on text values. Set SHALL require the expected revision and SHALL fail with a conflict when it differs. Add and subtract SHALL NOT require a revision. Reset SHALL write the configured reset default.

#### Scenario: Stale set
- **WHEN** a set carries revision 4 while the value is at revision 5
- **THEN** the set fails with a conflict and the content is unchanged

#### Scenario: Concurrent increments
- **WHEN** two add-one requests arrive together for a value at 10
- **THEN** the value becomes 12

#### Scenario: Reset to default
- **WHEN** a value with reset default 0 and content 37 is reset
- **THEN** its content becomes 0 and every referencing canvas shows 0

### Requirement: Goals over integer values
A goal SHALL reference one integer value and use fixed-target or saved-baseline mode. A saved-baseline goal SHALL store its baseline and additional amount, with the target equal to their sum. The goal projection SHALL expose current, baseline, target, achieved, remaining, percentage, completed and fill. Remaining SHALL NOT go below zero, and fill SHALL be clamped to 0..1, while the raw value stays unclamped.

#### Scenario: Saved-baseline progress
- **WHEN** a goal has baseline 950 and additional amount 50, and the value becomes 970
- **THEN** achieved is 20, remaining is 30, the target is 1000, and the value is 970

#### Scenario: Value below baseline
- **WHEN** the value drops below the goal's baseline
- **THEN** fill is 0 and remaining equals the full additional amount

#### Scenario: Value over target
- **WHEN** the value rises above the target
- **THEN** fill is 1, remaining is 0, completed is true, and the raw value is preserved

### Requirement: Restarting a saved-baseline goal
Restarting a saved-baseline goal SHALL capture the current value as the new baseline and recompute the target from the stored additional amount, without changing the value. Goal completion SHALL NOT reset anything or trigger playback.

#### Scenario: Restart after completion
- **WHEN** a goal with additional amount 50 completes at value 1003 and is restarted
- **THEN** the baseline becomes 1003, the target becomes 1053, and the value stays 1003

### Requirement: Reset groups
A value SHALL belong to at most one reset group. Resetting a group SHALL write every member's reset default and restart every saved-baseline goal over a member, in one transaction with one revision change.

#### Scenario: Reset a session group
- **WHEN** the "Session" group with three counters is reset
- **THEN** all three counters hold their reset defaults and outputs receive one update

#### Scenario: Group reset fails
- **WHEN** writing one member fails during a group reset
- **THEN** no member changes

### Requirement: Reference-safe lifecycle
Renaming a value or goal SHALL preserve references. Deleting a value or goal that a goal, canvas element or Operator pin references SHALL be rejected with a list of those references. Deleting a canvas SHALL NOT delete values or goals.

#### Scenario: Delete a referenced value
- **WHEN** the user deletes a value that a canvas element references
- **THEN** deletion is rejected and the referencing elements are listed

#### Scenario: Delete a canvas
- **WHEN** the user deletes one of two canvases that show a value
- **THEN** the value remains and the other canvas still shows it
