## ADDED Requirements

### Requirement: Destructive Queue Confirmation Is Keyboard Safe
The operator surface SHALL present clear-pending confirmation through the shared modal interaction contract while preserving the named module, pending count, authoritative revision, busy state, and command failure recovery.

#### Scenario: Keyboard user opens clear confirmation
- **WHEN** a keyboard user activates Clear pending for a module
- **THEN** focus moves into the modal with Cancel initially focused
- **AND** Tab and Shift+Tab remain within the modal
- **AND** Escape or Cancel dismisses without issuing a clear command
- **AND** focus returns to the invoking control when it remains available

#### Scenario: Clear trigger is no longer available
- **WHEN** refresh removes or disables the invoking Clear pending control before the modal closes
- **THEN** dismissal restores focus to a stable heading for the relevant module
- **AND** focus does not fall back to the document body

#### Scenario: Clear pending is confirmed
- **WHEN** an operator confirms clearing a module queue
- **THEN** exactly one clear command uses that module's current count and revision
- **AND** stale or rejected commands show an actionable error without clearing another module or current playback

### Requirement: Current Playback Is Prioritized In Operator Layout
The operator surface SHALL place current module playback after connection, error, stale, and global safety controls and before per-module queue controls, while preserving module-qualified actions and queue order.

#### Scenario: Healthy populated phone layout is opened
- **WHEN** a healthy operator snapshot with current and pending items is rendered at 390 by 844 CSS pixels
- **THEN** the Now playing heading and first actionable Skip are visible without page scrolling
- **AND** current items remain clearly identified by module

#### Scenario: Multiple modules are playing
- **WHEN** two modules have simultaneous current occurrences
- **THEN** both current cards are visible without horizontal overflow at 1440 by 1000 CSS pixels
- **AND** each Skip command continues to target only its own occurrence and module

#### Scenario: Notices consume available space
- **WHEN** connection, stale, or actionable failure notices are present
- **THEN** those notices remain above current playback
- **AND** the healthy-fixture geometry requirement does not suppress or truncate them
