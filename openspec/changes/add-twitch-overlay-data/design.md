## Context

The Twitch module already connects EventSub over WebSocket with a user token. It requests `bits:read`, `channel:read:hype_train`, `channel:read:polls`, `channel:read:predictions`, `channel:read:redemptions`, `channel:read:subscriptions` and `moderator:read:followers` (`apps/server/src/modules/twitch/twitch-oauth-service.ts:19-27`). If any of these is missing, the runtime disconnects EventSub with "Twitch authorization update required" (`twitch-eventsub-runtime-service.ts:105`).

External facts:

- Get Channel Followers returns `total` with any valid token. The follower list itself needs `moderator:read:followers` ([Twitch dev forum](https://discuss.dev.twitch.com/t/get-followers-count/48066)).
- Creator Goals need `channel:read:goals`. Twitch's docs say: "Although the API currently supports only one goal, you should write your application to support one or more goals" ([Creator Goals](https://dev.twitch.tv/docs/api/goals/)). Letting creators run several goals at once is an open creator request ([UserVoice](https://twitch.uservoice.com/forums/923383-creators-and-stream-features/suggestions/44479266-let-streamers-have-multiple-goals-at-one-time)).
- Goal types are `follower`, `subscription`, `subscription_count`, `new_subscription` and `new_subscription_count`. The `subscription` types count tier points, not subscribers, so a tier 2 sub adds 2 ([Creator Goals](https://dev.twitch.tv/docs/api/goals/)).
- EventSub WebSocket has "no replay of events that are lost" after a dropped connection ([Twitch](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)).

## Relationship to the central event bus

The central event bus (BL-025) carries Twitch events to every module. Goal begin, progress and end events reach this source through the bus when the bus carries them; otherwise they come through a bus consumer registered for those types. The follower total and goal snapshots are polled state from Helix, not events, so they stay in this source. Follow events trigger the early follower refresh through the bus.

## Decisions

### 1. Optional capability scopes

Split the scope list into:

- **Required scopes:** today's list. Missing ones keep today's behavior.
- **Optional capability scopes:** `channel:read:goals`. A missing goal scope marks only the goal source as needing reauthorization, shows a reconnect action on that source, and leaves alert intake running.

Reconnecting requests both sets. The follower total needs no new scope.

### 2. Follower total

The follower total is a read-only integer value that Twitch owns.

- Startup and reconnect read `total`.
- After that it refreshes every 60 seconds. On 429 or 5xx responses, it backs off exponentially up to 5 minutes and honors Twitch's rate-limit reset header.
- A follow event schedules an early refresh, at most one every 10 seconds. A follow event never increments the total directly.
- Each request carries a connection epoch, and responses from an older epoch are discarded.
- The source is stale after a failed refresh and ready again after a successful one.

Users can build slice 1 saved-baseline goals on the follower total ("50 more followers from here").

### 3. Creator Goals as a list

The goal source keeps the list of active goals from Get Creator Goals. Each goal has its ID, type, description, current amount, target and timestamps.

For EventSub:

- Subscribe to `channel.goal.begin`, `channel.goal.progress` and `channel.goal.end`.
- Take the snapshot after the subscriptions are active.
- Buffer events that arrive during the snapshot (at most 100). Apply buffered events newer than the snapshot. If the buffer overflows, take a new snapshot.
- On reconnect, take a new snapshot and discard results from older epochs.

### 4. Goal bindings follow a type by default

A goal binding has one of two modes:

- **Active goal of type** (default): bound to a type such as `follower`. It shows the active goal of that type. If several are active, it shows the most recently started one, and Management displays which one. When that goal ends and another of the same type begins, the binding moves to the new goal with no user action. With no active goal of that type, the source is in the ended state, and slice 1's stale policy hides the element.
- **Pinned goal** (optional): bound to one goal ID. When it ends, the source is ended and Management asks the user to rebind.

Provider goals are read-only and keep Twitch's type and units. A `subscription` goal is labeled as sub points, not subscribers. If a different broadcaster account connects, every Twitch binding is invalidated and must be selected again.

## Risks / Trade-offs

- **Follower total lags by up to 60 seconds**, plus the early refresh after a follow. That is acceptable for an overlay and far more accurate than counting events.
- **Twitch may add goal types or concurrent goals.** Unknown goal types are shown in Management but cannot be bound until supported. The list model already handles several goals.

## Migration Plan

No data migration is needed beyond source and binding configuration. Existing Twitch connections keep working. The goal source asks for reauthorization on its own when the scope is missing.
