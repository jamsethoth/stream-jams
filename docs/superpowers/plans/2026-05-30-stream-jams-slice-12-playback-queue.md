# Stream Jams Slice 12 Playback Queue Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Slice 12 by queueing resolved alerts from one normalized event, enforcing cooldown and duplicate-event protection, exposing playback state transitions, and adding management-protected playback routes without depending on WebSocket clients.

**Architecture:** Keep queue state, cooldowns, and duplicate tracking in `@stream-jams/core` as pure services. Keep Fastify route handling and event-to-alert orchestration in `apps/server`. The core queue must not import Fastify, SQLite, React, Twitch adapters, filesystem APIs, or WebSocket code.

**Tech Stack:** TypeScript, Zod-backed domain types, Fastify route injection tests, Vitest, existing pnpm workspace scripts.

---

## Source Scope

Base slice: `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`, Slice 12.

Slice 12 required behavior:

- Implement queue enqueue behavior for all resolved alerts from one event.
- Implement priority ordering within an event and across queued items.
- Implement cooldown checks by rule ID and event type.
- Implement duplicate event protection using provider event IDs.
- Implement skip, replay recent, pause, resume, mute, unmute, and do-not-disturb.
- Unit test sequential playback snapshots.
- Unit test cooldown and dedupe behavior.
- Integration test playback control routes.

Acceptance checks:

- Queue logic is testable without WebSocket clients.
- Queue snapshots are serializable for management UI and overlay clients.
- Playback controls do not require direct mutation of queue internals.

Non-goals:

- Overlay WebSocket delivery; Slice 13 owns live transport.
- Management UI for playback controls; later UI slices own browser controls.
- Provider ingestion and Twitch normalization; Slices 17 and 18 own provider integration.
- Durable playback queue persistence; Slice 12 keeps runtime queue state in memory.

## Baseline Evidence

- `origin/main` includes Slice 11 at `fe23af4`.
- Branch `codex/slice-12-playback-queue` was created from fresh `origin/main`.
- `@stream-jams/core` already has `ResolvedAlert`, `PlaybackQueueItem`, `PlaybackQueueSnapshot`, and playback schemas.
- Server app composition already supports optional route groups with management auth and rate-limit hooks.

## File Ownership

- Create `packages/core/src/playback/playback-queue.ts` and tests.
- Create `packages/core/src/playback/cooldown-service.ts` and tests.
- Create `packages/core/src/playback/dedupe-service.ts` and tests.
- Update `packages/core/src/playback/types.ts`, `packages/core/src/playback/schemas.ts`, and `packages/core/src/index.ts` for Slice 12 APIs.
- Create `apps/server/src/modules/playback/playback-coordinator.ts` and tests.
- Create `apps/server/src/http/routes/playback.ts` and route tests.
- Update `apps/server/src/app.ts`, `apps/server/src/app.test.ts`, and `apps/server/src/index.ts` to register playback routes and dependencies.
- Modify `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md` after validation to mark Slice 12 complete.
- Update this plan as execution proceeds: check boxes only after implementation and validation pass.

## Sub-Slice 12.1: Playback Queue Core

**Objective:** Provide an in-memory queue with serializable snapshots and deterministic ordering.

**Expected files or areas touched:**

