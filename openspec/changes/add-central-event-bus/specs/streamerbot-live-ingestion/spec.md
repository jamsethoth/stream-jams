## MODIFIED Requirements

### Requirement: Shared Event Pipeline Delivery

Normalized Streamer.bot events SHALL use the same central event bus, diagnostics, alert matching, resolution, and playback as direct Twitch events.

#### Scenario: Streamer.bot raid matches existing rule

- **WHEN** a valid Streamer.bot Twitch raid normalizes to canonical event type `raid`
- **AND** an enabled alert rule matches `raid`
- **THEN** the event is published to the central event bus and evaluated by the Alerts consumer
- **AND** matching playback is enqueued without a Streamer.bot-specific duplicate rule

#### Scenario: Duplicate Streamer.bot event is received

- **WHEN** two normalized Streamer.bot events have the same deterministic event ID
- **THEN** the first event is accepted
- **AND** the second event is counted and ignored as a duplicate

### Requirement: Event Source Runtime Synchronization

The system SHALL synchronize each event-source runtime from its own persisted active registration after every relevant lifecycle change. Activating or deactivating one provider kind SHALL NOT start or stop another provider kind's runtime.

#### Scenario: Streamer.bot is activated while Twitch is active

- **WHEN** a user confirms activation of a Streamer.bot registration while direct Twitch is active
- **THEN** Streamer.bot intake starts
- **AND** direct Twitch intake stays connected and both sources publish to the bus

#### Scenario: Twitch is deactivated while Streamer.bot is active

- **WHEN** a user deactivates direct Twitch while Streamer.bot is active
- **THEN** direct Twitch intake disconnects
- **AND** Streamer.bot intake continues

#### Scenario: Event source switches from Twitch to Streamer.bot

- **WHEN** a user deactivates direct Twitch and activates a Streamer.bot registration
- **THEN** direct Twitch intake disconnects and Streamer.bot intake starts
- **AND** only Streamer.bot events are accepted afterward

#### Scenario: Event source switches from Streamer.bot to Twitch

- **WHEN** a user deactivates Streamer.bot and activates direct Twitch
- **THEN** Streamer.bot intake disconnects and direct Twitch intake starts
- **AND** only direct Twitch events are accepted afterward

#### Scenario: Same-kind registration replaces the active one

- **WHEN** a user confirms activation of a second Streamer.bot registration
- **THEN** the previously active Streamer.bot registration is deactivated and its runtime disconnects before the new one starts

#### Scenario: Active event source is deactivated

- **WHEN** an active event-source registration is deactivated without a replacement
- **THEN** that source's runtime is disconnected
- **AND** provider configuration remains registered for later reactivation

## ADDED Requirements

### Requirement: Streamer.bot Twitch Forwarding Is Optional
Streamer.bot registrations SHALL have a `forwardTwitchEvents` setting, enabled by default. When disabled, the runtime SHALL NOT subscribe to or publish Streamer.bot Twitch event types and SHALL keep configured external subscriptions.

#### Scenario: Forwarding disabled with direct Twitch active
- **WHEN** `forwardTwitchEvents` is disabled and a Twitch follow occurs
- **THEN** only direct Twitch publishes it
- **AND** configured Streamer.bot custom events still publish
