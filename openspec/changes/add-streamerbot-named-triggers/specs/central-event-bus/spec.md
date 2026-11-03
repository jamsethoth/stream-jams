## MODIFIED Requirements

### Requirement: Shared Event Trigger Selector
Module behaviors SHALL select events through one shared selector that matches a canonical event type, a Twitch reward by stable broadcaster and reward IDs, or an exact external provider/source/type identity with an optional exact Streamer.bot trigger name, optionally restricted to source kinds, with typed conditions for canonical events. External event payload content SHALL NOT be usable in selector conditions or choose media, routes or executable behavior. The only payload value that takes part in matching SHALL be a named trigger's name, validated into a bounded identity at intake.

#### Scenario: Effect triggers on a cheer threshold
- **WHEN** an effect selects canonical `cheer` with condition amount at least 100 and a 150-bit cheer arrives
- **THEN** the effect is admitted

#### Scenario: Source restriction
- **WHEN** a selector is restricted to `streamerbot` and the matching event arrived from direct Twitch
- **THEN** the selector does not match

#### Scenario: External payload contains a path
- **WHEN** an external event payload contains a URL, file path or command-like text
- **THEN** the selector matches only on its exact source and type identity, and trigger name when the selector has one, and ignores the rest of the payload