- `packages/core/src/playback/playback-queue.ts`
- `packages/core/src/playback/playback-queue.test.ts`
- `packages/core/src/playback/types.ts`
- `packages/core/src/playback/schemas.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [ ] Write failing tests for enqueueing all resolved alerts from one source event.
- [ ] Write failing tests for item priority ordering across queued events and preserved alert ordering within one item.
- [ ] Write failing tests for pause, resume, mute, unmute, do-not-disturb, skip, complete, and replay recent state transitions.
- [ ] Implement `DefaultPlaybackQueue` with injected clock and ID generator.
- [ ] Run focused tests and confirm they pass.

**Positive test cases:**

- Enqueueing two alerts for one event creates one queue item with both alerts in input order.
- Higher-priority queued items are played before lower-priority items, with FIFO tie-breaking.
- Completing or skipping the current item advances to the next eligible item when not paused or in do-not-disturb.

**Negative test cases:**

- Empty alert batches are ignored.
- Paused or do-not-disturb queues do not auto-start new items.
- Replay rejects unknown recent item IDs.

**Validation commands:**

- `pnpm test -- packages/core/src/playback/playback-queue.test.ts`

**Acceptance criteria:**

- Queue state is pure, deterministic, and serializable by playback schemas.

## Sub-Slice 12.2: Cooldown And Dedupe Core

**Objective:** Prevent repeated alerts by rule, event type, and provider event ID.

**Expected files or areas touched:**

- `packages/core/src/playback/cooldown-service.ts`
- `packages/core/src/playback/cooldown-service.test.ts`
- `packages/core/src/playback/dedupe-service.ts`
- `packages/core/src/playback/dedupe-service.test.ts`
- `packages/core/src/index.ts`

**Implementation steps:**

- [ ] Write failing cooldown tests for rule ID and event type windows.
- [ ] Write failing cooldown tests for zero-second cooldowns and expired cooldowns.
- [ ] Write failing dedupe tests for repeated provider event IDs and expired dedupe windows.
- [ ] Implement pure cooldown and dedupe services with injected clock.
- [ ] Run focused tests and confirm they pass.

**Positive test cases:**

- A rule/event type pair becomes eligible after its cooldown window expires.
- Duplicate provider event IDs are rejected inside the dedupe window.

**Negative test cases:**

- Zero cooldown does not suppress playback.
- Different provider/event ID pairs do not suppress each other.

**Validation commands:**

- `pnpm test -- packages/core/src/playback/cooldown-service.test.ts packages/core/src/playback/dedupe-service.test.ts`

**Acceptance criteria:**

- Cooldown and dedupe checks are independent of queue, server, provider APIs, and storage.

## Sub-Slice 12.3: Playback Coordinator

**Objective:** Bridge normalized events, active alert rules, matching/resolution, cooldowns, dedupe, and the queue.

**Expected files or areas touched:**

- `apps/server/src/modules/playback/playback-coordinator.ts`
- `apps/server/src/modules/playback/playback-coordinator.test.ts`

**Implementation steps:**

- [ ] Write failing coordinator tests for duplicate event rejection before matching.
- [ ] Write failing coordinator tests for cooldown-suppressed matches.
- [ ] Write failing coordinator tests for enqueueing all resolved alerts from one accepted event.
- [ ] Implement coordinator with injected `AlertService`, `AlertMatcher`, `AlertResolver`, `PlaybackQueue`, cooldown service, dedupe service, clock, and overlay target defaults.
- [ ] Run focused tests and confirm they pass.

**Positive test cases:**

- Accepted events list active rules, match alerts, resolve them, and enqueue one item containing all resolved alerts.
- Queue item priority is derived from the highest matched rule priority.

**Negative test cases:**

- Duplicate events do not call matcher/resolver.
- Cooldown-suppressed matches are not resolved or enqueued.

**Validation commands:**

- `pnpm test -- apps/server/src/modules/playback/playback-coordinator.test.ts`

**Acceptance criteria:**

- Runtime orchestration stays outside HTTP route handlers and remains testable without WebSockets.

## Sub-Slice 12.4: Playback Routes

**Objective:** Expose management-protected playback state and controls.

**Expected files or areas touched:**

- `apps/server/src/http/routes/playback.ts`
- `apps/server/src/http/routes/playback.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/app.test.ts`
- `apps/server/src/index.ts`

**Implementation steps:**

- [ ] Write failing route tests for protected snapshot access.
- [ ] Write failing route tests for pause/resume/mute/unmute/do-not-disturb/skip/replay controls.
- [ ] Write failing app registration test for missing playback route protection.
- [ ] Implement route registration and dependency checks.
- [ ] Wire production server index with in-memory playback services.
- [ ] Run focused tests and confirm they pass.

**Positive test cases:**

- Authenticated management calls return playback snapshots after each control action.
- Replay recent accepts a known recent queue item ID.

**Negative test cases:**

- Missing management auth is rejected before mutating queue state.
- Unknown replay item IDs return a structured 404/400 error.

**Validation commands:**

- `pnpm test -- apps/server/src/http/routes/playback.test.ts apps/server/src/app.test.ts`

**Acceptance criteria:**

- Playback controls are available through protected routes and route handlers delegate to coordinator methods.

## Sub-Slice 12.5: Plan Reconciliation And Full Validation

**Objective:** Reconcile Slice 12 against the base MVP plan, run the standard validation suite, and prepare the PR packet.

**Expected files or areas touched:**

- `docs/superpowers/plans/2026-05-21-stream-jams-mvp-first-pass.md`
- `docs/superpowers/plans/2026-05-30-stream-jams-slice-12-playback-queue.md`

**Implementation steps:**

- [ ] Run architecture scans proving core playback files do not import SQLite, Fastify, React, Twitch, provider adapters, filesystem APIs, or WebSocket code.
- [ ] Update the base MVP plan Slice 12 checklist and completion evidence.
- [ ] Update this detailed plan with validation evidence.
- [ ] Run full validation: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `git diff --check`.
- [ ] Self-review the diff for scope creep and weak tests.
- [ ] Commit with message `feat: add playback queue`.

**Validation commands:**

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `git diff --check`

**Acceptance criteria:**

- Slice 12 is implemented, tested, documented, and ready for PR review.
