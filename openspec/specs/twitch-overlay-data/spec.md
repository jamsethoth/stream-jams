# twitch-overlay-data

## Purpose

Define authoritative follower totals and live Creator Goals, their account-bound read-only bindings, and optional goal permissions.

## Requirements

### Requirement: Authoritative follower polling
The system SHALL provide an explicitly configured read-only follower-total value from Twitch's follower `total`. It SHALL refresh on startup, reconnect and every 60 seconds, accept decreases, and discard responses from an older connection epoch. Canonical follow events SHALL request authoritative early refresh at most once every ten seconds, honoring provider rate deadlines; they SHALL NOT increment the total locally. Manual commands SHALL NOT change provider-owned content or reset defaults. Persisted provider values SHALL stay hidden until validated against the active account.

#### Scenario: Followers decrease while disconnected
- **WHEN** Twitch reconnects after followers dropped from 1000 to 990
- **THEN** the refreshed total of 990 replaces the old value

#### Scenario: Late response from an old connection
- **WHEN** a refresh from before reconnect returns after a newer refresh
- **THEN** the older response is discarded

#### Scenario: Provider value pinned in Operator
- **WHEN** a follower-total value is pinned
- **THEN** Operator shows its content and provenance without set, delta or reset controls

#### Scenario: Follow event received through the central bus
- **WHEN** Twitch or Streamer.bot supplies a canonical follow event for the connected account
- **THEN** the source schedules authoritative refresh subject to the ten-second throttle and provider rate deadlines

### Requirement: Rate-limit-aware follower polling
Follower refresh SHALL back off exponentially on failed responses and honor Twitch's rate-limit reset or retry-after deadline. The nominal retry delay SHALL cap at five minutes, but a later provider deadline SHALL take precedence. A failure after successful validation SHALL mark the source stale until the next success; an initial validation failure SHALL keep it hidden.

#### Scenario: Rate limited
- **WHEN** Twitch returns 429 with a reset 30 seconds away
- **THEN** the next attempt waits at least until reset and a previously validated source is stale meanwhile

#### Scenario: Provider deadline exceeds the nominal cap
- **WHEN** Twitch requires waiting longer than five minutes
- **THEN** the next attempt honors that later deadline without scheduling an immediate timer loop

### Requirement: Goal scope does not affect alerts
`channel:read:goals` SHALL be an optional capability scope. An account without it SHALL keep existing required-scope event intake, and goal readiness SHALL show reauthorization guidance. Optional goal subscription failures SHALL preserve alert intake. Temporary failures SHALL retry with bounded backoff; authorization failures SHALL require reauthorization.

#### Scenario: Existing account without goal scope
- **WHEN** an account connected before this change starts the app
- **THEN** alerts keep working and the goal source shows a reconnect action

### Requirement: Broadcaster changes invalidate bindings
Connecting a different broadcaster SHALL durably invalidate prior follower and Creator Goal bindings and require explicit source selection again. Returning to the old broadcaster SHALL NOT silently reactivate those bindings.

#### Scenario: Account switch
- **WHEN** the user connects a different broadcaster
- **THEN** prior Twitch bindings report invalid and hide on live outputs

#### Scenario: Return to an earlier account
- **WHEN** the user connects A, then B, then A again
- **THEN** the original A bindings remain invalid until explicitly replaced

### Requirement: Creator Goals as a list
The goal source SHALL retain every active Creator Goal with its ID, type, current amount, target and timestamps. It SHALL snapshot after all three goal subscriptions are active, consume canonical begin, progress and end events through the central bus, and buffer at most 100 events during a snapshot. Overflow and reconnect SHALL request a new snapshot. Older epochs and pre-snapshot replay SHALL NOT overwrite current state. Helix `created_at` and EventSub `started_at` SHALL normalize into one internal start timestamp. Goal events SHALL remain visible to bus diagnostics without becoming alert-authoring types.

#### Scenario: Progress during the initial load
- **WHEN** a progress event arrives while the initial snapshot is in flight
- **THEN** the source converges on newer progress without regressing to the snapshot amount

#### Scenario: Two active goals
- **WHEN** Twitch reports two active goals
- **THEN** Management lists both with their types and amounts

#### Scenario: Progress precedes begin
- **WHEN** newer progress is followed by an older begin notification
- **THEN** the older notification does not regress the goal

#### Scenario: End during a failed refresh
- **WHEN** an end event arrives during a snapshot that subsequently fails
- **THEN** the ended goal stays hidden and is not resurrected by stale data

#### Scenario: Goal event is offered to alert authoring
- **WHEN** an alert rule request uses a Creator Goal event type
- **THEN** the request is rejected as invalid, while the same normalized event remains valid for the central bus and Data source

### Requirement: Active-goal-of-type binding
A binding SHALL default to the newest active goal of a supported type. Management SHALL identify the selected goal. An ended goal SHALL hide immediately; a new goal of that type SHALL replace it without changing the canvas. Unsupported types SHALL remain visible in the source list but SHALL NOT be bindable.

#### Scenario: Next follower goal
- **WHEN** the active follower goal ends and a new follower goal begins
- **THEN** the same Data goal follows the replacement

#### Scenario: No goal of that type
- **WHEN** no supported active goal of the chosen type exists
- **THEN** the binding reports ended and dependent live elements hide

### Requirement: Pinned goal binding
A user SHALL be able to pin a binding to one supported active goal ID. A pinned binding SHALL NOT follow a replacement automatically. Explicit rebind SHALL preserve Data resource IDs while selecting the connected account and requested goal or type.

#### Scenario: Pinned goal ends
- **WHEN** a pinned goal ends and another goal begins
- **THEN** the binding stays ended and Management offers explicit rebind

### Requirement: Provider goals keep Twitch ownership and units
Native goals SHALL atomically update their provider-owned value and fixed target. Management and Operator SHALL NOT offer manual content, target or reset commands. Supported types SHALL retain follower, subscription-count or sub-point units. Templates SHALL retain source requirements without live counts, account identity or selected goal IDs. Restored bindings SHALL remain hidden until validated.

#### Scenario: Sub-point goal
- **WHEN** a subscription or new_subscription goal is shown
- **THEN** Management labels its amounts as sub points and offers no manual amount or target changes

#### Scenario: Temporary source failure
- **WHEN** a previously validated source encounters a temporary refresh failure
- **THEN** its last good active content is retained for at most ten minutes while stale, then hidden; ended and invalid bindings hide immediately
