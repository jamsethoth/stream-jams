## Why

Stream Jams currently normalizes only six Twitch-origin event types, leaving common subscription, engagement, and stream lifecycle events unavailable to alerts. The missing events should use the same provider-independent contract whether they arrive directly from Twitch EventSub or through Streamer.bot.

## What Changes

- Add 14 canonical Twitch-origin alert event types for gift subscriptions, community gifts, Hype Train phases, poll phases, prediction phases, and stream online/offline transitions.
- Normalize stable, useful fields for each event while retaining sanitized provider provenance and optional provider-specific data in metadata.
- Expand direct Twitch EventSub subscriptions and Streamer.bot Twitch subscriptions to cover the new canonical catalog.
- Add the Twitch OAuth scopes required for Hype Trains, polls, and predictions, and show an actionable authorization-update state for saved connections missing those scopes.
- Group the new event choices by family in alert creation and provide built-in normal and edge-case sample payloads without adding alerts to existing or starter sets.
- Surface malformed supported events through diagnostics with a human-readable error, next step, and reference ID while keeping intake available for subsequent events.
- **BREAKING**: gifted `channel.subscribe` notifications normalize as `gift_subscription` rather than `subscription`; a community gift may intentionally produce one aggregate event plus one gift-subscription event per recipient.
- Keep third-party donations, Twitch charity donations, creator goals, and stream-driven intake control out of this change.

## Capabilities

### New Capabilities

- `normalized-twitch-events`: Canonical event types, normalized payloads, direct Twitch subscriptions, OAuth scope readiness, and supported-event diagnostics.

### Modified Capabilities

- `streamerbot-event-source`: Expand Twitch-origin normalization and runtime subscriptions while preserving canonical parity with direct Twitch intake.
- `alert-configuration-management`: Expose grouped event creation, normalized conditions, and realistic samples for the expanded event catalog.

## Impact

- Core event types, runtime schemas, alert schemas, condition aliases, and public package exports.
- Twitch OAuth readiness, EventSub subscription definitions, payload normalization, and runtime diagnostics.
- Streamer.bot supported subscription selection, payload normalization, fixtures, and diagnostics.
- Alert management APIs, starter-template catalog, editor event picker, condition definitions, samples, stories, and browser-visible tests.
- Existing saved alerts require no migration; no new runtime dependency is expected.
