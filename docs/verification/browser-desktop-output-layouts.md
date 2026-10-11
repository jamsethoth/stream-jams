# Browser and desktop output implementation evidence

Approved change: `separate-browser-desktop-output-layouts`.
Plan: [ordered slices](../superpowers/plans/2026-10-10-browser-desktop-output-layouts.md).

## Baseline and execution

- Remote `origin/main` fetched at `4dc22d3c`; new branch `codex/browser-desktop-output-implementation` created directly from it.
- Approved design and plan carried forward in commits `0cd0637e`, `5d3294c6`, `3f906441`, `fd0a3aa8` and pushed before product edits.
- Existing isolated Windows worktree reused. System Node reports `v24.15.0`; pnpm reports `11.2.2`. Package manifests remain the runtime authority; no version changes are part of this work.
- Baseline focused overlay checks: `corepack pnpm exec vitest run packages/core/src/overlay-modules apps/server/src/modules/overlay-surfaces` — 12 files, 132 tests passed.
- Baseline `corepack pnpm typecheck` — passed.
- Browser performance baseline captured at clean S01 commit `b64b2e79`, using pinned Node `24.16.0`, Chromium `153.0.8010.12`, Windows `10.0.26200`, i7-12700K. Three ordinary browser recipients: Timer landscape/vertical and Music landscape. Disposable SQLite/secret store, loopback Pear fixture and offline video metadata; no real profiles or external provider requests.
- Four baseline phases: idle (10s), 14 timers/capacity 12 (10s), five track changes at 3.2s (16s), 20 canonical events plus 20 immediate redeliveries (10s). Node CPU including benchmark controller was 1.720%, 1.720%, 0.294%, 5.631% of one logical core respectively; RSS 154.34, 147.18, 147.79, 154.22 MiB. These are observations, not speedup claims or whole-browser/GPU measurements.
- Canonical ingestion accepted 20 and deduplicated 20; p50 91.87ms/p95 112.02ms, with an unexplained 1484.91ms maximum retained for comparison. Five successful video POSTs produced five queue items (9.30–13.99ms), without playback. A benchmark response-parser defect labeled those item statuses unknown; success and final queue counts were verified, parser corrected without request replay.
- Baseline assets/recipe currently live in the plan's ignored workspace: `baseline-report.md`, `baseline/measure.mjs`, `baseline/pinned-run/{metrics.json,saved-configs.json,compiled-sha256.json}` and 12 screenshots. Preserve/sanitize relevant evidence into delivery artifacts in S11 before cleaning scratch. Candidate comparisons use the same fixture/load and separate compact-viewport runs.
- Not yet measured: native OBS/GPU/desktop/audio, actual video decode/encode, all-five-module candidate integration, long-run resource bounds and crash redelivery. Owning slice tests and S11 must supply or explicitly bound this evidence.

## Delivery decisions

- Use one feature branch and push accepted slices in order, as requested. The parent reviews actual diffs and verification before committing; implementers do not publish independently.
- One independent final review follows repository model instructions. In-scope findings must be fixed and re-reviewed before completion; no review-loop cap overrides the user's instruction.
- No real streaming profile or production data is used for automated acceptance. Physical OBS/GPU evidence is reported separately.

## Slice evidence

### S01 — Accepted

Explicit `renderer.supportsDesktopComposition` now governs private desktop membership. Public unified membership remains unchanged. Registry validation, repository reconciliation, settings save and runtime wiring use the appropriate capability; the private sink regression proves module-only desktop delivery.

Parent reviewed all production changes, tests and report; no open findings. Focused regression: 17 files / 180 tests passed (overlay module/surface, public routes and desktop runtime). Core/server typecheck and build passed; ESLint across 18 changed TypeScript files and whitespace checks passed. Red-phase repository tests failed on old membership as expected. No data migration or public UI change in this prerequisite.

### S02 — Accepted

