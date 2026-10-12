## ADDED Requirements

### Requirement: Named Trigger Marker
Stream Jams SHALL treat a Streamer.bot `General` / `Custom` broadcast whose payload has `source` `StreamJams`, `type` `Trigger` and a `name` as a named trigger. The name SHALL be trimmed and lower-cased at intake and SHALL be 1 to 64 characters of letters, digits, underscores and hyphens. An optional `message` SHALL have control characters removed and be cut to 500 characters. A broadcast with an invalid name SHALL be handled as an unnamed `General` / `Custom` event, and Diagnostics SHALL note the invalid name without showing it.

#### Scenario: Valid named trigger
- **WHEN** Streamer.bot broadcasts `{ "source": "StreamJams", "type": "Trigger", "name": "Hype", "message": "let's go" }`
- **THEN** the bus event carries trigger name `hype` and message `let's go`

#### Scenario: Invalid name
- **WHEN** a broadcast carries the marker with name `../hype`
- **THEN** it is handled as an unnamed `General` / `Custom` event
- **AND** Diagnostics notes an invalid trigger name without the name itself

### Requirement: Rules Select A Trigger Name
Alert rules for Streamer.bot events, Screen Effect triggers and timer event rules SHALL be able to select `General` / `Custom` with one trigger name. A rule with a name SHALL match only events carrying that name. A rule without a name SHALL keep matching every `General` / `Custom` event. A trigger name SHALL be rejected on any other identity.

#### Scenario: Two named actions
- **WHEN** an alert rule selects name `hype`, an effect selects name `lurk`, and Streamer.bot broadcasts name `hype`
- **THEN** the alert plays and the effect does not

#### Scenario: Existing unnamed rule
- **WHEN** an effect selects `General` / `Custom` without a name and a named trigger arrives
- **THEN** the effect plays, as before this change

#### Scenario: Stored rules are unchanged
- **WHEN** Stream Jams upgrades with existing `General` / `Custom` rules
- **THEN** they keep their stored identity and behavior without a migration

### Requirement: Trigger Message Reaches Alerts Through Moderation
A named trigger's message SHALL fill the alert `{message}` template value and TTS text, subject to the active alert moderation policy for rendered and TTS text. The message SHALL NOT select rules, media, routes or actions, and Screen Effects and timers SHALL ignore it.

#### Scenario: Moderated message
- **WHEN** a named trigger with a message containing a blocked word matches an alert whose template uses `{message}`
- **THEN** the alert shows and speaks the message as moderation dictates

### Requirement: Recent Trigger Names Are Suggested
Management SHALL suggest up to 50 distinct trigger names received recently, newest first, drawn from the bus journal. The user SHALL also be able to type a name that has not been received yet.

#### Scenario: Picking a received name
- **WHEN** Streamer.bot sent names `hype` and `lurk` today and the user edits an effect trigger
- **THEN** the name field suggests `lurk` and `hype`

#### Scenario: Typing a new name
- **WHEN** the user types `raid-horn`, which has not been received
- **THEN** the rule saves with that name

### Requirement: Named Triggers Can Be Tested
The manual Streamer.bot event simulation SHALL accept a trigger name and message and SHALL match rules exactly as the same live broadcast would.

#### Scenario: Testing a named effect
- **WHEN** the user tests an effect selecting name `hype`
- **THEN** a simulated named trigger `hype` is submitted and the effect plays
