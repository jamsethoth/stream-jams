# central-event-bus Specification

## Purpose
Every active event source publishes into one journaled bus, and every module that reacts to events (Alerts, Screen Effects, Timers, Videos and future consumers) receives each accepted event independently, in order, at least once, across restarts.

## Requirements

### Requirement: All Active Event Sources Publish To One Bus
The system SHALL publish every validated subscribed event and explicit manually submitted event into one central journaled bus. Events SHALL carry server-assigned bus identity, event identity, receive time and truthful provenance without route keys, secrets or credentials. Subscribed canonical/external events SHALL retain their existing validated identities and source registrations. A manual variant SHALL have manual provenance, no source registration and no cross-source correlation key; its validated simulated event identity or explicit module-action target SHALL be separate from provenance. Manual SHALL NOT become a provider registration or require a connected source. Manual events SHALL use the ordinary consumers, queues and outputs, with no test destination.

#### Scenario: Two sources publish together
- **WHEN** direct Twitch and Streamer.bot deliver distinct valid subscribed events
- **THEN** both are published with their own source registration IDs

#### Scenario: Invalid input is rejected at the boundary
- **WHEN** any submission fails its typed event validation or authorization
- **THEN** nothing is published and a bounded rejection with a reference ID is recorded

#### Scenario: Custom Streamer.bot broadcast is an external bus event
- **WHEN** a configured General/Custom broadcast arrives
- **THEN** it is published once as an external event rather than intercepted before ingestion

#### Scenario: Manual source simulation
- **WHEN** an authorized operator submits a supported simulated source event while its provider is disconnected
- **THEN** it enters the bus with manual provenance and the chosen event identity
- **AND** each normal consumer independently matches it and applies its normal admission rules

#### Scenario: Explicit selected-module test
- **WHEN** the operator dispatches a saved alert/effect test or submits a video request
- **THEN** a typed manual action enters the bus and the intended consumer uses ordinary validated admission
- **AND** no direct parallel enqueue or separate test output is created

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

#### Scenario: Video request broadcast
- **WHEN** a Streamer.bot General/Custom broadcast carries the `VideoRequest` marker or the retired `VideoShoutout` marker
- **THEN** it is published as an external bus event with its payload
- **AND** the Videos consumer validates it and submits it to the video queue intake
- **AND** Screen Effects and alerts that select General/Custom also receive it

#### Scenario: Undeclared identity
- **WHEN** an external event arrives whose identity no consumer declared
- **THEN** it is published without its payload

### Requirement: Operator Queue Shows The Delivering Source
Operator queues SHALL show Twitch or Streamer.bot for subscribed events and truthful manual provenance for manually submitted events without claiming a provider registration. Replayed items SHALL preserve original provenance. Diagnostics SHALL distinguish manual/subscribed origin without implying separate playback destinations or exposing raw payloads.

#### Scenario: Effect triggered through Streamer.bot
- **WHEN** a subscribed Streamer.bot event admits an effect
- **THEN** its queue item identifies Streamer.bot

#### Scenario: Manually simulated Twitch event
- **WHEN** a manual event simulates a Twitch event type
- **THEN** its queue item identifies manual origin rather than claiming Twitch delivered it

### Requirement: Same-Source Redelivery Is A Duplicate
The system SHALL reject an event with the same source kind and event ID as one accepted in the last 10 minutes, including across restart.

#### Scenario: Redelivery after restart
- **WHEN** Twitch redelivers an EventSub message after the app restarts within 10 minutes of accepting it
- **THEN** the redelivery is counted as a duplicate and not published

### Requirement: Cross-Source Duplicates Are Merged
For subscribed Twitch-origin canonical events the system SHALL derive a correlation key from Twitch-native identity and SHALL merge an event whose key matches an event accepted from a different source within the correlation window (default 30 seconds). Each accepted event SHALL absorb at most one copy from each other source. Same-source events with different IDs, external events and manual events SHALL NOT be merged.

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
After restart each consumer SHALL resume after its cursor; a new consumer SHALL start at the journal head. Replay SHALL begin shortly after startup so outputs can reconnect first. A pre-restart event older than the replay age when delivered SHALL be recorded as expired for that consumer instead, unless the consumer declares no expiry. Live events SHALL never expire. Global pause, mute and do-not-disturb SHALL apply to replayed events.

#### Scenario: Event accepted just before shutdown
- **WHEN** an event is journaled and the app stops before Alerts admits it, then restarts within the replay age
- **THEN** Alerts admits the event once

#### Scenario: Long outage
- **WHEN** the app restarts after the replay age has passed
- **THEN** pending events are recorded as expired and no alert or effect plays for them

#### Scenario: Replay under global pause
- **WHEN** a pending event is replayed while playback is globally paused
- **THEN** its alert waits in the queue and does not play until playback resumes

### Requirement: Replay Age Is A User Setting
The replay age SHALL default to 2 minutes and SHALL be configurable in Settings from Off (0) to 30 minutes. It SHALL be part of configuration backup, and restoring a backup without it SHALL restore the default.

#### Scenario: Replay turned off
- **WHEN** the user sets the replay age to Off in Settings and the app restarts with pending events
- **THEN** every pending event is recorded as expired

#### Scenario: Out-of-range replay age
- **WHEN** a replay age above 30 minutes is saved or restored from a backup
- **THEN** it is rejected and the current value is kept

### Requirement: Diagnostics Explain Bus Outcomes
Diagnostics SHALL list recent bus events with source, kind, type, intake outcome (`accepted`, `duplicate`, `merged`, `rejected`) and per-consumer outcome (`admitted`, `no match`, `failed`, `expired`), without raw external payloads, route keys or secrets.

#### Scenario: User checks why an alert did not play
- **WHEN** a user opens a bus event in Diagnostics
- **THEN** they see whether it was merged, whether Alerts matched it, and any failure reference ID

#### Scenario: Redelivery is listed as a duplicate
- **WHEN** a source delivers the same event again
- **THEN** Diagnostics lists the redelivery as `duplicate` with no module outcomes

#### Scenario: Failure reference opens the bus event
- **WHEN** a user opens Diagnostics with the reference ID of a consumer failure
- **THEN** the bus view opens with that event selected
### Requirement: Manual submission is bounded and cannot masquerade as provider delivery
Manual submissions SHALL use existing management auth/origin/CSRF/rate limits or an explicitly authorized scoped automation adapter. They SHALL validate event kind, target and bounded payload before journaling. A client SHALL NOT select arbitrary recipients or forge source-registration identity. Manual identities SHALL be unique per intentional submission and duplicate redelivery SHALL be deduplicated without merging with subscribed occurrences. Existing consumer retry limits, order, replay-age expiration and failure isolation SHALL apply. Journal/schema upgrades SHALL preserve existing canonical/external events and cursors.

#### Scenario: Same content is sent deliberately twice
- **WHEN** the operator makes two intentional identical submissions
- **THEN** two distinct events enter the normal bus
- **AND** retransmission of one accepted submission identity does not create a third event

#### Scenario: Simulation resembles a real occurrence
- **WHEN** a manual simulation and a subscribed Twitch occurrence have otherwise matching content
- **THEN** both remain separate because manual events do not participate in provider cross-source correlation

#### Scenario: One module rejects a manual event
- **WHEN** an event is journaled but a consumer rejects it under its normal rules
- **THEN** the UI shows that consumer's outcome rather than claiming playback succeeded
- **AND** other consumers retain their normal independent delivery

#### Scenario: Draft preview is opened
- **WHEN** a user only opens an editor, moves a draft or plays its local visual preview
- **THEN** no event is published and no ordinary queue or provider is started
