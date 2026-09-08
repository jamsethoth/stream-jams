## 1. Dependencies and scope

- [ ] 1.1 Verify implementation, spec sync and packaged acceptance for both foundation changes. Fetch and branch from current `origin/main`; rebase these overlapping alert/Operator deltas without dropping soundtrack/mute scenarios. Proposal readiness does not satisfy dependencies.
- [ ] 1.2 Read all four delta specs and map existing event/asset/route/module/playback adapters in the verification handoff. Retain the separate `/operator` route and single-active-provider model.

## 2. Definitions and persistence

- [ ] 2.1 Add `packages/core/src/screen-effects/` schemas/types for stable IDs, disabled creation, description/category, bindings, weights, priority/cooldown, local media, 1–120-second duration and independent visual/audio selections; test invalid/empty/unknown values and 10-second/priority-0 defaults.
- [ ] 2.2 Add authoring/variant resolution tests and implementation for copy/edit/save, weighted boundaries, embedded/separate/audio-only sources and bounded layout/animation with uniform fitting. Do not create general composition or code execution.
- [ ] 2.3 Add typed effect/variant/binding repositories under `apps/server/src/modules/screen-effects` and the next-numbered transactional DB migration; test restart persistence, rollback, duplicate bindings and references.
- [ ] 2.4 Extend asset/route deletion checks with module-qualified effect owners and impact lists; test concurrent saves versus deletion without dangling references.
- [ ] 2.5 Extend backup/restore with current/legacy fixtures, disabled restored effects and unresolved bindings. Exclude runtime queues/history, live clients and credentials from automatic restored playback.

## 3. Event admission and independent queue

- [ ] 3.1 Reuse normalized Twitch reward/catalog identities and configured Streamer.bot source/type subscriptions. Test renamed/missing rewards, unsubscribed events, safe summaries and rejection of payload-selected files/routes/commands without provider switching.
- [ ] 3.2 Implement module-scoped dedupe, module/effect cooldowns and the 100-pending cap; test redelivery, one event reaching both modules, deterministic intentional multiple bindings, no cooldown on rejection and no overflow eviction.
- [ ] 3.3 Implement one-current Screen Effects queue with priority/FIFO ordering and 25 recent items; test no preemption/overlap, safety holds, audio-only/no-output cases, bounded recipient completion and no restart replay.
- [ ] 3.4 Snapshot variant/content/audio settings/route IDs/duration at admission and replay with a new occurrence ID/fresh bindings; test queued edits, no reroll, missing references and expired history.

## 4. Shared output delivery

- [ ] 4.1 Register `screen-effects` for module/unified/desktop composition with hidden-bottom surface defaults; add module browser-source setup using existing route/profile security without desktop credentials.
- [ ] 4.2 Deliver effects through shared visual/audio adapters; test visual-only, audio-only and combined selections, uniform fitting and at-most-once device delivery across surfaces.
- [ ] 4.3 Audit/extend audio batch/coordinator ownership with globally unique module-qualified occurrences; prove ordinary effect skip/completion preserves an active Alert's browser/device audio and visuals.
- [ ] 4.4 Test readiness, duration-plus-5-second expiry, preparation cancellation, stale generations, monitor/device loss and shared-host crash; settle all audio obligations affected by 2-second stop-timeout destruction while healthy visuals continue.
- [ ] 4.5 Separate visual surface membership from Browser Source audio membership; test hide/reorder without implicit muting or restart and retain duplicate-browser-source/OBS-monitoring setup warnings.

## 5. Merged authoritative operations

- [ ] 5.1 Add a narrow queue-owner adapter and merged server projection carrying module/occurrence identity, queue positions, sanitized summaries, timestamps and stable tie-breaks; test that projection order never drives scheduling.
- [ ] 5.2 Centralize global safety through existing serialized persistence with module pauses separate; test failure atomicity, global resume while one module is paused, existing DND advancement hold and restoration before new playback.
- [ ] 5.3 Add protected module-qualified skip/remove/replay/clear/pause commands; test stale skip after replacement, wrong owner/state, expired IDs, clear-only-pending and auth/CSRF/origin/rate limits while retaining the legacy Alerts adapter.
- [ ] 5.4 Extend `operator/playback-api.ts` and `OperatorApp.tsx` with multiple current rows, merged pending/recent lists, module labels/positions and scoped controls. Preserve no-editing navigation, stale-state recovery, visibility-aware polling and accessible focus/status behavior.

## 6. Management and UI coverage

- [ ] 6.1 Add Screen Effects inventory/editor routes with asset picker, drafts/Undo/Save, shared soundtrack/destination controls, trigger setup links and compact Browser sources. Add no standalone Shared audio page.
- [ ] 6.2 Add explicit bounded Preview/Test naming affected destinations and obeying safety/capability; test silent selection, disabled effects, no outputs, failed save and live-impact confirmation.
- [ ] 6.3 Add production Storybook stories with neutral fixtures for authoring/variants/audio, simultaneous current items, interleaved queue positions, empty/loading/error/stale states and module-qualified keyboard controls.
- [ ] 6.4 Add Playwright create/save/enable/test, event-to-queue, concurrent playback, scoped-action, replay-snapshot, surface-order and restart/restore workflows. Use validated event fixtures without real channel mutations.

## 7. Acceptance and handoff

- [ ] 7.1 Run affected regressions and the `corepack.cmd pnpm` lint, typecheck, test, build, build-storybook, test:storybook:ci, test:e2e and test:desktop scripts; classify failures instead of claiming partial checks as full acceptance.
- [ ] 7.2 Rebuild/restart the authorized runtime, wait for health and verify management-to-Operator-to-OBS/desktop delivery with neutral media and explicit physical audio routes. Record independent skips, missing-monitor behavior and bounded Quit in `docs/verification/screen-effects.md`.
- [ ] 7.3 Reconcile all scenarios with implementation/evidence, run `openspec.cmd validate add-screen-effects-module --strict`, and update product/runbook/backlog after completed implementation and spec sync. Keep marketplace, cross-platform/cloud/fullscreen injection and unrelated modules deferred; do not publish or merge without approval.
