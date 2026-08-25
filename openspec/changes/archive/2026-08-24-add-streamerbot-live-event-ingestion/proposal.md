## Why

Streamer.bot registrations can currently be validated and activated, but Stream Jams immediately disconnects after validation and never subscribes to live events. The management UI also treats an alert's provider metadata as a runtime target, producing false incompatibility warnings even though the event model already defines Streamer.bot as an alternate ingestion path for canonical Twitch events.

## What Changes

- Add a persistent Streamer.bot runtime that connects only for the active Streamer.bot event-source registration, restores its stored password through the secret-store boundary, subscribes to the six MVP Twitch event types, reconnects through the existing protocol client, and disconnects when the source is inactive.
- Normalize fixture-backed `Twitch.Follow`, `Twitch.Sub`, `Twitch.ReSub`, `Twitch.Cheer`, `Twitch.Raid`, and `Twitch.RewardRedemption` envelopes into the existing canonical alert events with `sourcePlatform: "twitch"` and `ingestProvider: "streamerbot"`.
- Route normalized Streamer.bot events through the existing ingestion, diagnostics, matching, resolution, and playback path.
- Synchronize Twitch and Streamer.bot runtimes after startup, registration, activation, deactivation, and Twitch account changes so only the active event-source runtime consumes events.
- Remove provider-kind mismatch warnings and activation-impact claims when both event sources can supply the same canonical alert event types.
- Expose Streamer.bot runtime health through diagnostics and retain unknown or malformed event handling as explicit diagnostics without forcing unknown events into alert matching.

## Capabilities

### New Capabilities

- `streamerbot-live-ingestion`: Persistent active-provider lifecycle, subscriptions, normalization intake, runtime status, and diagnostics behavior for live Streamer.bot events.

### Modified Capabilities

- `streamerbot-event-source`: Define canonical Twitch alert compatibility for Streamer.bot-ingested events and require alert matching to remain independent of ingestion-provider metadata unless an explicit condition requests it.

## Impact

- Affects Streamer.bot runtime modules, event ingestion, provider activation lifecycle, runtime composition/startup/shutdown, diagnostics, alert-set validation, activation-impact reporting, tests, fixtures, and UX decision/spec documents.
- Reuses the existing direct WebSocket protocol client, provider registration repository, secret store, event pipeline, and alert matcher. No dependency, schema migration, public route, or breaking API change is required.
