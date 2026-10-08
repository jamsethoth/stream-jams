## ADDED Requirements

### Requirement: Streamer.bot global-variable values
A user SHALL be able to map a persisted Streamer.bot global variable to a read-only integer or text value. The system SHALL snapshot it on connect and reconnect, apply updates from global-variable update events, mark the source stale on disconnect, and mark it ended when the variable is deleted. Updates for unmapped variables SHALL be ignored.

#### Scenario: Variable changes in Streamer.bot
- **WHEN** a mapped global changes from 3 to 4 in Streamer.bot
- **THEN** the mapped value becomes 4 on every output

#### Scenario: Reconnect after missed updates
- **WHEN** Streamer.bot reconnects after the global changed while disconnected
- **THEN** the snapshot replaces the stale value

#### Scenario: Type mismatch
- **WHEN** a global mapped to an integer value receives text
- **THEN** the value keeps its last good content and the source reports an error

### Requirement: Provider-backed values are read-only
Values backed by a Streamer.bot global SHALL reject manual and rule writes. A user SHALL be able to copy their current content into a custom value.

#### Scenario: Pinned in Operator
- **WHEN** a provider-backed value is pinned in Operator
- **THEN** it shows its content without +1, −1, set or reset controls
