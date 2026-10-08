## ADDED Requirements

### Requirement: Typed update rules
Management SHALL configure rules that select a source and event type, up to 8 AND filters, a destination value, an action of set, add, subtract or reset, and an input that is a typed constant or an event field with an optional integer multiplier. Rules SHALL be validated when saved and SHALL NOT contain executable expressions.

#### Scenario: Text field into an integer add
- **WHEN** a user saves a rule that adds a text field to an integer value
- **THEN** saving fails with an actionable validation error

#### Scenario: Field multiplier
- **WHEN** a cheer event with amount 500 reaches a rule that adds `amount` × 1 to a bits value at 1000
- **THEN** the bits value becomes 1500

### Requirement: Deterministic all-or-nothing evaluation
Matching rules for one event SHALL run in persisted order with ties broken by rule ID. All effects of one event and its applied-event record SHALL commit in one transaction. If any effect is invalid, no effect SHALL apply and a diagnostic with a reference ID SHALL be recorded.

#### Scenario: Second rule overflows
- **WHEN** an event matches two rules and the second would overflow its value
- **THEN** neither value changes and Management shows the failure reference

### Requirement: Rules run independently of display
Enabled rules SHALL apply whether or not any canvas is visible and whether or not the module is enabled. A data rule failure SHALL NOT affect alert, timer or video-shoutout handling of the same event.

#### Scenario: Counting while hidden
- **WHEN** a matching death event arrives while every canvas is hidden
- **THEN** the death counter increases, and a canvas shown later displays the new count

#### Scenario: Data failure during an alert
- **WHEN** a follow event triggers an alert and a data rule for it fails
- **THEN** the alert plays normally

### Requirement: Durable applied-event log
Each event that changes data SHALL record its source and event ID in the same transaction. A later event with a recorded ID SHALL NOT apply again. Records SHALL be kept 48 hours with at most 10,000 per source. At the cap, the oldest record for that source SHALL be evicted with a diagnostic, and new events SHALL NOT be rejected.

#### Scenario: Redelivered EventSub message
- **WHEN** Twitch delivers the same subscription message twice, with a restart between deliveries
- **THEN** the counter increases once

#### Scenario: Log at capacity
- **WHEN** a source has 10,000 unexpired records and a new event arrives
- **THEN** the event applies, the oldest record is evicted, and a diagnostic is recorded

### Requirement: Subscription starters
The default received-subs starter SHALL count `subscription`, including Prime, and `gift_subscription` once each, and SHALL exclude `resubscription` and `community_gift`. The gift-batch starter SHALL count `community_gift` amounts and exclude `gift_subscription`. A value SHALL NOT have both starters. Management SHALL warn when custom rules overlap a starter.

#### Scenario: Gift batch with recipients
- **WHEN** a five-gift batch and its five recipient events reach the received-subs starter
- **THEN** the count increases by 5

#### Scenario: Resubscription
- **WHEN** a resubscription event reaches the received-subs starter
- **THEN** the count is unchanged

### Requirement: Moderated event text
Text written to a value from an event field SHALL pass rendered-text moderation before it is stored.

#### Scenario: Blocked username
- **WHEN** a follow from a username containing a blocked term updates a latest-follower value
- **THEN** the stored and displayed text has the term replaced

### Requirement: Reset on stream online
A reset group MAY opt into reset on stream online. A normalized `stream_online` event SHALL then reset that group once per event ID.

#### Scenario: New stream starts
- **WHEN** a `stream_online` event arrives for a group that opted in
- **THEN** every member value returns to its reset default

### Requirement: Operator pause for automatic updates
The Operator Data section SHALL provide a persisted toggle that pauses all data rules. Events received while paused SHALL be logged as skipped and SHALL NOT be applied later. Manual Operator controls SHALL keep working while paused.

#### Scenario: Pause during testing
- **WHEN** automatic updates are paused and a follow arrives
- **THEN** the follower counter is unchanged, and the operator can still press +1

### Requirement: Rule editor
Management SHALL provide a rule editor with source, event and field pickers, filter and action controls, explicit enablement, visible evaluation order, and a simulation that runs sample events against the preview store without changing live values.

#### Scenario: Simulate a rule
- **WHEN** the user simulates a sample cheer against a rule
- **THEN** only the preview value changes, and no applied-event record is written
