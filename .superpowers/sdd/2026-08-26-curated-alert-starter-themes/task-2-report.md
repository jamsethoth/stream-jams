# Task 2 report — core starter-theme catalog and pure materialization

## Scope and changed files

- `packages/core/src/management/contracts.ts`: added the exact theme-ID schema/default, optional wire-input versus parsed create-input types, and catalog summary contracts.
- `packages/core/src/management/contracts.test.ts`: added catalog, immutability, defaulting, explicit selection, unknown-ID rejection/non-mutation, and input/output type assertions.
- `packages/core/src/management/alert-starter-themes.ts`: added the immutable three-theme catalog, deterministic schema-validated pure materializer, and pure existing-document application operation.
- `packages/core/src/management/alert-starter-themes.test.ts`: added the complete canonical-event/theme/profile matrix, exact blueprint, bounds, determinism, validation, message precedence/fallback, preservation, replacement, review reset, availability, and idempotency coverage.
- `packages/core/src/index.ts`: exported the requested public starter-theme contracts and operations.
- `openspec/changes/add-curated-alert-starter-themes/design.md`: recorded exact implementation choices that resolved approved layout ranges.
- `openspec/changes/add-curated-alert-starter-themes/tasks.md`: marked only core tasks 1.1–1.5 complete after evidence.
- `docs/superpowers/plans/2026-08-26-curated-alert-starter-themes.md`: marked only Task 2 steps complete.

No server or web files, dependencies, assets, migrations, backlog entries, archives, publishing state, PRs, or merges were changed.

## RED evidence

### Contract boundary

Command:

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/management/contracts.test.ts --reporter=verbose
```

Expected result: exit 1, with the new contract test failing because `alertStarterThemeIdSchema` was not exported; the pre-existing 22 tests passed.

### Materialization and re-theming

Command:

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/management/alert-starter-themes.test.ts --reporter=verbose
```

Expected result: exit 1, with 11 behavior tests failing because `materializeAlertStarterTheme` and `applyAlertStarterTheme` did not exist; the two rejection assertions passed because calling absent functions threw.

## GREEN evidence

Fresh final commands and results after all source and tracking updates:

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/management/contracts.test.ts packages/core/src/management/alert-starter-themes.test.ts --reporter=verbose
corepack.cmd pnpm --filter @stream-jams/core typecheck
corepack.cmd pnpm --filter @stream-jams/core build
corepack.cmd pnpm exec eslint packages/core/src/management/contracts.ts packages/core/src/management/contracts.test.ts packages/core/src/management/alert-starter-themes.ts packages/core/src/management/alert-starter-themes.test.ts packages/core/src/index.ts
openspec.cmd validate add-curated-alert-starter-themes --strict
git -c safe.directory=C:/Users/James/.codex/worktrees/966c/stream-jams diff --check
```

- Focused Vitest: 2 files passed, 36 tests passed, 0 failures.
- Core typecheck: exit 0.
- Core build: exit 0.
- Focused ESLint: exit 0 with no findings.
- Strict OpenSpec validation: `add-curated-alert-starter-themes` is valid.
- Diff whitespace check: exit 0 with no findings.

## Exact design choices

- Panel percentage rectangles use `Math.round` against 1920×1080 and 1080×1920.
- Insets are 2.5% of each scaled panel dimension on every side; eyebrow height is exactly 22.5% of inset content height; the message receives the exact remainder.
- Clean Signal uses a 0.75%-of-profile-width full-height accent and a 22px/700 cyan eyebrow.
- Bold Pop uses a 24px/800 yellow eyebrow and the normalized magenta/cyan/yellow rectangles recorded in the OpenSpec design; all blocks are unrotated and ordered behind the dark panel.
- Neon Terminal uses a top rule 2.5% of panel height, a 20px/700 green eyebrow, and zero-offset green shadows with 8px eyebrow blur and 12px message blur.
- Generated text is left-aligned, vertically centered, line-height 1.05, with transparent zero-padding boxes.
- Every generated layer uses its theme entrance, fade exit, 300ms duration, zero delay, and ease-out easing.
- IDs use `<document-id>:<theme-id>:<semantic-role>`; primary-message order ties use ordinal layer-ID comparison.

## Self-review

- Confirmed exactly three frozen catalog summaries and no persistent theme ID on editor documents.
- Confirmed every canonical event × every theme × both profiles validates, remains in bounds, uses unique deterministic IDs/references, and contains only text/solid-fill shapes.
- Confirmed canonical event labels exclusively own eyebrow content while message templates may be supplied for previews/re-theming.
- Confirmed application first validates the input document, preserves all behavior/nonvisual fields and audio/TTS layer data, replaces every visual layer/layout, invents no nonvisual layout, disables the document, resets both reviews, and preserves profile availability.
- Confirmed the exact precedence chain and deterministic tie handling, repeated materialization equality, same-theme application idempotency, unknown theme/event rejection, and caller-input non-mutation.
- Corrected one implementation regression found during GREEN: Bold Pop blocks initially rendered in front of the panel; layer ordering now places them behind it.
- Corrected typecheck-only compatibility defects (`toSorted` target availability and overly narrow test type assertions) without changing behavior or weakening tests.

## Review follow-up

The post-commit review found one stale expectation in `packages/core/src/management/alert-set-contracts.test.ts`: its existing canonical-event/name-trimming assertion still expected parsed alert-create input without the new defaulted `themeId`. The broader management test run reproduced exactly one failure with received `themeId: "clean-signal"` (1 failed, 52 passed). The intended parsed-output expectation now includes `themeId: "clean-signal"` while retaining the canonical `cheer` event and trimmed `New cheer` name assertions. Re-running all four core management test files passed 53/53 tests. No production behavior changed.

## Concerns

None within Task 2 scope. Server and web callers that consume the new required parsed `AlertCreateInput.themeId` remain intentionally assigned to later tasks and were not changed here.
