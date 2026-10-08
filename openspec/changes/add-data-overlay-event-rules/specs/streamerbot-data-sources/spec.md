## ADDED Requirements

### Requirement: Shared custom-broadcast dispatch
Streamer.bot `General/Custom` broadcasts SHALL be dispatched by payload marker. `source: "StreamJams", type: "VideoShoutout"` SHALL go to video shoutouts and `source: "StreamJams", type: "Data"` to data rules. Unmarked broadcasts SHALL continue to normal ingestion.

#### Scenario: Video shoutout still works
- **WHEN** a video shoutout broadcast arrives after data sources are added
- **THEN** it is handled by video shoutouts exactly as before

### Requirement: Custom event types
Management SHALL define custom event types with a stable ID, a name, a schema version and up to 32 flat fields typed integer, text or boolean, each required or optional. Data broadcasts SHALL be rejected when the event name is unknown, a field is unknown or missing, a type is wrong, the version is unsupported, the message exceeds 16 KiB, or a text field exceeds 2 KiB. Rejections SHALL record a sanitized diagnostic without the payload.

#### Scenario: Valid custom event
- **WHEN** Streamer.bot broadcasts a `game.death` data event matching its schema
- **THEN** matching rules apply

#### Scenario: Unknown field
- **WHEN** a data broadcast includes a field the schema does not define
- **THEN** no rule applies and Management shows a validation diagnostic

### Requirement: Schema changes disable dependent rules
Changing a custom event type's schema SHALL disable the rules that use it until each is re-validated and re-enabled.

#### Scenario: Field removed
- **WHEN** a user removes a field that a rule filters on
- **THEN** that rule is disabled and flagged for review

### Requirement: Optional custom event IDs
A data broadcast MAY carry an `eventId`. When present, it SHALL be deduplicated through the applied-event log. When absent, each broadcast SHALL apply.

#### Scenario: Broadcast without ID
- **WHEN** the same broadcast without an `eventId` arrives twice
- **THEN** it applies twice

#### Scenario: Repeated ID
- **WHEN** two broadcasts carry the same `eventId`
- **THEN** only the first applies

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

#### Scenario: Operator tries to edit
- **WHEN** a provider-backed value is pinned in Operator
- **THEN** it shows its content without +1, −1, set or reset controls
