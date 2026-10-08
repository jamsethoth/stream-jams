## Why

Slice 1 ([`add-custom-data-overlays`](../add-custom-data-overlays/proposal.md)) gives streamers shared values they change by hand. Most counters should move on their own: subs received, deaths in a game, a "latest supporter" label.

Jams decided that Stream Jams listens to events from tools it already connects to, rather than accepting inbound connections. Stream Jams already receives normalized Twitch and Streamer.bot events. It already consumes Streamer.bot `General/Custom` broadcasts for video shoutouts (`docs/video-shoutout.md`). Streamer.bot also exposes its global variables over its WebSocket server. This change turns those into data sources for rules.

## What Changes

- Add visual update rules. A rule picks a source and event type, optional AND filters and a destination value, then applies set, add, subtract or reset. The input is a constant, or an event field with an optional integer multiplier. Rules contain no scripts or expressions.
- Let normalized provider events (follow, subscription, gift, cheer, raid, redemption and the rest) drive rules.
- Add Streamer.bot custom broadcasts as custom event sources. A broadcast carries the marker `"source": "StreamJams", "type": "Data"`. A management-defined event type has a versioned flat schema. Users send these with `CPH.WebsocketBroadcastJson`, the same way video shoutouts work.
- Add Streamer.bot global variables as read-only provider-backed values: a snapshot on connect, then live updates.
- Add subscription starter rules that count each subscriber once and never double-count a gift batch and its recipients.
- Moderate any text written from an event field with the existing rendered-text moderation before it is stored.
- Add an optional "reset on stream online" trigger for a reset group.
- Add an Operator toggle that pauses automatic updates while manual controls keep working.
- Keep a bounded, durable log of applied event IDs so a redelivered event never counts twice. When the log is full it evicts the oldest entries instead of rejecting events.

## Out of scope

- An inbound HTTP or WebSocket API for producers (BL-064).
- Remote or non-local Streamer.bot (BL-023).
- Money values and donation adapters (BL-020).
- Arbitrary expressions, JSONPath, regex and scripts.
- Replaying events that Stream Jams never received.

## Capabilities

### New Capabilities
- `data-overlay-event-rules`: rules, evaluation, subscription starters, deduplication, moderation, reset-on-stream-online, and the Operator pause.
- `streamerbot-data-sources`: Streamer.bot custom broadcast event types and global-variable values.

### Modified Capabilities
- `configuration-backup-restore`: include rules and custom event types.

## Impact

Core owns the rule and schema contracts, matching and effect computation. Server owns the data event consumer and the applied-event log. It also owns a dispatcher that lets video shoutouts and data share Streamer.bot custom broadcasts, and Streamer.bot global-variable sync. Web owns the rule and event-type editors, and the Operator pause toggle. Existing alert, timer and video-shoutout handling is unchanged. Depends on slice 1. Tracked as BL-061.