Added strict bounded manual-event contracts, trusted submission context, truthful manual diagnostics and migration 042. Provider registration types remain provider-only. Existing Alerts/Effects/Videos dispatch paths explicitly no-match manual events until their owning slices activate them; no new public injection route was added.

Parent review requested one fix: manual receipts must not wait indefinitely for an unrelated consumer. The implementation now journals first, returns outcomes after a bounded wait (100ms default, 1000ms maximum), retains pending identity, coalesces background work and tracks it through normal runtime shutdown. Regression covers 20 concurrent submissions and a blocked consumer without duplicate admission or lost wakeups. Parent reviewed the fix and migration/consumer/schema/UI diffs; no open S02 findings.

Verified: 15 focused files / 169 tests; full workspace strict typecheck/emission; changed-file ESLint and error-provenance check; production web build and bundle checks; Storybook build and 11 targeted Diagnostics stories with a11y/console hooks; rebuilt disposable Diagnostics Playwright test (1 passed). Populated old-schema migration preserves journal/consumer/FK records and sequence high-water marks; restart/replay/expiry and scoped-permission negative tests pass. First Storybook CLI attempts were command setup defects, corrected to the supported tag filter; final runner passed.

Frozen downstream contract: ManualEventService.submit({ action }, trustedContext) returns journal identity plus per-consumer outcomes, not a queue item. S03/S04 must bind concrete reference validators, preserve pending responses and avoid direct parallel enqueue or automatic retries. Migration number 042 is now allocated.

### S03 — Accepted

Alert draft/saved sends, Screen Effect sends and canonical/external source simulations now publish through the shared journal and normal consumers. Manual provenance is preserved in queue/history; selected Alert sends remain targeted. Local Preview does not publish. Bounded pending receipts distinguish journal acceptance from completed delivery. Public overlays no longer display a test-only audio activation prompt or automatically retry blocked audio.

Parent reviewed production and regression diffs and requested fixes for device-only validation, actionable reference errors, unsaved draft compatibility, and direct-enqueue fallbacks. All were resolved. The generic management route accepts source simulations only; existing targeted routes keep their own adapters. New and changed endpoint contracts are documented in docs/engineering/manual-event-management-api.md. The short-lived response-detail cache is capped; journal outcomes remain authoritative.

Verified logs: 28 affected unit files / 564 tests passed; final focused delta checks passed (14 tests, then legacy route 7 and manual dispatch 9 after added coverage). Strict workspace typecheck, changed-file lint, error-provenance, production web build, Storybook build and strict OpenSpec validation passed. Five targeted stories passed with accessibility/console hooks. Disposable browser acceptance passed (1 test, final 10.1 seconds), covering non-dispatching Preview, invalid references before journal insertion, unavailable output correction, saved-target forgery rejection and one shared occurrence across ordinary browser and private desktop recipients. Fresh Windows desktop package succeeded; production packaged overlay-host acceptance passed (1 test, 22.4 seconds) with silent native rendering.

Initial E2E failures were fixture contract errors (empty starter content, key response status, writable surface fields, namespaced occurrence identity and a non-exported helper); corrected against production contracts without weakening assertions. Final results were read from test logs, not shell cleanup exit status. Native acceptance used disposable state and silent media; it does not claim physical audio or game-input acceptance. Videos admission and public output retirement remain owned by later slices.

Final parent review also removed the saved-alert UI's optional draft-send fallback. The required saved adapter now has 47 passing UI regressions and a rebuilt browser acceptance that clicks Test saved and verifies no draft document is sent (1 passed, 10.8 seconds). Shared typed fixtures were updated with the contract.

The final saved-send Storybook interaction passed (1 story, 113.692-second runner); the updated full API fixtures passed 33 tests. Final strict typecheck/lint and production web rebuild passed. Parent accepts S03 with no remaining findings.

### S04 — Accepted

