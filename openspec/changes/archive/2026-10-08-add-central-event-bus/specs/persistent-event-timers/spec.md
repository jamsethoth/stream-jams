## MODIFIED Requirements

### Requirement: Configurable timer event rules
Each timer SHALL support ordered enabled rules that select events through the shared event trigger selector (canonical event type, Twitch reward, or exact external identity, with optional source-kind restriction and canonical conditions such as subscription tier) and a start/stop/increment/decrement/restart action. Adjustments SHALL accept fixed durations or durations per quantity unit. Inactive adjustment behavior SHALL default to ignore, with start-from-definition and create-paused-from-definition alternatives. Active adjustments SHALL preserve running/paused status. Subscriptions and resubscriptions SHALL count as one occurrence; cheers and gift batches SHALL use event quantity. Timers SHALL receive events as a central event bus consumer and SHALL rely on bus duplicate and cross-source merge protection.

#### Scenario: Specific redemption starts a challenge
- **WHEN** a selected reward redemption matches a start rule
- **THEN** its timer starts if inactive and an already active run is unchanged

#### Scenario: Cheer extends a paused subathon
- **WHEN** a 200-bit cheer matches a rule adding 30 seconds per 100 bits
- **THEN** sixty seconds are added and the timer remains paused

#### Scenario: Cheer from both sources extends once
- **WHEN** the same 200-bit cheer arrives from direct Twitch and Streamer.bot
- **THEN** sixty seconds are added once

#### Scenario: Existing rules migrate
- **WHEN** the app upgrades with saved rules that select an ingestion source
- **THEN** each becomes a selector restricted to that source kind with the same event type, reward and tier

#### Scenario: Inactive adjustment defaults to ignore
- **WHEN** an increment rule targets an inactive timer with default behavior
- **THEN** no run is created

#### Scenario: Alternative idle behavior
- **WHEN** an inactive timer receives an adjustment configured to create paused
- **THEN** the saved duration is adjusted and a positive result becomes a paused run
