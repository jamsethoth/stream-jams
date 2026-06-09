# Proposal: Add Streamer.bot Event Source Foundation

## Intent

Prepare Stream Jams for Streamer.bot as a future event source by updating the core event-source model before any Streamer.bot runtime, persistence, API, or UI work begins.

The current normalized event model is Twitch-shaped and uses `providerId: "twitch"` as both the source platform and ingestion provider. Streamer.bot will be a broad local event aggregator, so the model needs to distinguish:

- the viewer-facing source platform, which is Twitch for current MVP alert events;
- the ingestion provider, which is direct Twitch EventSub today and Streamer.bot in later slices;
- the original Streamer.bot source/type for future diagnostics and normalization.

## Scope

In scope:

- Add core event-source identity types for source platform and ingestion provider.
- Add `sourcePlatform` and `ingestProvider` fields to normalized stream events.
- Keep `providerId: "twitch"` as a backward-compatible source-platform alias for existing alert, template, playback, and diagnostics behavior.
- Update direct Twitch EventSub normalization so existing events include `sourcePlatform: "twitch"` and `ingestProvider: "twitch"`.
- Add a generic external event model for future Streamer.bot intake, including `subscriptionSourceKey`, upstream source/type, timestamps, payload, and metadata.
- Add `"streamerbot"` to the `SecretRef` namespace schema and type.
- Keep diagnostics compatible with legacy normalized event rows that do not yet contain `sourcePlatform` or `ingestProvider`.
- Add focused tests for schema compatibility and alert conditions on provider/source fields.

Out of scope:

- No Streamer.bot WebSocket protocol client.
- No Streamer.bot connection persistence.
- No Streamer.bot management API.
- No management UI.
- No external-event diagnostics table.
- No Streamer.bot Twitch event normalizers.
- No generic Streamer.bot alert matching.

## Approach

Make the smallest core-model change that unlocks later Streamer.bot slices without changing current live behavior. Direct Twitch EventSub remains the only live provider after this change, but its normalized events become explicit about both source platform and ingestion path.

Diagnostics parsing should accept older stored rows by filling missing source identity fields as Twitch/direct Twitch at read time. This avoids a migration for existing event-log JSON and keeps the first slice reviewable.

## Impact

- Later Streamer.bot slices can normalize Twitch events as `sourcePlatform: "twitch"` and `ingestProvider: "streamerbot"` without rewriting the alert pipeline.
- Existing alert rules and templates using `providerId` continue to work.
- Future alert conditions can distinguish direct Twitch EventSub from Streamer.bot-ingested Twitch events.
- Secret storage can safely reference Streamer.bot credentials without overloading the Twitch namespace.
