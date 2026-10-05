## Why

Active timers currently disappear when Stream Jams closes and cannot respond directly to received events. Persistent runs, event rules, and manual corrections let streamers manage subathons and redemption challenges locally.

## What Changes

- Persist active timer runs and restore them paused without deducting offline time.
- Add per-timer event rules for start, stop, increment, decrement, and restart, with source/type/reward filters and fixed or quantity-based adjustments.
- Default inactive adjustments to no action; optionally create a running or paused run using the saved duration before adjustment.
- Add manual add/subtract/set-remaining controls in Timers and Operator.
- Retain current event intake and duplicate protection; no hosted receivers or historical replay.

## Capabilities

### New Capabilities
- `persistent-event-timers`: Durable active runs, event rules, and manual runtime duration updates extending the existing timer module.

### Modified Capabilities
None. The initial timer capability remains in its existing unarchived change; this follow-up supersedes its ephemeral-run restriction.

## Impact

Core contracts, SQLite migration/repositories, timer coordinator, normalized event pipeline, authenticated management routes, Timers and Operator UI, Storybook, and Playwright. No new dependencies or broader event-delivery guarantees.
