# Proposal: Persist Overlay Module Config

## Why

Overlay module configuration currently uses an in-memory runtime repository even though a SQLite repository and table already exist. Module enablement and canvas configuration must survive app restart for the local MVP to behave like a real streamer tool instead of a transient demo.

## What Changes

- Wire runtime overlay module config storage to SQLite.
- Preserve strict schema validation for module config before persistence.
- Add restart-style integration tests proving saved module config survives service recreation.
- Keep module config focused on schema-backed fields, especially the MVP canvas settings.
- Document any wizard fields that are metadata-only or deferred to alert configuration work.

## Capabilities

### New Capabilities

- `overlay-module-config-persistence`: Overlay module enablement and schema-backed config persist across local app restarts.

### Modified Capabilities

None. No repo-local base specs exist yet for this behavior.

## Impact

- Affected code: server runtime composition, SQLite module config repository wiring, module management API, module UI tests, production smoke tests if available, and final-review docs.
- Dependencies: implementation MUST wait until `serve-local-web-app-shell` is merged and present in remote `main` because both changes touch runtime composition.
