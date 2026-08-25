# Streamer.bot Twitch fixture provenance

- `twitch-follow.json`, `twitch-cheer.json`, `twitch-sub.json`, and `twitch-resub.json` are synthetic examples derived from the official Streamer.bot WebSocket event schemas listed in `openspec/changes/archive/2026-08-24-add-streamerbot-live-event-ingestion/design.md`.
- `twitch-raid.json` and `twitch-reward-redemption.json` are synthetic examples derived from the official Streamer.bot trigger-variable references. Streamer.bot currently publishes no generated WebSocket schema for those two events.
- `twitch-gift-sub.json` and `twitch-gift-bomb.json` are synthetic minimal envelopes derived from Streamer.bot's generated `Twitch.GiftSub` and `Twitch.GiftBomb` WebSocket schemas.
- `twitch-hype-train.json`, `twitch-poll.json`, `twitch-prediction.json`, and `twitch-stream.json` are synthetic minimal envelopes derived from Streamer.bot's documented Twitch trigger variables. The generated WebSocket reference currently lists these event names but has no payload schemas, so the fixtures retain only fields required for the normalized contract.

Replace or supplement the two trigger-derived fixtures with captured payloads from supported Streamer.bot versions when available. Fixtures contain no real user data or credentials.
