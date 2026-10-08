## Context

This change builds on slice 1's values, goals, reset groups and Operator section, and on the central event bus change (BL-025). That bus change is being drafted separately; its feasibility notes are dated 2026-10-08.

What the bus change owns, and this change only references:

- One `StreamEvent` envelope for normalized events (`kind: "normalized"`) and external events (`kind: "external"`, such as Streamer.bot custom broadcasts).
- Validation of external event payloads.
- A semantic `dedupeKey` across sources.
- A durable event journal.
- Consumers that register a filter and own a persisted cursor or queue.
- One shared "event type + conditions" trigger model, built from the alerts condition evaluator.
- Moving video shoutouts and other custom-broadcast handling onto the bus.

Existing facts this change relies on:

- Normalized types include `subscription` (tiers including `prime`), `resubscription`, `gift_subscription` (one recipient), `community_gift` (a batch with `amount`), `cheer`, `raid`, `channel_point_redemption`, `stream_online` and `stream_offline` (`packages/core/src/events/types.ts`).
- Twitch's `channel.subscribe` excludes resubscriptions and flags gift recipients with `is_gift` ([EventSub types](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)).
- Streamer.bot's Fetch URL sub-action supports only GET ([docs](https://docs.streamer.bot/api/sub-actions/core/network/fetch-url)). Users reach Stream Jams through `CPH.WebsocketBroadcastJson`.
- The Streamer.bot WebSocket server offers `GetGlobals` and `GetGlobal` ([requests](https://docs.streamer.bot/api/servers/websocket/requests)), plus `Misc.GlobalVariableCreated`, `Misc.GlobalVariableUpdated` and `Misc.GlobalVariableDeleted` ([events](https://docs.streamer.bot/api/websocket/events/misc)). The update event's payload schema is not documented ("No Schema Available"). Recorded fixtures must come first.

## Decisions

### 1. Data overlays are a bus consumer

The data consumer registers with the bus for the event types its enabled rules reference. For each event, in journal order, it:

1. Finds the matching rules.
2. Computes all their effects against a working copy.
3. Commits the value changes and its cursor checkpoint in one SQLite transaction.

If any effect is invalid, the consumer applies no effect, records a diagnostic with a reference ID, and advances the cursor past the event. One bad event cannot block later ones.

Because the checkpoint and the values commit together, a crash either applies the event fully, or not at all and it replays from the journal. Exactly-once application comes from the bus journal and this checkpoint. This change keeps no separate receipt or applied-event store.

A data failure never affects other consumers, because the bus isolates consumers.

### 2. Rules: shared trigger plus data action

A rule is a bus trigger in the shared model plus a data action:

- a destination value,
- an action (`set`, `add`, `subtract` or `reset`),
- an input: a typed constant, or an event field with an optional integer multiplier.

Validation happens at save. A text field cannot feed an integer add, and a field the event type does not declare is rejected.

Rules for one event run in their persisted order, with ties broken by rule ID. Bounds: 50 rules per value and 500 rules in total.

Rules apply whether or not any canvas is visible or the module is enabled. They stop only when the rule is disabled or the Operator pause is on. Editing a rule never reprocesses past events.

Custom Streamer.bot events reach rules as bus external events. Their event types and field schemas are defined through the bus change, so rule field pickers read them from there. Changing an external event schema disables the data rules that use it until each is re-validated.

### 3. Subscription starters

Two starter rule sets, of which the user picks at most one:

- **Received subs (default):** counts `subscription` (including Prime) and `gift_subscription` once each, and excludes `resubscription` and `community_gift`. A batch of five gifts plus its five recipient events adds 5.
- **Gift batches:** counts `community_gift.amount` and excludes `gift_subscription`.

Management warns when custom rules overlap a starter.

Cross-source duplicates, where Twitch and Streamer.bot both report the same sub, are removed by the bus's semantic `dedupeKey` before rules see them.

### 4. Text moderation

Any text written from an event field passes `renderedText` moderation (`packages/core/src/moderation/moderation-service.ts`) before it is stored. Every output then shows the same cleaned value, including usernames.

### 5. Reset on stream online

A reset group can opt into "reset on stream online". It is implemented as a built-in rule on the bus `stream_online` type, so it uses the same consumer checkpoint and the same exactly-once guarantee.

### 6. Operator pause

The Operator Data section gets a persisted "Pause automatic updates" toggle. While paused, the consumer still advances its cursor and logs skipped events, so events are not applied later. Manual Operator controls keep working.

### 7. Streamer.bot global variables (outside the bus)

A global variable is current state, not an event, so it is a provider-backed value rather than a bus event. The user maps a persisted global by name to a read-only integer or text value:

- On connect or reconnect, `GetGlobal` takes a snapshot.
- `GlobalVariableUpdated` applies changes.
- `GlobalVariableDeleted` marks the value's source ended.
- A disconnect marks it stale, and slice 1's stale policy decides what shows.

Type mismatches mark the source in error and keep the last good value. If the bus change later carries Streamer.bot variable events, this sync can move onto it without changing the value contract.

## Risks / Trade-offs

- **The bus change must land first.** If it slips, this slice waits. Slices 1, 3 and 4 do not depend on it.
- **Undocumented global-variable payloads.** Recorded fixtures come first. If unusable, ship rules first and defer globals.
- **Rule order matters.** The editor shows the evaluation order and allows reordering.

## Migration Plan

Forward migrations add rules, global mappings, the consumer checkpoint and the pause flag. Existing profiles get no rules. A new consumer starts at the journal head, so past events are not applied.
