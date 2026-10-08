## ADDED Requirements

### Requirement: All Active Event Sources Publish To One Bus
The system SHALL publish every validated event from every active event source into one central event bus. Each bus event SHALL carry a bus ID, source registration ID, source kind, receive time, kind (`canonical` or `external`) and the existing validated normalized or external event, and SHALL NOT carry route keys, secrets or credentials.

#### Scenario: Two sources publish together
- **WHEN** direct Twitch and Streamer.bot are both active and each delivers a distinct valid event
- **THEN** both events are published to the bus with their own source registration IDs

#### Scenario: Invalid input is rejected at the boundary
- **WHEN** a source delivers a payload that fails normalized or external event validation
- **THEN** nothing is published to the bus
- **AND** ingestion reports a rejection with a reference ID through existing diagnostics

#### Scenario: Custom Streamer.bot broadcast is an external bus event
- **WHEN** a configured Streamer.bot General/Custom broadcast arrives
- **THEN** it is published as an external bus event rather than intercepted before ingestion

### Requirement: Accepted Events Are Journaled Before Delivery
The system SHALL commit each accepted bus event to a bounded SQLite journal before any consumer receives it, and SHALL report ingestion as accepted only after that commit. The journal SHALL retain no more than 7 days or 10,000 rows, whichever is fewer, except rows still pending for a consumer within the replay age. The journal SHALL be excluded from configuration backup.

#### Scenario: Journal write fails
- **WHEN** the journal transaction fails
- **THEN** the event is not delivered to any consumer
- **AND** ingestion reports a failure with a reference ID

#### Scenario: Retention prunes old rows
- **WHEN** retention runs and the journal exceeds its bounds
- **THEN** the oldest rows not pending for any consumer are removed

#### Scenario: Restore does not replay old events
- **WHEN** a configuration restore completes
- **THEN** journal rows not yet delivered are marked expired for every consumer

### Requirement: Consumers Receive Events Independently
Each registered module consumer SHALL receive bus events in journal order through its own cursor. A slow, failing or disabled consumer SHALL NOT delay, fail or reorder delivery to other consumers or block ingestion. Delivery SHALL be at least once, and consumers SHALL be idempotent by bus ID. The bus SHALL NOT keep an unbounded in-memory backlog.

#### Scenario: One consumer fails
- **WHEN** the Screen Effects consumer throws while handling an event that also matches an alert
- **THEN** the Alerts consumer still admits the alert
- **AND** the failure is logged with consumer, bus ID and reference ID

#### Scenario: Poisoned event is skipped after retries
- **WHEN** a consumer fails the same event three times
- **THEN** the delivery is recorded as failed for that consumer and its cursor advances
- **AND** later events are still delivered to that consumer

#### Scenario: Redelivery is idempotent
- **WHEN** a consumer receives the same bus event twice after a restart
- **THEN** the consumer admits it at most once

### Requirement: Consumers Can Checkpoint Transactionally
A consumer SHALL be able to commit its cursor inside its own SQLite transaction together with the state change an event causes, so that each event's effect on that consumer applies exactly once across crashes and restarts.

#### Scenario: Crash between state change and cursor
- **WHEN** a transactional consumer's transaction is interrupted before commit
- **THEN** neither its state change nor its cursor advance is persisted
- **AND** the event is delivered again after restart and applied once

### Requirement: External Payloads Are Kept Only For Declaring Consumers
The bus SHALL journal an external event's payload only when a registered consumer declared that event's exact identity, and only when the payload is a JSON object within 16 KiB. Declaring an identity SHALL subscribe the Streamer.bot source to it while Streamer.bot advertises it. The declaring consumer SHALL validate the payload with its own schema, and payloads SHALL NOT appear in diagnostics or logs.

#### Scenario: Video shoutout broadcast
- **WHEN** a Streamer.bot General/Custom broadcast carries the video shoutout marker
- **THEN** it is published as an external bus event with its payload
- **AND** the Video shoutout consumer validates and applies it
- **AND** Screen Effects and alerts that select General/Custom also receive it

