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
