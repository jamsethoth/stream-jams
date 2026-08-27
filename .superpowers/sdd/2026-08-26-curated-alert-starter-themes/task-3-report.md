# Task 3 report — server creation integration and Clean Signal defaults

## Scope

Implemented only Task 3 server integration. No web production files, persistence schemas, dependencies, backup formats, routes beyond the existing create route, OpenSpec archive state, publishing, PRs, or merges were changed.

`apps/server/src/modules/providers/management-ui-service.ts` was inspected and already used the required parsed `AlertCreateInput` signature for `createAlert`, so it required no diff.

## RED evidence

After rebuilding `@stream-jams/core`, the focused server command was run before production edits:

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/server/src/http/routes/management-ui.test.ts --reporter=verbose
```

Result: 7 expected failures and 84 passes. The failures showed that helper, lazy, create, and reset paths still produced compatibility documents rather than Clean Signal/Bold Pop documents, and that the invalid-theme HTTP 400 copy did not mention starter-theme selection.

The first implementation run exposed a compatibility-state regression because `applyAlertStarterTheme` deliberately disables and resets review state. The server helper was corrected to preserve the validated compatibility document's existing enabled/profile state after applying theme composition. This keeps legacy lazy/save projection behavior intact while new alert creation and default reset retain their existing disabled/needs-review semantics.

## GREEN evidence

- Core build: `corepack.cmd pnpm --filter @stream-jams/core build` — passed.
- Focused server tests: 3 files, 91 tests passed.
- Server typecheck: `corepack.cmd pnpm --filter @stream-jams/server typecheck` — passed.
- Server build: `corepack.cmd pnpm --filter @stream-jams/server build` — passed.
- Focused ESLint over all brief-listed server files — passed.
- OpenSpec strict validation — passed.
- `git diff --check` — passed.

## Changed files

- `apps/server/src/modules/alerts/alert-editor-service.ts`
  - Adds the optional starter-theme ID to the compatibility helper.
  - Defaults missing selections to Clean Signal.
  - Validates the compatibility document before applying the reviewed core theme operation.
  - Preserves existing enabled/profile availability and review semantics for lazy/current projections.
- `apps/server/src/modules/alerts/alert-editor-service.test.ts`
  - Covers helper default/explicit selection, schema validity, lazy Clean Signal creation, and stored-document hydration without re-theming.
  - Updates playback assertions for the intentional multi-layer Clean Signal composition.
- `apps/server/src/modules/alerts/alert-set-management-service.ts`
  - Consumes parsed `AlertCreateInput` without re-parsing.
  - Passes `themeId` into document creation inside the existing aggregate mutation.
- `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
  - Uses parsed internal create inputs.
  - Covers omitted-theme Clean Signal, explicit Bold Pop, starter lazy documents, default reset, schema validity, and aggregate atomicity.
- `apps/server/src/http/routes/management-ui.ts`
  - Retains boundary parsing and adds supported starter-theme guidance to invalid-create copy.
- `apps/server/src/http/routes/management-ui.test.ts`
  - Covers omitted/defaulted and explicit theme propagation plus invalid-theme HTTP 400 with zero service activity.
- `openspec/changes/add-curated-alert-starter-themes/tasks.md`
  - Marks only tasks 2.1–2.3 complete.
- `docs/superpowers/plans/2026-08-26-curated-alert-starter-themes.md`
  - Marks only Task 3 steps complete.

## Atomicity and default-path evidence

- Explicit Bold Pop creation is committed through one `AlertAggregateMutationStore.commit` call containing the new rule, management metadata, and schema-valid themed editor document.
- Unknown theme IDs fail in the HTTP route before the create service is called, so no aggregate mutation can begin.
- Omitted wire input is defaulted by `alertCreateInputSchema` to `clean-signal` before crossing the service boundary.
- Helper callers, editor lazy creation, current/sibling save projections, starter-set lazy documents, and default-alert reset all use the Clean Signal default.
- Stored documents hydrate from their saved composition without automatic re-theming.
- Variation and set copies continue to copy stored documents rather than materializing a fresh theme.

## Self-review

- Theme geometry, layer construction, and validation remain owned by core; the server contains no duplicate theme blueprint.
- The HTTP handler remains thin and passes only parsed `AlertCreateInput` downstream.
- Existing aggregate mutation ownership and reset/copy semantics are preserved.
- Tests identify themes through catalog-derived stable layer IDs and approved fills and validate resulting documents with `alertEditorDocumentSchema`.
- No production path re-parses the already parsed internal create input.

## Review follow-up — save projection primary text

The independent Task 3 review found one Important issue: `projectDocumentToRule` selected the first text layer. Starter themes place Eyebrow before Message, so saving an unchanged themed document projected the eyebrow label and geometry back into the compatible alert variant.

The regression was added before the fix and failed with `textTemplate: "Follow"` plus the `alert-follow:clean-signal:eyebrow` layout instead of `"Thanks, {actor.displayName}!"` plus Message geometry. The existing masked save test was also revised so it edits only the semantic Message layer rather than assigning the same template to every text layer.

The fix deterministically sorts text layers by order and then layer ID, selects a case-insensitive layer named `Message`, otherwise the first visible text layer, otherwise the first text layer, and uses that same selected layer for both projected `variant.textTemplate` and the fallback primary layout ID when no image/video is primary.

Fresh follow-up evidence:

- Focused alert-editor test: 55/55 passed.
- Complete Task 3 focused set: 3 files, 92/92 passed.
- Broader server suite: 86 files, 602/602 passed.
- Server typecheck and build passed.
- Focused ESLint for the two changed server files passed.
- OpenSpec strict validation and `git diff --check` passed.

## Concerns

None. The broader server suite was run; the full cross-package repository Vitest run remains outside this server-only follow-up.
