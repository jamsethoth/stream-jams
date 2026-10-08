# Proposal: Add Central Event Bus

## Why

Stream Jams can only listen to one event source at a time. A unique index allows one active `event-source` registration, the runtime coordinator disconnects direct Twitch whenever Streamer.bot starts (and the reverse), and the EventSub handler drops notifications unless Twitch is the active source. Streamers who want direct Twitch for subs and cheers plus Streamer.bot for custom events must choose one.

Modules also see events through different, hardcoded paths. `EventPipeline` calls Alerts, Screen Effects, and Timers by name. Alerts match normalized Twitch-shaped events; Screen Effects match separate `twitch-reward` and `streamerbot-event` triggers; Video shoutouts bypass the pipeline through a Streamer.bot `customEventHandler`. As a result an effect cannot fire on a 100-bit cheer, an alert cannot fire on a custom Streamer.bot event, and every new module (custom data overlays, Videos) needs its own intake wiring.

Alert and effect admission also depends on in-memory dedupe and an in-memory hand-off, so an event accepted just before a restart can be lost, which conflicts with the project rule that module queues survive restarts.

## What Changes

- Add a framework-independent **central event bus**. Every active event source publishes into it; every module consumes from it.
- Introduce one **bus event envelope** that carries either a canonical normalized event or a validated external event, plus source registration identity, a semantic dedupe key, and receive time.
- Persist accepted events in a bounded SQLite **event journal** with per-consumer delivery cursors, so admission resumes after restart. Replay is bounded by a maximum event age so a long outage does not fire stale alerts.
- Replace ID-only dedupe with **semantic dedupe keys** so the same real Twitch event delivered by direct Twitch and by Streamer.bot is accepted once (first arrival wins).
- Allow **multiple active event sources**: at most one active registration per event-source provider kind (direct Twitch and Streamer.bot can both be active). Music and TTS keep one active provider.
- Introduce a shared **event trigger selector** (canonical event type or exact external identity, optional source restriction, typed conditions) used by Alerts, Screen Effects, Timers, and future consumers. Existing effect bindings and timer rules migrate losslessly.
- Let **Alerts trigger on external events**, rendering only allowlisted summary fields.
- Register Alerts, Screen Effects, Timers, and Video shoutout intake as bus consumers instead of hardcoded pipeline calls, and make the bus the intake for custom data overlays (BL-055).
- Show per-source live status and overlap warnings on the Event sources page, and a bus-event view in Diagnostics.

## Capabilities

### New Capabilities

- `central-event-bus`: one validated, deduplicated, journaled stream of events from all active sources, delivered independently to registered module consumers through a shared trigger selector.

### Modified Capabilities

- `streamerbot-live-ingestion`: runtimes synchronize from all active registrations instead of switching between one; pipeline delivery goes through the bus.
- `management-ui-ux`: event sources may have one active registration per provider kind; the page shows each source's usage and live status and warns about overlap.
- `screen-effects`: effect bindings use the shared trigger selector and may match any canonical or external event; the single-active-provider clause is removed.
- `persistent-event-timers`: timer rules use the shared trigger selector and the bus dedupe policy.
- `alert-configuration-management`: alerts may trigger on external events with allowlisted fields.

## Non-Goals

- Persisting admitted-but-unplayed Alert and Screen Effects occurrences across restart. The bus guarantees no accepted event is lost before admission; durable module playback queues are tracked separately (BL-066).
- New event providers (BL-021), money values (BL-020), LAN or non-local sources (BL-023).
- Several active registrations of the same provider kind (for example two Streamer.bot instances).
- Operator event review and replay console (BL-038).
- Changing Video shoutout or custom data overlay behavior beyond moving their intake onto the bus; those changes own their module semantics.

## Impact

- Affected code: `packages/core/src/events` (envelope, dedupe key, selector, schemas), new `packages/core/src/event-bus`, `apps/server/src/modules/events` (ingestion, pipeline becomes bus publisher), new SQLite journal repository and migration, `runtime/event-source-runtime-coordinator.ts`, `runtime-composition.ts`, provider registration repository and activation impact, Screen Effects bindings and trigger matcher, timer rule matching, alert matching and editor, Streamer.bot runtime custom handler, Event sources and Diagnostics management pages, Storybook, Playwright.
- Data migration: drop the one-active-per-capability index for `event-source` only and replace it with one active per provider kind; migrate `screen_effect_bindings` and timer rules to the selector shape.
- No new external dependencies.
- Coordination: the custom data overlays proposal (BL-055) and the Videos module work consume bus events; they own their module behavior, this change owns intake.
