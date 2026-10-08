## ADDED Requirements

### Requirement: Operator value controls
The Operator panel SHALL show a Data section that lists the values pinned in Management with their current content. Integer values SHALL offer +1, −1, set and reset. Text values SHALL offer set and reset. Controls SHALL use the existing Operator authorization and CSRF boundary. Management SHALL NOT offer live value controls.

#### Scenario: Increment from Operator
- **WHEN** the operator presses +1 on a pinned counter at 4
- **THEN** the counter becomes 5 and every output showing it updates

#### Scenario: Unpinned value
- **WHEN** a value is not pinned in Management
- **THEN** it does not appear in the Operator Data section

### Requirement: Confirmed destructive actions
Value reset and group reset in Operator SHALL require an explicit confirmation step before applying.

#### Scenario: Cancelled reset
- **WHEN** the operator starts a reset and cancels the confirmation
- **THEN** the value is unchanged

### Requirement: Retained correction input
A failed set from Operator SHALL keep the entered value for retry and announce an actionable error. A conflict SHALL show the refreshed current content.

#### Scenario: Set conflicts with a newer change
- **WHEN** the operator's set conflicts because the value changed meanwhile
- **THEN** the entered value stays in the field and the current content is shown beside it

### Requirement: Operator group reset
The Operator Data section SHALL offer a reset action for each reset group that has at least one member.

#### Scenario: Reset the session group
- **WHEN** the operator confirms reset on the "Session" group
- **THEN** every member value returns to its reset default in one update

### Requirement: Operator canvas visibility
The Operator Data section SHALL offer a show/hide toggle for each canvas. Hiding SHALL affect display only.

#### Scenario: Hide a canvas live
- **WHEN** the operator hides a canvas during a stream
- **THEN** it disappears from the browser source and the desktop overlay, and its values are unchanged

### Requirement: Accessible compact controls
Data controls SHALL have accessible names and hover titles when shown as icons, SHALL be keyboard operable, and SHALL fit the existing compact Operator layout at 540 x 960 without horizontal scrolling.

#### Scenario: Small workspace
- **WHEN** the operator views three pinned values, one group and two canvases at 540 x 960
- **THEN** every control is reachable without horizontal scrolling