#### Scenario: Undeclared identity
- **WHEN** an external event arrives whose identity no consumer declared
- **THEN** it is published without its payload

### Requirement: Operator Queue Shows The Delivering Source
Each Operator queue item SHALL name the source kind that delivered its event (Twitch or Streamer.bot). Manual tests SHALL show no source, and a replayed item SHALL keep its original source.

#### Scenario: Effect triggered through Streamer.bot
- **WHEN** a Streamer.bot event admits a Screen Effect
- **THEN** its Operator queue item says it came via Streamer.bot

### Requirement: Same-Source Redelivery Is A Duplicate
The system SHALL reject an event with the same source kind and event ID as one accepted in the last 10 minutes, including across restart.

#### Scenario: Redelivery after restart
- **WHEN** Twitch redelivers an EventSub message after the app restarts within 10 minutes of accepting it
- **THEN** the redelivery is counted as a duplicate and not published

### Requirement: Cross-Source Duplicates Are Merged
For Twitch-origin canonical events the system SHALL derive a correlation key from Twitch-native identity and SHALL merge an event whose key matches an event accepted from a different source within the correlation window (default 30 seconds). Each accepted event SHALL absorb at most one copy from each other source. Same-source events with different IDs and external events SHALL NOT be merged.

#### Scenario: Same follow from both sources
- **WHEN** direct Twitch delivers a follow and Streamer.bot delivers the same follow 3 seconds later
- **THEN** one bus event is published
- **AND** the second is recorded as merged with its source

#### Scenario: Two real identical cheers
- **WHEN** one viewer sends two identical 100-bit cheers and each arrives through both direct Twitch and Streamer.bot
- **THEN** two bus events are published

#### Scenario: Same redemption from both sources
- **WHEN** both sources deliver a channel point redemption with the same redemption ID
- **THEN** one bus event is published

#### Scenario: Copy arrives after the window
- **WHEN** the second copy arrives after the correlation window
- **THEN** it is published as a separate event and Diagnostics shows both

### Requirement: Shared Event Trigger Selector
Module behaviors SHALL select events through one shared selector that matches a canonical event type, a Twitch reward by stable broadcaster and reward IDs, or an exact external provider/source/type identity, optionally restricted to source kinds, with typed conditions for canonical events. External event payload content SHALL NOT be usable in selector conditions or choose media, routes or executable behavior.

#### Scenario: Effect triggers on a cheer threshold
- **WHEN** an effect selects canonical `cheer` with condition amount at least 100 and a 150-bit cheer arrives
- **THEN** the effect is admitted

#### Scenario: Source restriction
- **WHEN** a selector is restricted to `streamerbot` and the matching event arrived from direct Twitch
- **THEN** the selector does not match

#### Scenario: External payload contains a path
- **WHEN** an external event payload contains a URL, file path or command-like text
- **THEN** the selector matches only on its exact source and type identity and ignores the payload

### Requirement: Restart Resumes Admission Within A Replay Age
After restart each consumer SHALL resume after its cursor. Events older than that consumer's replay age (default 2 minutes, configurable from 0 to 30 minutes, or no expiry for consumers that declare it) SHALL be skipped for that consumer and recorded as expired. Global pause, mute and do-not-disturb SHALL apply to replayed events as to live ones.

#### Scenario: Event accepted just before shutdown
- **WHEN** an event is journaled and the app stops before Alerts admits it, then restarts within the replay age
- **THEN** Alerts admits the event once

#### Scenario: Long outage
- **WHEN** the app restarts after the replay age has passed
- **THEN** pending events are recorded as expired and no alert or effect plays for them

### Requirement: Diagnostics Explain Bus Outcomes
Diagnostics SHALL list recent bus events with source, kind, type, intake outcome (`accepted`, `duplicate`, `merged`, `rejected`) and per-consumer outcome (`admitted`, `no match`, `failed`, `expired`), without raw external payloads, route keys or secrets.

#### Scenario: User checks why an alert did not play
- **WHEN** a user opens a bus event in Diagnostics
- **THEN** they see whether it was merged, whether Alerts matched it, and any failure reference ID