Ordinary management/Operator and scoped automation Video requests now publish through the shared bus. Provider events retain their original journal identity; manual simulations retain manual provenance and normal provider autoplay policy. Migration 043 adds validated durable admission receipts. Queue insertion/revision and the accepted receipt commit in one synchronous transaction, before metadata enrichment or notifications. Persistent reopen tests cover the crash between insertion and bus acknowledgement, stable rejected outcomes, and transaction rollback. Legacy test requests remain isolated until S09.

HTTP POST retains 201 only for committed admission; unfinished admission returns 202 with bus/event identity. Authenticated management and videos:read automation lookup returns completed acceptance with 200, without another POST. Pending UI prevents accidental resubmission, offers explicit outcome checking and rejects stale responses from a previous form context. Guarded playback commands remain unchanged; legacy Streamer.bot clear/no-clip retains its command-specific duplicate guard.

Parent reviewed the transaction, persistence validation, lifecycle, routes, permissions, provider adapters, clients and tests. Requested fixes were completed for strict receipt parsing, bounded cleanup, tracked background errors, GET status semantics, stale form locking, legacy command replay, and historical database fixtures. Receipts are protected while their journal row or active item exists; cleanup handles at most 250 eligible rows per pass. Runtime receipts stay outside configuration exports. Historical migration fixtures now construct authoritative prefixes instead of undoing the latest schema, retaining their data-preservation assertions.

Verification: narrow durable admission/upgrade selection passed 15 tests across three files. The broader affected run passed 264 tests and exposed six database fixture/schema-expectation failures; after repair, the focused database/upgrade selection passed all 32 tests across three files. Those earlier failures are not reported as a green full run. Strict workspace typecheck, changed-file lint, error-provenance and production web/Storybook builds passed. Two targeted pending-state Storybook interactions passed (112.306-second runner). Rebuilt disposable browser acceptance passed (one test, 9.4 seconds), verifying one journal/queue/receipt, lookup authorization, no duplicate POST and unchanged stale command rejection. The browser fixture substitutes a 202 response for a real committed request to exercise pending UI; a separate real blocked-consumer test proves the actual pending-to-committed service path.

No physical playback or performance improvement is claimed by this intake slice. The persistent crash and receipt regression must be rerun after S09 queue consolidation. Final whole-change gates remain S11-owned.

### S05 - Trusted presentation and authoritative canvas metadata

Parent review accepted the saved-config capture/cache, bounded race retries, stable runtime identity with numeric revision ordering, public/private recipient boundary, content rendering, and source metadata refresh. All actual modules remain scene-sized until their owning conversion slices. Same-process restore resets advance the revision without replacing runtime identity; old sockets and lower revisions cannot replace current geometry. Existing bounded bootstrap buffering remains the sole startup queue.

Validation: initial affected core/server/overlay/private-desktop selection 237 tests passed; final focused selection 224 passed; subsequent lifecycle 34, schema/surface 46, Timer refresh 17, and bundle checker 8 passed (overlapping selections, not a unique total). Strict repository typecheck, changed-file lint, error provenance, server build, public/private web build, static Storybook, three tagged Storybook checks, and strict OpenSpec validation passed. Rebuilt real-service Playwright acceptance passed in 5.1 seconds, covering empty/disabled saved geometry, WebSocket refresh, matching management metadata, reconnect, invalid-save preservation, and source dimensions. Owned test services stopped.

Earlier fixture/typecheck, launcher, premature WebSocket test, and bundle-budget failures were diagnosed and corrected; their runs remain recorded as failures in the slice report. Final overlay graph is 154,657 gzip bytes (151.0322 KiB), approximately 0.19 KiB above the rounded predecessor measurement of 150.84 KiB. The overlay size allowance is now 151.25 KiB for the required canvas validation/ordering functionality; dependency-boundary checks and other budgets are unchanged. This is measured startup bundle overhead, not a runtime performance improvement. Native OBS and full cross-module performance acceptance remain S11 responsibilities.
