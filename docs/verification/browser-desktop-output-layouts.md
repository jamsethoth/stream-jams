# Browser and desktop output implementation evidence

Approved change: `separate-browser-desktop-output-layouts`.
Plan: [ordered slices](../superpowers/plans/2026-10-10-browser-desktop-output-layouts.md).

## Baseline and execution

- Remote `origin/main` fetched at `4dc22d3c`; new branch `codex/browser-desktop-output-implementation` created directly from it.
- Approved design and plan carried forward in commits `0cd0637e`, `5d3294c6`, `3f906441`, `fd0a3aa8` and pushed before product edits.
- Existing isolated Windows worktree reused. System Node reports `v24.15.0`; pnpm reports `11.2.2`. Package manifests remain the runtime authority; no version changes are part of this work.
- Baseline focused overlay checks: `corepack pnpm exec vitest run packages/core/src/overlay-modules apps/server/src/modules/overlay-surfaces` — 12 files, 132 tests passed.
- Baseline `corepack pnpm typecheck` — passed.
- Baseline performance measurement is in progress using disposable fixtures; no improvement is claimed.

## Delivery decisions

- Use one feature branch and push accepted slices in order, as requested. The parent reviews actual diffs and verification before committing; implementers do not publish independently.
- One independent final review follows repository model instructions. In-scope findings must be fixed and re-reviewed before completion; no review-loop cap overrides the user's instruction.
- No real streaming profile or production data is used for automated acceptance. Physical OBS/GPU evidence is reported separately.

## Slice evidence

### S01 — Accepted

Explicit `renderer.supportsDesktopComposition` now governs private desktop membership. Public unified membership remains unchanged. Registry validation, repository reconciliation, settings save and runtime wiring use the appropriate capability; the private sink regression proves module-only desktop delivery.

Parent reviewed all production changes, tests and report; no open findings. Focused regression: 17 files / 180 tests passed (overlay module/surface, public routes and desktop runtime). Core/server typecheck and build passed; ESLint across 18 changed TypeScript files and whitespace checks passed. Red-phase repository tests failed on old membership as expected. No data migration or public UI change in this prerequisite.
