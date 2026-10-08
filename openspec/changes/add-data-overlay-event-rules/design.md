## Context

Builds on slice 1's values, goals, reset groups and Operator section.

Existing intake:

- `EventIngestionService` admits normalized Twitch EventSub and Streamer.bot events. It deduplicates in memory by provider message ID (`apps/server/src/modules/events/event-ingestion-service.ts`).
- `StreamerBotRuntimeService` accepts one `customEventHandler` for `General/Custom` broadcasts (`apps/server/src/modules/streamerbot/streamerbot-runtime-service.ts:88-91, 374-401`). Video shoutouts use it today, with the marker `source: "StreamJams", type: "VideoShoutout"`.
- Normalized event types include `subscription` (tiers including `prime`), `resubscription`, `gift_subscription` (one recipient), `community_gift` (a batch with `amount`), `cheer`, `raid`, `channel_point_redemption`, and `stream_online`/`stream_offline` (`packages/core/src/events/types.ts`).

External facts:

- Streamer.bot's Fetch URL sub-action supports only GET ([docs](https://docs.streamer.bot/api/sub-actions/core/network/fetch-url)). Users reach Stream Jams through `CPH.WebsocketBroadcastJson`, not HTTP.
- The Streamer.bot WebSocket server offers `GetGlobals` and `GetGlobal` requests ([requests](https://docs.streamer.bot/api/servers/websocket/requests)) and `Misc.GlobalVariableCreated`, `Misc.GlobalVariableUpdated` and `Misc.GlobalVariableDeleted` events ([events](https://docs.streamer.bot/api/websocket/events/misc)). The update event's payload schema is not documented yet ("No Schema Available"). Implementation must capture recorded fixtures from a real Streamer.bot first.
- Twitch's `channel.subscribe` excludes resubscriptions and flags gift recipients with `is_gift` ([EventSub types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)).

## Decisions

### 1. One Streamer.bot custom-broadcast dispatcher

Replace the single `customEventHandler` with an ordered list of handlers keyed by payload marker. Video shoutouts keep `VideoShoutout`, and data uses `Data`. A broadcast that matches no marker goes to normal ingestion, as today. This keeps video-shoutout behavior unchanged while sharing the connection.

### 2. Custom event types

Management defines each custom event type with:

- a stable ID,
- a name used as the `event` field,
- a schema version,
- up to 32 flat fields, each typed `integer`, `text` or `boolean` and marked required or optional.

A data broadcast looks like this:

```json
{ "source": "StreamJams", "type": "Data", "event": "game.death", "schemaVersion": 1, "eventId": "optional-unique-id", "fields": { "weapon": "lava" } }
```

Ingress rejects:

- unknown event names,
- unknown or missing required fields,
- wrong field types,
- unsupported versions,
- messages over 16 KiB,
- text fields over 2 KiB.

A rejection records a sanitized diagnostic with a reference ID and never echoes the payload. Sample JSON in the editor helps pick fields but never changes the schema by itself. Changing a schema disables the rules that use it until they are re-validated and re-enabled.

### 3. Rules

A rule has:

- a source and event type,
- up to 8 AND filters (`equals`, `notEquals`, `>`, `>=`, `<`, `<=` on typed fields),
- a destination value,
- an action (`set`, `add`, `subtract` or `reset`),
- an input: a typed constant, or a field with an optional integer multiplier.

Validation happens at save. A text field cannot feed an integer add, and a reference to a missing field fails.

Rules for one event run in their persisted order, with ties broken by rule ID. The effects are computed against a working copy and committed in one transaction, together with the applied-event record. If any effect is invalid, none apply. The failure is recorded with a reference ID, and the event is not marked applied.

Bounds: 50 rules per value and 500 rules in total.

Data rules run whether or not any canvas is visible or the module is enabled. They stop only when the rule is disabled or the Operator pause is on. A data failure never affects alert, timer or video-shoutout handling.

Rules apply to events as they arrive. Editing a rule never reprocesses past events.

### 4. Applied-event log

For each event that changes data, the system stores an applied record keyed by source and event ID, in the same transaction as the change.

| Source | Event ID |
| --- | --- |
| Twitch | EventSub `message_id` |
| Streamer.bot normalized | Its event ID |
| Custom broadcast | Optional `eventId` |

A custom broadcast without an `eventId` is never deduplicated: each broadcast counts. This lets a simple Streamer.bot action work without generating IDs.

Retention is 48 hours, with at most 10,000 records per source. At the cap, the oldest record for that source is evicted and a diagnostic is recorded. Events are never rejected because the log is full.

The log protects against redelivery and restart races. It does not recover events Stream Jams never received.

### 5. Subscription starters

Two starter rule sets, of which the user picks at most one:

- **Received subs (default):** counts `subscription` (including Prime) and `gift_subscription` once each. It excludes `resubscription` and `community_gift`, so a batch of five gifts plus its five recipient events adds 5.
- **Gift batches:** counts `community_gift.amount` and excludes `gift_subscription`.

Management warns when custom rules overlap a starter.

### 6. Streamer.bot global variables

The user picks a persisted Streamer.bot global by name and maps it to a read-only integer or text value:

- On connect or reconnect, `GetGlobal` takes a snapshot.
- `GlobalVariableUpdated` applies changes.
- `GlobalVariableDeleted` marks the value's source ended.
- A disconnect marks it stale, and slice 1's stale policy decides what shows.

Updates for a variable that is not mapped are ignored. Type mismatches, such as text for an integer value, mark the source in error and keep the last good value. Users can copy a provider-backed value into a custom value, but cannot edit it directly.

### 7. Text moderation

Any text written from an event field passes `renderedText` moderation (`packages/core/src/moderation/moderation-service.ts`) before it is stored. Every output then shows the same cleaned value. This includes usernames, because offensive usernames were a common hate-raid vector.

### 8. Reset on stream online

A reset group can opt into "reset on stream online". A normalized `stream_online` event resets the group through the normal transaction, deduplicated by event ID like any other event. This is an event reaction, not a scheduler.

### 9. Operator pause

The Operator Data section gets a persisted "Pause automatic updates" toggle. While paused:

- events are acknowledged and logged as skipped,
- they are not applied later,
- manual Operator controls still work.

## Risks / Trade-offs

- **Undocumented global-variable payloads.** Recorded fixtures come before implementation. If the payload proves unstable, ship custom broadcasts first and defer globals.
- **Custom broadcasts without IDs can double-count on a Streamer.bot retry.** Streamer.bot does not retry broadcasts, and the docs tell users to add an `eventId` when it matters.
- **Rule order matters.** The editor shows the evaluation order and lets users reorder rules.

## Migration Plan

Forward migrations add rules, custom event types, global mappings, the applied-event log and the pause flag. Existing profiles get no rules.
