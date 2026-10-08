# twitch-overlay-data

## Purpose

Define implemented authoritative follower sources and optional goal permissions. Production follow-event hints, Creator Goal lists, event convergence and native goal bindings remain pending in `add-twitch-overlay-data` until the central event bus exists.

## Requirements

### Requirement: Authoritative follower polling
The system SHALL provide an explicitly configured read-only follower-total value from Twitch's follower `total`. It SHALL refresh on startup, reconnect and every 60 seconds, accept decreases, and discard responses from an older connection epoch. Manual commands SHALL NOT change provider-owned content or reset defaults. Persisted provider values SHALL stay hidden until validated against the active account.

#### Scenario: Followers decrease while disconnected
- **WHEN** Twitch reconnects after followers dropped from 1000 to 990
- **THEN** the refreshed total of 990 replaces the old value

#### Scenario: Late response from an old connection
- **WHEN** a refresh from before reconnect returns after a newer refresh
- **THEN** the older response is discarded

#### Scenario: Provider value pinned in Operator
- **WHEN** a follower-total value is pinned
- **THEN** Operator shows its content and provenance without set, delta or reset controls

### Requirement: Rate-limit-aware follower polling
Follower refresh SHALL back off exponentially on failed responses and honor Twitch's rate-limit reset or retry-after deadline. The nominal retry delay SHALL cap at five minutes, but a later provider deadline SHALL take precedence. A failure after successful validation SHALL mark the source stale until the next success; an initial validation failure SHALL keep it hidden.

#### Scenario: Rate limited
- **WHEN** Twitch returns 429 with a reset 30 seconds away
- **THEN** the next attempt waits at least until reset and a previously validated source is stale meanwhile

#### Scenario: Provider deadline exceeds the nominal cap
- **WHEN** Twitch requires waiting longer than five minutes
- **THEN** the next attempt honors that later deadline without scheduling an immediate timer loop

### Requirement: Goal scope does not affect alerts
`channel:read:goals` SHALL be an optional capability scope. An account without it SHALL keep existing required-scope event intake, and goal readiness SHALL show reauthorization guidance. Obtaining this scope SHALL NOT imply that the pending live goal consumer is available.

#### Scenario: Existing account without goal scope
- **WHEN** an account connected before this change starts the app
- **THEN** alerts keep working and the goal source shows a reconnect action

### Requirement: Broadcaster changes invalidate follower bindings
Connecting a different broadcaster SHALL durably invalidate prior follower bindings and require explicit source selection again. Returning to the old broadcaster SHALL NOT silently reactivate those bindings.

#### Scenario: Account switch
- **WHEN** the user connects a different broadcaster
- **THEN** prior follower bindings report invalid and hide on live outputs

#### Scenario: Return to an earlier account
- **WHEN** the user connects A, then B, then A again
- **THEN** the original A bindings remain invalid until explicitly replaced
