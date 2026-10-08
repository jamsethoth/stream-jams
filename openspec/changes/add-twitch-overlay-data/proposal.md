## Why

Follower counts and Twitch Creator Goals are the most common data overlays. Counting follow events drifts: unfollows have no event, and EventSub WebSocket does not replay events missed while disconnected ([Twitch](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/)). Twitch provides authoritative totals, so Stream Jams should show those and refresh them, not count events.

## What Changes

- Add a read-only Twitch follower-total value. It reads Get Channel Followers' `total`, refreshes every 60 seconds with rate-limit-aware backoff, and also refreshes early after a follow event.
- Add Twitch Creator Goals as read-only provider goals, modeled as a list as Twitch asks. A goal binding follows the active goal of a chosen type by default (follower, subscription and so on). Pinning a specific goal is optional. When the bound goal ends and a new goal of that type starts, the overlay moves to it without any user action.
- Snapshot goals from the API and apply `channel.goal.begin`, `channel.goal.progress` and `channel.goal.end` events, with reconciliation on reconnect.
- Request `channel:read:goals` as an optional capability scope. A missing goal scope must never disconnect existing alert intake.
- Show source status (waiting, ready, stale, ended, error) in Management. Overlays follow slice 1's stale policy.

## Out of scope

- Charity campaigns and money goals (BL-020).
- Automatic changes to Twitch goals. Stream Jams only reads them.
- Follower lists or leaderboards.

## Capabilities

### New Capabilities
- `twitch-overlay-data`: follower total, Creator Goals, goal binding modes, capability-scoped readiness.

## Impact

Server adds follower polling and goal snapshot and EventSub handling to the Twitch module. It splits `defaultTwitchOAuthScopes` (`apps/server/src/modules/twitch/twitch-oauth-service.ts:19`) into required scopes and optional capability scopes. Today `twitch-eventsub-runtime-service.ts:105` disconnects EventSub when any default scope is missing. Web adds a source picker and status in Data management. Depends on slice 1 ([`add-custom-data-overlays`](../add-custom-data-overlays/proposal.md)). Tracked as BL-062.
