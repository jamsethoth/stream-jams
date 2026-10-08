## ADDED Requirements

### Requirement: Visual typed update rules
Authorized management SHALL configure ordered enabled rules selecting normalized provider events or management-approved custom source/schema identities, bounded AND filters, a destination, set/add/subtract/reset, and a compatible constant or event field with optional fixed numeric multiplier. Rules SHALL reject invalid references/types and executable expressions. Multiple rules SHALL update a value in deterministic persisted order. Input rules SHALL operate independently of output visibility/enablement.

#### Scenario: Custom counter rule
- **WHEN** a matching game.death event reaches an enabled add-one rule while all canvases are hidden
- **THEN** the shared death count increases by one and later visible canvases show the saved count

#### Scenario: Invalid field
- **WHEN** a rule selects a text field for numeric addition or an unsupported field path
- **THEN** saving the rule fails with an actionable validation error

### Requirement: Strict custom source contracts
Custom sources SHALL have management-owned stable identities and versioned flat primitive event schemas. Sample data SHALL help field selection without authorizing schema changes. Unknown fields, missing required fields, invalid versions or types SHALL reject ingress. Schema changes SHALL invalidate affected rules until explicit validation/reactivation. Limits SHALL be documented and exposed in capabilities, including at most 32 fields, 16 KiB messages and 2 KiB text values.

#### Scenario: Unauthorized new event shape
- **WHEN** a producer sends an unapproved schema or malformed payload
- **THEN** no rule is applied and the response identifies the validation failure without exposing sensitive payloads

### Requirement: Guarded transport-equivalent updates
HTTP and authenticated WebSocket ingress SHALL share typed direct-command and event-submit contracts and the same mutation service. Direct writes SHALL require request identity, observed runtime and expected value revision; custom events SHALL require request identity, observed runtime, approved source/schema and stable event identity. Provider-owned values SHALL reject direct commands. Responses SHALL return correlated accepted/duplicate/conflict/error outcomes with committed revisions and caller-owned receipt metadata.

#### Scenario: Stale correction
- **WHEN** an external set command carries a stale value revision or an unknown request from a previous runtime
- **THEN** it fails without overwriting newer content

#### Scenario: Equivalent input over either transport
- **WHEN** the same valid command/event is submitted through HTTP or WebSocket
- **THEN** it has identical validation, authorization, mutation and duplicate semantics

### Requirement: Transactional bounded duplicate protection
The server SHALL commit all data effects and their receipt in one SQLite transaction, validate the complete effect set before commit, and publish only committed state. Receipt identity SHALL bind commands to grant/request and events to source/event within the profile data epoch. Matching retained receipts SHALL prevent a second application across restart or transport changes; reused identities with changed effects SHALL conflict. Receipts SHALL retain seven days subject to a 100000-record bound; capacity SHALL reject new writes rather than evict unexpired entries. Clients SHALL resolve uncertain outcomes through receipt lookup and SHALL NOT blindly retry commands or claim dedupe beyond retention.

#### Scenario: Crash after commit before acknowledgement
- **WHEN** a producer loses the response after commit and looks up or resubmits the same retained identity after restart
- **THEN** the server returns the committed receipt without incrementing again

#### Scenario: Invalid second rule and receipt saturation
- **WHEN** an event has an invalid effect or unexpired receipts fill capacity
- **THEN** no part of that event changes data and no success receipt is created

### Requirement: Safe provider counting presets
Subscription starters SHALL distinguish recipients, aggregate gifts, resubscriptions and units. The default received-subs starter SHALL count ordinary/Prime subscriptions and gifted recipients once, exclude resubscriptions, and exclude aggregate gift notifications. An explicit batch-based alternative SHALL count quantity without simultaneously counting recipients. Custom overlap SHALL be explained in management. Data-event rejection SHALL NOT undo independent alert/timer handling or terminate intake; sources SHALL NOT promise replay of events never received.

#### Scenario: Gift batch plus recipient notifications
- **WHEN** a batch of five gifts and its five recipient events reach the default starter
- **THEN** the count increases by five rather than ten

### Requirement: Authenticated bounded WebSocket ingress
Native loopback clients SHALL obtain a 30-second one-use ticket via the scoped bearer API and authenticate in the first WebSocket frame within five seconds. Tickets/credentials SHALL NOT appear in URLs/logs. Before authentication no state/input SHALL be accepted. Grant revocation SHALL close its sockets. Source restrictions, Host/Origin/peer policy, five sockets per grant, ten writes per second with burst twenty, and bounded pending queues SHALL be enforced. Reconnection SHALL require a fresh ticket/snapshot and SHALL NOT replay buffered mutations.

#### Scenario: Reused ticket and slow consumer
- **WHEN** a ticket is reused or a recipient exceeds 100 queued messages or 1 MiB outbound data
- **THEN** authentication is denied or the slow connection is closed respectively without duplicate writes or unbounded buffering
