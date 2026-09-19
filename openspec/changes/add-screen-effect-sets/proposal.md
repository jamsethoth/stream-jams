## Why

Screen Effects needs the same set/effect/variant hierarchy as Alerts. Operators need one active collection for live events and inactive collections they can prepare without changing live admission.

## What Changes

- Persist named sets with exactly one active set, and migrate existing effects into active Default.
- Provide create, rename, duplicate, activate and delete set operations with protected live-impact confirmation.
- Present expandable sets, effects and variants in module configuration and editor navigation.
- Keep explicit saved tests and existing queued snapshots independent of subsequent set activation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `screen-effects`: Set membership, activation and hierarchical authoring.

## Impact

Core contracts, SQLite migration, typed repositories, management APIs, live admission, management routing, React views and coverage. No new dependencies or output protocols.
