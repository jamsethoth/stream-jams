# Streamer.bot Twitch fixture provenance

- `twitch-follow.json`, `twitch-cheer.json`, `twitch-sub.json`, and `twitch-resub.json` are synthetic examples derived from the official Streamer.bot WebSocket event schemas listed in `openspec/changes/add-streamerbot-live-event-ingestion/design.md`.
- `twitch-raid.json` and `twitch-reward-redemption.json` are synthetic examples derived from the official Streamer.bot trigger-variable references. Streamer.bot currently publishes no generated WebSocket schema for those two events.

Replace or supplement the two trigger-derived fixtures with captured payloads from supported Streamer.bot versions when available. Fixtures contain no real user data or credentials.
