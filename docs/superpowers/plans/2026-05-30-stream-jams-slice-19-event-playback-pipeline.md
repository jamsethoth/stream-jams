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

- [x] Complete.

## Sub-Slice 19.2: Server Wiring

**Objective:** Wire `EventIngestionService` to the event pipeline instead of a no-op sink, using SQLite diagnostics logs and the existing `PlaybackCoordinator`.

**Files or areas:** `apps/server/src/index.ts`.

**Tests:**

- Existing startup type/build checks prove the wiring composes.
- Event pipeline tests cover the sink contract directly.

- [x] Complete.

## Sub-Slice 19.3: Overlay Dispatch Assurance

**Objective:** Confirm synthetic Twitch events reach the playback coordinator and overlay instruction sink through the pipeline.

**Files or areas:** `apps/server/src/modules/events/event-pipeline.test.ts`, existing playback coordinator behavior.

**Tests:**

- Synthetic Twitch follow event produces queue output with resolved overlay instructions.
- Module-specific and unified overlay target behavior remains owned by resolver/coordinator tests.

- [x] Complete.

## Reconciliation Checklist

- [x] Wire normalized events into the alert matcher.
- [x] Resolve each match into visual, audio, text, and TTS instructions.
- [x] Enqueue all resolved alerts for the source event.
- [x] Dispatch queue state and playback instructions to authorized Alerts module overlay clients.
- [x] Dispatch the same resolved Alerts module snapshot to unified overlay clients when the Alerts module is enabled.
- [x] Write event ingestion, alert match, and playback log records.
- [x] Unit test pipeline behavior with mocked repositories, matcher, resolver, queue, gateway, and logger.
- [x] Integration test a synthetic Twitch follow event reaching test overlay playback.
- [x] Commit with message `feat: wire event playback pipeline`.

## Final Validation

- [x] `pnpm lint` - passed.
- [x] `pnpm typecheck` - passed.
- [x] `pnpm test` - passed: 76 files, 293 tests.
- [x] `pnpm test:e2e` - attempted; local Chromium failed before app assertions because `libnspr4.so` is missing from the Playwright runtime.
- [x] `pnpm build` - passed.
- [x] `git diff --check` - passed.

## Verification Evidence

- Focused: `pnpm test:unit apps/server/src/modules/events/event-pipeline.test.ts apps/server/src/modules/events/event-ingestion-service.test.ts apps/server/src/modules/playback/playback-coordinator.test.ts` - passed: 3 files, 12 tests.
- Full suite: `pnpm test` - passed: 76 files, 293 tests.
- E2E blocker: both Chromium specs fail at browser launch with `error while loading shared libraries: libnspr4.so: cannot open shared object file`; no application assertions ran.
