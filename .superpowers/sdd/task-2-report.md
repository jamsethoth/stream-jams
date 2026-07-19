# Task 2 Report: Direct Twitch EventSub Coverage

## Scope

Implemented only OpenSpec checkpoint 2 on `codex/refactor-management-ui-ux` from `d037da0`.

## Changed Files

- `apps/server/src/modules/twitch/twitch-event-normalizer.ts`: added direct EventSub types, gift branching, family normalizers, strict nested choice/outcome validation, and broadcaster lifecycle actors.
- `apps/server/src/modules/twitch/twitch-event-normalizer.test.ts`: added table-driven coverage for the expanded EventSub families, terminal statuses, EventSub message IDs, and malformed nested payloads.
- `apps/server/src/modules/twitch/twitch-eventsub-client.ts`: added documented subscription definitions for gifts, Hype Trains, polls, predictions, and stream lifecycle events.
- `apps/server/src/modules/twitch/twitch-eventsub-client.test.ts`: asserted subscription types, versions, required scopes, and broadcaster conditions.
- `apps/server/src/modules/events/event-ingestion-service.test.ts`: verified expanded direct Twitch events use the existing normalized ingestion path.
- `openspec/changes/add-normalized-twitch-event-types/tasks.md`: marked tasks 2.1 through 2.3 complete.

## Direct EventSub Mappings

| EventSub notification | Canonical event |
| --- | --- |
| `channel.subscribe` with `is_gift: true` | `gift_subscription` with recipient actor and optional gifter |
| `channel.subscription.gift` | `community_gift` with aggregate count, tier, cumulative total, and anonymous actor text |
| `channel.hype_train.begin/progress/end` v2 | `hype_train_start/progress/end` |
| `channel.poll.begin/progress/end` v1 | `poll_start/progress/end` |
| `channel.prediction.begin/progress/lock/end` v1 | `prediction_start/progress/lock/end` |
| `stream.online/offline` v1 | `stream_online/offline` |

Lifecycle events use the broadcaster as actor. Every normalized event uses the EventSub message ID. Poll and prediction terminal statuses are preserved. Malformed nested choices and outcomes throw `TwitchEventNormalizationError`.

## Subscription Definitions

- `channel.subscription.gift` v1: `channel:read:subscriptions`
- `channel.hype_train.begin`, `.progress`, `.end` v2: `channel:read:hype_train`
- `channel.poll.begin`, `.progress`, `.end` v1: `channel:read:polls`
- `channel.prediction.begin`, `.progress`, `.lock`, `.end` v1: `channel:read:predictions`
- `stream.online`, `stream.offline` v1: no scope

All new definitions use `broadcaster_user_id`. No individual gift-recipient subscription was added because `channel.subscribe` carries `is_gift`.

## Validation

Initial red run:

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/twitch/twitch-event-normalizer.test.ts
```

Result: failed as expected because gifted `channel.subscribe` still normalized as `subscription`.

Final runs:

```powershell
corepack.cmd pnpm vitest run apps/server/src/modules/twitch/twitch-event-normalizer.test.ts apps/server/src/modules/twitch/twitch-eventsub-client.test.ts apps/server/src/modules/events/event-ingestion-service.test.ts
corepack.cmd pnpm typecheck
```

Result: 3 test files and 27 tests passed; `tsc -b tsconfig.json` passed.

## Self-Review

- Confirmed `is_gift` branches explicitly before ordinary subscriptions.
- Confirmed every required direct notification type is present in both the guard and switch.
- Confirmed canonical payloads pass `normalizedStreamEventSchema` and malformed nested records fail normalization.
- Confirmed no OAuth defaults, management UI, or protected untracked paths were changed.
- Confirmed `git diff --check` passed.

## Concerns

OAuth default scopes intentionally remain unchanged for checkpoint 4. Accounts without the new scopes continue to omit their scope-gated subscriptions until that checkpoint is implemented.
