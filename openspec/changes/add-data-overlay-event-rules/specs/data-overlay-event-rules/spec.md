## ADDED Requirements

### Requirement: Data overlays consume the central event bus
Data overlays SHALL receive events only as a consumer of the central event bus and SHALL NOT open event intake of their own. The consumer SHALL use the bus's transactional checkpoint to commit each event's value changes and its cursor in one transaction, and SHALL opt out of replay expiry.

#### Scenario: Crash after commit
- **WHEN** the app crashes after a subscription's value change commits
- **THEN** after restart the consumer resumes past that event and the counter is not increased again

#### Scenario: Crash before commit
- **WHEN** the app crashes before a subscription's value change commits
- **THEN** after restart the consumer replays the event from the journal and the counter increases once

#### Scenario: Long outage
- **WHEN** the app stays stopped for an hour after journaling a subscription the consumer has not processed
- **THEN** after restart the subscription still applies once, because the data consumer does not expire replays

#### Scenario: New consumer
- **WHEN** data rules are first enabled on a profile with an existing event journal
- **THEN** past journal events are not applied

### Requirement: Rule actions
A data rule SHALL select a canonical event type through the shared bus selector or a custom event type, MAY add up to 8 AND payload filters on custom event fields, and SHALL specify a destination value, an action of set, add, subtract or reset, and an input that is a typed constant or an event field with an optional integer multiplier. Rules SHALL be validated when saved and SHALL NOT contain executable expressions.

#### Scenario: Text field into an integer add
- **WHEN** a user saves a rule that adds a text field to an integer value
- **THEN** saving fails with an actionable validation error

#### Scenario: Field multiplier
- **WHEN** a cheer with amount 500 reaches a rule that adds `amount` × 1 to a bits value at 1000
- **THEN** the bits value becomes 1500

### Requirement: Deterministic all-or-nothing evaluation
Matching rules for one event SHALL run in persisted order, with ties broken by rule ID. If any effect is invalid, no effect SHALL apply, a diagnostic with a reference ID SHALL be recorded, and the consumer SHALL advance past the event.

#### Scenario: Second rule overflows
- **WHEN** an event matches two rules and the second would overflow its value
- **THEN** neither value changes, Management shows the failure reference, and later events still apply

### Requirement: Rules run independently of display
Enabled rules SHALL apply whether or not any canvas is visible and whether or not the module is enabled.

#### Scenario: Counting while hidden
- **WHEN** a matching custom death event arrives while every canvas is hidden
- **THEN** the death counter increases and a canvas shown later displays the new count

### Requirement: Payload filters stay in the consumer
Filters on external event payload fields SHALL be evaluated by the data consumer after schema validation, and SHALL NOT be expressed as bus selector conditions.

#### Scenario: Filter on a custom field
- **WHEN** a rule adds one to "lava deaths" only when `weapon` equals "lava", and a `game.death` event arrives with `weapon` "fall"
- **THEN** the bus delivers the event to the data consumer, and the consumer's filter leaves "lava deaths" unchanged

### Requirement: Subscription starters
The default received-subs starter SHALL count `subscription`, including Prime, and `gift_subscription` once each, and SHALL exclude `resubscription` and `community_gift`. The gift-batch starter SHALL count `community_gift` amounts and exclude `gift_subscription`. A value SHALL NOT have both starters. Management SHALL warn when custom rules overlap a starter.

#### Scenario: Gift batch with recipients
- **WHEN** a five-gift batch and its five recipient events reach the received-subs starter
- **THEN** the count increases by 5

#### Scenario: Resubscription
- **WHEN** a resubscription reaches the received-subs starter
- **THEN** the count is unchanged

### Requirement: Moderated event text
Text written to a value from an event field SHALL pass rendered-text moderation before it is stored.

#### Scenario: Blocked username
- **WHEN** a follow from a username containing a blocked term updates a latest-follower value
- **THEN** the stored and displayed text has the term replaced

### Requirement: Reset on stream online
A reset group MAY opt into reset on stream online. Each canonical `stream_online` bus event SHALL then reset that group once.

#### Scenario: New stream starts
- **WHEN** a `stream_online` event arrives for a group that opted in
- **THEN** every member value returns to its reset default

### Requirement: Operator pause for automatic updates
The Operator Data section SHALL provide a persisted toggle that pauses data rules. While paused, the consumer SHALL advance past events without applying them, and manual Operator controls SHALL keep working.

#### Scenario: Pause during testing
- **WHEN** automatic updates are paused and a follow arrives
- **THEN** the follower counter is unchanged, and the operator can still press +1

#### Scenario: Resume
- **WHEN** automatic updates resume after follows arrived during the pause
- **THEN** those follows are not applied retroactively

### Requirement: Rule editor
Management SHALL provide a rule editor built on the shared selector editor, with payload filters for custom event types, adding destination, action and input controls, explicit enablement, visible evaluation order and simulation against the preview store. Simulation SHALL NOT change live values or the consumer checkpoint.

#### Scenario: Simulate a rule
- **WHEN** the user simulates a sample cheer against a rule
- **THEN** only the preview value changes
