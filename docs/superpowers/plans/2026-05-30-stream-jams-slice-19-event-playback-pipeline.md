# Slice 19: Event-To-Playback Pipeline

**Goal:** Wire normalized stream events from ingestion into alert matching, resolved playback queue items, overlay dispatch, and diagnostics log records.

**Base requirements:** `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` Slice 19.

## Sub-Slice 19.1: Event Pipeline Service

**Objective:** Add a service that accepts `NormalizedStreamEvent`, records ingestion, calls `PlaybackCoordinator.enqueueEvent`, and records alert match and playback outcomes.

**Files or areas:** `apps/server/src/modules/events/event-pipeline.ts`, event pipeline tests.

**Tests:**

- Accepted events append a received event log before playback work.
- Queued events append alert match logs and a queued playback log.
- No-match, duplicate, and cooldown outcomes remain processed without playback logs.
- Playback failures append failed event logs without leaking provider payloads.

- [ ] Complete.

## Sub-Slice 19.2: Server Wiring

**Objective:** Wire `EventIngestionService` to the event pipeline instead of a no-op sink, using SQLite diagnostics logs and the existing `PlaybackCoordinator`.

**Files or areas:** `apps/server/src/index.ts`.

**Tests:**

- Existing startup type/build checks prove the wiring composes.
- Event pipeline tests cover the sink contract directly.

- [ ] Complete.

## Sub-Slice 19.3: Overlay Dispatch Assurance

**Objective:** Confirm synthetic Twitch events reach the playback coordinator and overlay instruction sink through the pipeline.

**Files or areas:** `apps/server/src/modules/events/event-pipeline.test.ts`, existing playback coordinator behavior.

**Tests:**

- Synthetic Twitch follow/cheer event produces queue output with resolved overlay instructions.
- Module-specific and unified overlay target behavior remains owned by resolver/coordinator tests.

- [ ] Complete.

## Reconciliation Checklist

- [ ] Wire normalized events into the alert matcher.
- [ ] Resolve each match into visual, audio, text, and TTS instructions.
- [ ] Enqueue all resolved alerts for the source event.
- [ ] Dispatch queue state and playback instructions to authorized Alerts module overlay clients.
- [ ] Dispatch the same resolved Alerts module snapshot to unified overlay clients when the Alerts module is enabled.
- [ ] Write event ingestion, alert match, and playback log records.
- [ ] Unit test pipeline behavior with mocked repositories, matcher, resolver, queue, gateway, and logger.
- [ ] Integration test a synthetic Twitch follow event reaching test overlay playback.
- [ ] Commit with message `feat: wire event playback pipeline`.

## Final Validation

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:e2e`
- [ ] `pnpm build`
- [ ] `git diff --check`
