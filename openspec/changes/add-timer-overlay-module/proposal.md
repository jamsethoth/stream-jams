## Why

Streamers need reusable, visible countdowns for time-bounded channel rewards and other live activities without relying on a separate timer application or manually keeping time. Stream Jams already has the shared browser/desktop overlay and explicit audio-routing foundations needed to make timers consistent across operator, audience, and automation workflows.

## What Changes

- Add a registered Timers overlay module with reusable saved timer definitions containing a stable identity, label, duration, optional image/GIF icon, optional start/end sounds, and explicit audio outputs.
- Add one server-authoritative ephemeral run per saved timer definition with start, pause, resume, stop, restart, natural completion, and a three-second completed hold. Active state does not survive an application restart.
- Render active timers through module-specific, unified browser-source, and desktop overlay outputs using one configurable stack region per target profile.
- Support vertical or horizontal equal-sized timer boxes, configurable visible capacity, ellipsized labels, running-first/paused-second urgency ordering, and a small `+N more` overflow badge.
- Add a Timers management page for authoring and full manual controls, plus an active-timers section in Operator.
- Add a loopback-only timer automation HTTP API using a durable, revocable, timer-scoped bearer credential suitable for generic Stream Deck HTTP actions.
- Extend asset usage, audio-route impact, and configuration backup/restore behavior to cover saved timer definitions while excluding live runs and automation secrets from portable state.

## Capabilities

### New Capabilities
- `timer-overlay-module`: Saved timer authoring, authoritative runtime lifecycle, management and Operator controls, overlay presentation, output synchronization, and routed start/end sounds.
- `timer-automation-api`: Timer-scoped credential lifecycle and retry-safe loopback HTTP commands for generic automation clients.

### Modified Capabilities
- `asset-library-management`: Timer icon and cue references participate in asset usage discovery, navigation, replacement, and guarded deletion.
- `alert-audio-routing`: Reusable named audio routes and deletion/rebinding impact include timer start and end cues.
- `configuration-backup-restore`: Portable configuration includes timer definitions and presentation/output settings while excluding active timer state and automation bearer material.

## Impact

- **Core:** timer definition/state schemas, lifecycle reducer/service contracts, ordering and layout projection, automation contracts, and module registration.
- **Server:** SQLite migrations and repositories, timer coordinator, protected management routes, loopback automation routes and credential storage, overlay snapshots/WebSocket updates, audio routing, backups, and runtime composition.
- **Web:** Timers management UI, Operator active-timer controls, browser and desktop overlay timer rendering, Storybook scenarios, and accessibility behavior.
- **Security:** a new least-privilege secret distinct from management sessions and overlay route keys; no token material in URLs, SQLite, logs, diagnostics, exports, browser bundles, or screenshots.
- **Delivery:** browser, desktop, routed-audio, Stream Deck-style HTTP, backup/restore, and packaged Windows verification. No custom Stream Deck plugin, automatic Twitch reward binding, one-off timers, live duration overrides, or cross-restart active-state recovery is introduced.
