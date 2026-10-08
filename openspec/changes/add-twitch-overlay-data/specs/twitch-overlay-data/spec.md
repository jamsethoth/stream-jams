## ADDED Requirements

### Requirement: Authoritative follower total
The system SHALL provide a read-only follower-total value from Twitch's follower `total`. It SHALL refresh on startup, on reconnect, every 60 seconds, and early after a follow event at most once every 10 seconds. Follow events SHALL NOT increment the total directly. Responses from an older connection epoch SHALL be discarded.

#### Scenario: Followers decrease while disconnected
- **WHEN** Twitch reconnects after followers dropped from 1000 to 990
- **THEN** the refreshed total of 990 replaces the old value

#### Scenario: Follow event
- **WHEN** a follow event arrives
- **THEN** the system refreshes the total within 10 seconds rather than adding one

#### Scenario: Late response from an old connection
- **WHEN** a refresh from before a reconnect returns after a newer refresh
- **THEN** the older response is discarded

### Requirement: Rate-limit-aware refresh
Follower refresh SHALL back off exponentially on 429 and 5xx responses, honor Twitch's rate-limit reset, and wait no more than 5 minutes between attempts. A failed refresh SHALL mark the source stale until the next success.

#### Scenario: Rate limited
- **WHEN** Twitch returns 429 with a reset 30 seconds away
- **THEN** the next attempt waits at least until the reset and the source is stale meanwhile

### Requirement: Creator Goals as a list
The goal source SHALL keep every active Creator Goal with its ID, type, current amount, target and timestamps. It SHALL snapshot after EventSub goal subscriptions are active, apply begin, progress and end events, and buffer at most 100 events during a snapshot, taking a new snapshot on overflow. Reconnect SHALL take a new snapshot.

#### Scenario: Progress during the initial load
- **WHEN** a progress event arrives while the initial snapshot request is in flight
- **THEN** the source converges on the newer progress and does not regress to the snapshot's older amount

#### Scenario: Two active goals
- **WHEN** Twitch reports two active goals
- **THEN** both are listed in Management with their types and amounts

### Requirement: Active-goal-of-type binding
A goal binding SHALL default to the active goal of a chosen type. With several active goals of that type, it SHALL use the most recently started one, and Management SHALL show which. When the bound goal ends and a new goal of the same type begins, the binding SHALL move to the new goal without user action.

#### Scenario: Next follower goal
- **WHEN** the active follower goal ends and the streamer starts a new follower goal
- **THEN** the overlay shows the new goal's progress without any change in Stream Jams

#### Scenario: No goal of that type
- **WHEN** no active goal of the bound type exists
- **THEN** the source reports ended and the element follows its stale policy

### Requirement: Pinned goal binding
A user SHALL be able to pin a binding to one goal ID. When a pinned goal ends, the binding SHALL report ended and SHALL NOT move to another goal.

#### Scenario: Pinned goal ends
- **WHEN** a pinned goal ends and another goal of the same type begins
- **THEN** the binding reports ended and Management offers to rebind

### Requirement: Provider goals keep Twitch units
Twitch goals SHALL be read-only and SHALL keep Twitch's goal type and units. Sub-point goal types SHALL be labeled as points, not subscribers.

#### Scenario: Sub-point goal
- **WHEN** a `subscription` goal is shown
- **THEN** Management labels its amounts as sub points, and Operator and Management offer no edit or reset

### Requirement: Goal scope does not affect alerts
`channel:read:goals` SHALL be an optional capability scope. A connected account without it SHALL keep all existing event intake, and only the goal source SHALL report that reauthorization is needed, with a reconnect action.

#### Scenario: Existing account without goal scope
- **WHEN** an account connected before this change starts the app
- **THEN** alerts keep working and the goal source shows a reconnect action

### Requirement: Broadcaster change invalidates bindings
When a different Twitch broadcaster account connects, follower and goal bindings from the previous account SHALL be invalidated and require selection again.

#### Scenario: Account switch
- **WHEN** the user connects a different broadcaster
- **THEN** existing Twitch bindings report invalid and hide on live outputs
