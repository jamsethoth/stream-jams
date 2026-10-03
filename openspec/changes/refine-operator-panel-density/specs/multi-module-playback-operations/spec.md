## ADDED Requirements

### Requirement: Responsive compact Operator panel
The Operator panel SHALL remain usable at 540 x 960 with compact rows and controls, SHALL expand dynamically at wider sizes, and SHALL wrap and allow natural vertical scrolling at narrower sizes or with larger inventories without horizontal page overflow. Playback ownership, status, queue position, received time, and all existing actions SHALL remain available.

#### Scenario: Representative small workspace
- **WHEN** an operator views one active timer, two current items, two module queues, two pending items, and one recent item at 540 x 960
- **THEN** the primary actions for each section fit within the viewport without horizontal scrolling
- **AND** playback rows use compact metadata instead of vertically stacked labeled columns

#### Scenario: Narrower workspace
- **WHEN** the viewport narrows to 390 pixels
- **THEN** controls remain reachable with wrapping and vertical scrolling without horizontal page overflow

### Requirement: Compact accessible timer actions
Timer pause, resume, restart, and stop SHALL have accessible names and hover titles when represented by icons. Manual add, subtract, and set adjustments SHALL be accessible through an expandable keyboard-operable control that retains entered values after a failed request.

#### Scenario: Expand and retry a timer correction
- **WHEN** the operator expands Adjust time and a correction fails
- **THEN** the entered correction remains available for retry alongside actionable error feedback

#### Scenario: Timer icon controls
- **WHEN** a running or paused timer appears in the panel
- **THEN** its applicable pause or resume control, restart control, and stop control have explicit accessible names
