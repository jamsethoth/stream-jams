## Context

The runtime already owns one `DefaultPlaybackQueue`, a `PlaybackCoordinator`, a typed `PlaybackQueueSnapshot`, and management-protected `GET /playback` plus pause, resume, mute, unmute, skip, replay, and do-not-disturb commands. The management refactor deliberately removed live playback controls because management is for setup; the approved product split reserves stream-time actions for a separate `/operator` route using the same local app session.

The operator change must therefore expose existing behavior without reviving `/legacy/playback`, embedding controls in Home, or creating a second queue API. The current queue state is in memory, including paused, muted, and do-not-disturb flags.

## Goals / Non-Goals

**Goals:**

- Provide a focused second-monitor surface for now playing, queue, recent playback, and existing direct controls.
- Keep management and operator navigation distinct while sharing local session, typed clients, status primitives, and diagnostics links.
- Persist paused, muted, and do-not-disturb safety state across restart.
- Make every command outcome visible and keep errors actionable and redacted.

**Non-Goals:**

- Intake pause/resume, queue clearing, event history, live moderation, alert editing, or raw provider payloads.
- A new WebSocket protocol, queue implementation, UI framework, or remote/LAN operator mode.

## Decisions

### Add a top-level operator route, not a management page

The web entrypoint will dispatch `/operator` to an operator shell that reuses the existing same-origin management session bootstrap but omits management navigation and editing surfaces. Management exposes one `Open operator console` link.

Alternative considered: add controls to Home or Alerts. Rejected because it contradicts the approved setup-versus-live product split and makes a configuration page unsafe to leave open during a stream.

### Reuse the playback snapshot and command routes

The web client will parse `PlaybackQueueSnapshot`, poll `GET /playback` at a bounded interval, and replace local state immediately with each command response. Polling pauses when the document is hidden and retries with bounded backoff while retaining the last known snapshot as stale.

Alternative considered: add operator WebSocket messages. Rejected because existing HTTP responses already return authoritative state and expected local traffic is small.

### Present safe normalized summaries

Rows show event type, actor label when available, alert count, priority, timestamps, and playback state. They do not render raw provider metadata or arbitrary event JSON. Technical investigation deep-links to filtered Diagnostics.

Alternative considered: render the full normalized event. Rejected because stream-time scanning benefits from a smaller surface and user-controlled text does not belong in the default operator view.

### Persist only runtime safety flags

Paused, muted, and do-not-disturb flags will be stored as validated non-secret app configuration and restored before playback begins. Queue items and recent history remain in memory and start empty after restart. A command persists its next flag state before reporting success; persistence failure leaves the previous runtime state active.

Alternative considered: persist the full queue. Rejected because replaying stale alerts after restart is surprising and requires a durable event/asset migration model beyond this change.

### Keep direct actions fast and explicit

Pause/resume, mute/unmute, DND, and skip act directly and show persistent state plus short completion feedback. Replay is available only for a known recent item. No confirmation is added to reversible actions; destructive queue clearing remains out of scope.

## Risks / Trade-offs

- [Polling briefly lags runtime changes] -> Update from command responses immediately and use a short bounded visible-tab interval.
- [Persisted DND or mute surprises after restart] -> Restore it deliberately and show a prominent persistent status strip until cleared.
- [Operator UI exposes too much event content] -> Render an allowlisted summary and link to already-redacted Diagnostics.
- [A command succeeds but the refresh fails] -> Treat the command response as authoritative and mark only later polling failure as stale.

## Migration Plan

1. Add validated defaults for persisted playback safety flags; older config reads as all false.
2. Restore flags while composing the playback queue and persist mutations through the existing config store.
3. Add typed web client methods and the `/operator` route without changing existing playback endpoints.
4. Add the management link after the operator route is usable.
5. Roll back by removing the route and ignoring the additive config fields; existing queue behavior remains available to the server.

## Open Questions

None.
