## ADDED Requirements

### Requirement: Authoritative Twitch measurements
Direct Twitch data sources SHALL expose read-only follower total and selected active Creator Goals through initial API snapshots, goal lifecycle events, reconnect reconciliation and follower refresh at a nominal 60-second interval with rate-limit-aware backoff. Follow events SHALL prompt reconciliation rather than permanently increment authoritative follower totals. Connection epochs and bounded startup reconciliation SHALL prevent late/stale snapshots from replacing newer state.

#### Scenario: Followers decrease while disconnected
- **WHEN** Twitch data reconnects after followers have decreased
- **THEN** the authoritative refreshed count replaces the stale total and dependent goals reflect the decrease

#### Scenario: Goal update during initial load
- **WHEN** a goal progress event overlaps the initial API request
- **THEN** startup reconciliation converges on authoritative current state without regressing progress from a late response

### Requirement: Capability-specific readiness and pinned identity
Twitch data readiness SHALL be gated by its required authorization independently of alert readiness, including channel:read:goals for Creator Goals. Missing scopes SHALL show a reconnect action for that capability. Bindings SHALL retain broadcaster/goal identity and declared units; ended goals SHALL NOT automatically rebind to a replacement goal or be manually reset. Broadcaster replacement SHALL invalidate prior bindings. Streamer.bot event intake SHALL NOT be represented as an authoritative total/goal snapshot unless an explicit supported source supplies one.

#### Scenario: Missing goal scope
- **WHEN** an existing Twitch account lacks goal authorization
- **THEN** goal data reports authorization update required without disabling already-authorized alert intake

#### Scenario: Goal ends and another begins
- **WHEN** the selected goal ends and a different goal starts
- **THEN** the binding reports ended and requires explicit selection of the new goal, preserving its follower/subscriber/sub-point meaning
