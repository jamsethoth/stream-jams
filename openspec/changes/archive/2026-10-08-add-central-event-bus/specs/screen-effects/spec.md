## MODIFIED Requirements

### Requirement: Effect Triggers Use Existing Event Sources
Effects SHALL select events through the shared event trigger selector: a canonical event type with typed conditions, stable Twitch broadcaster/reward IDs, or an exact configured Streamer.bot external-event source/type identity, optionally restricted to source kinds. Effects SHALL receive events as a central event bus consumer from every active source. Operator tests SHALL require explicit protected actions and SHALL name their target destinations.

#### Scenario: Reward is renamed
- **WHEN** the selected Twitch reward's title changes but its broadcaster/reward IDs remain the same
- **THEN** the same effect binding continues to match

#### Scenario: Reward is missing from the catalog
- **WHEN** a saved reward binding is no longer resolvable
- **THEN** management shows it as unresolved rather than binding a similarly named reward

#### Scenario: Effect triggers on a canonical event
- **WHEN** an effect selects canonical `raid` with viewers at least 10 and a 25-viewer raid arrives from any active source
- **THEN** the effect is admitted

#### Scenario: Existing bindings migrate
- **WHEN** the app upgrades with saved `twitch-reward` and `streamerbot-event` bindings
- **THEN** each becomes an equivalent selector and matches the same events as before

#### Scenario: Streamer.bot payload contains an asset path
- **WHEN** an external event's user-controlled payload contains a URL, file path or command-like text
- **THEN** that data cannot choose media, routes or executable behavior
- **AND** only exact configured identities and allowlisted normalized summary fields are used

#### Scenario: Configured event is not subscribed
- **WHEN** an effect references a Streamer.bot event outside the configured subscription boundary
- **THEN** management reports the missing setup and links to existing provider configuration
- **AND** saving the effect does not silently expand subscriptions or activate another provider

#### Scenario: Local admission fails for a Twitch redemption
- **WHEN** an event is rejected by cooldown, duplicate protection, missing output or capacity checks
- **THEN** the local result includes the rejection reason
- **AND** this module does not automatically fulfill, cancel or refund the Twitch redemption
