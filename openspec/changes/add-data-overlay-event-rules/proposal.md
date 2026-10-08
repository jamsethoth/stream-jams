## Why

Slice 1 ([`add-custom-data-overlays`](../add-custom-data-overlays/proposal.md)) gives streamers shared values they change by hand. Most counters should move on their own: subs received, deaths in a game, a "latest supporter" label.

Jams decided on 2026-10-08:

- Stream Jams listens to events from tools it already connects to, such as Streamer.bot.
- All event sources will feed one central event bus: a durable journal with a shared selector that every module reads. It is planned as `add-central-event-bus` (BL-025, draft PR #160).

Data overlays therefore have no event intake of their own. They are one more consumer of the bus.

## What Changes

- Register a data overlays consumer on the central event bus. It uses the bus's transactional checkpoint and opts out of replay expiry, so each event applies exactly once.
- Add update rules. A rule selects a canonical event type (through the shared selector) or a custom event type, with optional payload filters, and applies a data action: set, add, subtract or reset a destination value. The input is a constant, or an event field with an optional integer multiplier. No scripts or expressions.
- Add custom event types for Streamer.bot broadcasts marked `"source": "StreamJams", "type": "Data"`. They arrive as bus external events through `CPH.WebsocketBroadcastJson`. This consumer validates their versioned flat schemas.
- Add subscription starter rules that count each subscriber once and never double-count a gift batch and its recipients.
- Moderate any text written from an event field with the existing rendered-text moderation before storing it.
- Add an optional "reset on stream online" trigger for a reset group.
- Add an Operator toggle that pauses automatic updates while manual controls keep working.
- Add Streamer.bot global variables as read-only provider-backed values. They are a snapshot value source, not an event stream, so they sit outside the bus.

## Out of scope

- The bus itself: envelope, sources, deduplication and merging, journal, checkpoints and the shared selector. These belong to `add-central-event-bus`.
- An inbound HTTP or WebSocket API for producers (BL-064).
- Remote or non-local Streamer.bot (BL-023).
- Money values (BL-020).
- Replaying events Stream Jams never received.

## Capabilities

### New Capabilities
- `data-overlay-event-rules`: the bus consumer, rule actions, subscription starters, moderation, reset-on-stream-online, Operator pause.
- `streamerbot-data-sources`: custom event types for Streamer.bot data broadcasts, and Streamer.bot global-variable values.

### Modified Capabilities
- `configuration-backup-restore`: include data rules, custom event types and global mappings.

## Impact

Core owns custom event schemas, rule-action contracts and effect computation, and reuses the bus selector for canonical matching. Server owns the data consumer, its checkpoint and Streamer.bot global-variable sync. Web owns the custom event type editor, the rule editor (built on the shared selector editor), the Operator pause toggle and the global-variable picker.

Depends on slice 1 and on the central event bus change. Existing alert, timer and video-shoutout handling is not changed here. Tracked as BL-061.
