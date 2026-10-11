## MODIFIED Requirements

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

### Requirement: Operator Queue Shows The Delivering Source
Operator queues SHALL show Twitch or Streamer.bot for subscribed events and truthful manual provenance for manually submitted events without claiming a provider registration. Replayed items SHALL preserve original provenance. Diagnostics SHALL distinguish manual/subscribed origin without implying separate playback destinations or exposing raw payloads.

#### Scenario: Effect triggered through Streamer.bot
- **WHEN** a subscribed Streamer.bot event admits an effect
- **THEN** its queue item identifies Streamer.bot

#### Scenario: Manually simulated Twitch event
- **WHEN** a manual event simulates a Twitch event type
- **THEN** its queue item identifies manual origin rather than claiming Twitch delivered it

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

## ADDED Requirements

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
