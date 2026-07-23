## Context

The runtime already owns one `DefaultPlaybackQueue`, a `PlaybackCoordinator`, a typed `PlaybackQueueSnapshot`, and management-protected `GET /playback` plus pause, resume, mute, unmute, skip, replay, and do-not-disturb commands. The management refactor deliberately removed live playback controls because management is for setup; the approved product split reserves stream-time actions for a separate `/operator` route using the same local app session.

The operator change must therefore expose existing behavior without reviving `/legacy/playback`, embedding controls in Home, or creating a second queue API. The current queue state is in memory, including paused, muted, and do-not-disturb flags.

Repository tracing found two incomplete existing control semantics that the operator cannot expose as-is: `skipCurrent()` advances server queue state without removing the already-delivered overlay instruction, and `mute()` changes only the snapshot flag. BL-001 closes those gaps through the existing overlay WebSocket connection. It does not add a separate operator socket or provider-control channel.

## Goals / Non-Goals

**Goals:**

- Provide a focused second-monitor surface for now playing, queue, recent playback, and existing direct controls.
- Keep management and operator navigation distinct while sharing the local management-authentication boundary, typed clients, status primitives, and diagnostics links.
- Persist paused, muted, and do-not-disturb safety state across restart.
- Stop active overlay instructions before skip advances playback, and make browser-source mute state authoritative for connected and reconnecting overlays.
- Delay remote TTS dispatch until an item actually starts and suppress new remote triggers while muted.
- Make every command outcome visible and keep errors actionable and redacted.

**Non-Goals:**

- Intake pause/resume, queue clearing, event history, live moderation, alert editing, or raw provider payloads.
- A separate operator WebSocket, queue implementation, UI framework, remote/LAN operator mode, or provider-specific command for recalling speech already triggered in an external TTS application.

## Decisions

### Add a top-level operator route, not a management page

The web entrypoint will dispatch `/operator` to an operator shell that reuses the existing same-origin management-session bootstrap but omits management navigation and editing surfaces. Each tab obtains its own ephemeral session through that bootstrap; bearer and CSRF values are not copied through URLs or persisted for cross-tab reuse. Management exposes one `Open operator console` anchor in the same rightmost header-action position as the operator surface's `Back to management` anchor. Ordinary activation stays in the current tab; modified activation retains native browser behavior.

Alternative considered: add controls to Home or Alerts. Rejected because it contradicts the approved setup-versus-live product split and makes a configuration page unsafe to leave open during a stream.

### Reuse the playback snapshot and command routes

The web client will parse `PlaybackQueueSnapshot`, poll `GET /playback` at a bounded interval, and replace local state immediately with each command response. Polling pauses when the document is hidden and retries with bounded backoff while retaining the last known snapshot as stale.

Alternative considered: add operator WebSocket messages. Rejected because existing HTTP responses already return authoritative state and expected local traffic is small.

### Complete skip and mute over the existing overlay socket

The overlay gateway will retain the authoritative browser-source mute state and send it when a client connects and whenever mute changes. One existing-socket stop message removes the current item's instruction IDs before the coordinator advances and delivers the next item. Browser audio elements, video elements with embedded audio, and browser speech respond to mute immediately.

Remote TTS dispatch moves from event enqueue to immediately after the current item's overlay instructions are delivered. Muted items do not trigger remote TTS. Speech already handed to Speaker.bot or another external provider cannot be revoked because BL-001 adds no provider-specific stop API; the operator copy and tests preserve that boundary.

Alternative considered: keep the current flag-only mute and queue-only skip. Rejected because the operator would report successful controls while live output continued unchanged. A separate operator WebSocket was also rejected because the authorized overlay connection already reaches the affected renderer.

### Present safe normalized summaries

Rows show event type, actor label when available, alert count, priority, timestamps, and playback state. They do not render raw provider metadata or arbitrary event JSON. Technical investigation deep-links to filtered Diagnostics.

Alternative considered: render the full normalized event. Rejected because stream-time scanning benefits from a smaller surface and user-controlled text does not belong in the default operator view.

### Persist only runtime safety flags

Paused, muted, and do-not-disturb flags will be stored as validated non-secret app configuration and restored before playback begins. Queue items and recent history remain in memory and start empty after restart. A command persists its next flag state before reporting success; persistence failure leaves the previous runtime state active.

Alternative considered: persist the full queue. Rejected because replaying stale alerts after restart is surprising and requires a durable event/asset migration model beyond this change.

### Keep direct actions fast and explicit

Queue pause/resume, mute/unmute, DND, and skip act directly and show persistent state plus short completion feedback. Queue-pause copy explicitly says that the current alert continues while queued alerts wait. Replay is available only for a known recent item. No confirmation is added to reversible actions; destructive queue clearing remains out of scope.

## Risks / Trade-offs

- [Polling briefly lags runtime changes] -> Update from command responses immediately and use a short bounded visible-tab interval.
- [Persisted DND or mute surprises after restart] -> Restore it deliberately and show a prominent persistent status strip until cleared.
- [Operator UI exposes too much event content] -> Render an allowlisted summary and link to already-redacted Diagnostics.
- [A command succeeds but the refresh fails] -> Treat the command response as authoritative and mark only later polling failure as stale.
- [A skipped instruction remains visible long enough to overlap the next item] -> Broadcast stop for every current instruction before advancing and test the overlay removal order.
- [A reconnecting browser source misses the current mute state] -> Store mute in the gateway and send it immediately after authorized registration.
- [External TTS is already speaking when mute is selected] -> Stop new triggers and state plainly that already-triggered provider speech cannot be recalled.

## Migration Plan

1. Add validated defaults for persisted playback safety flags; older config reads as all false.
2. Restore flags while composing the playback queue and gateway, then persist mutations through the existing config store before applying them in memory.
3. Extend the existing overlay socket parser and renderer with stop and audio-state messages; do not add a second transport.
4. Move remote TTS dispatch to current-item delivery so pause, do-not-disturb, and mute state are respected.
5. Add typed web client methods and the `/operator` route without changing existing playback endpoint paths.
6. Add the management link after the operator route is usable.
7. Roll back by removing the route and socket-message handlers and ignoring the additive config fields; existing queue behavior remains available to the server.

## Open Questions

None.
