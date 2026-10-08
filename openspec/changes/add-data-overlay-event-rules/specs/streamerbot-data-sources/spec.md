## ADDED Requirements

### Requirement: Custom data event types
Management SHALL define custom event types with a stable ID, a name, a schema version and up to 32 flat fields typed integer, text or boolean, each required or optional. The data consumer SHALL accept external bus events with the identity `StreamJams`/`Data` and validate each payload against its event type.

#### Scenario: Valid custom event
- **WHEN** Streamer.bot broadcasts a `game.death` data event that matches its schema
- **THEN** matching rules apply

### Requirement: Invalid custom payloads are rejected
The data consumer SHALL reject a payload with an unknown event name, an unknown or missing required field, a wrong field type, an unsupported version or a text field over 2 KiB. A rejection SHALL change nothing, record a sanitized diagnostic without the payload, and advance the cursor.

#### Scenario: Unknown field
- **WHEN** a data broadcast includes a field the schema does not define
- **THEN** no rule applies, Management shows a validation diagnostic, and later events still apply

#### Scenario: Oversized text
- **WHEN** a text field in a data broadcast exceeds 2 KiB
- **THEN** the event is rejected without changing any value

### Requirement: Schema changes disable dependent rules
Changing a custom event type's schema SHALL disable the rules that use it until each is re-validated and re-enabled.

#### Scenario: Field removed
- **WHEN** a user removes a field that a rule filters on
- **THEN** that rule is disabled and flagged for review

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
