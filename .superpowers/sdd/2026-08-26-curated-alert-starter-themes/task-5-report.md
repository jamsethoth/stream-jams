# Task 5 report: Add alert and editor starter themes

## Result

- Starting HEAD: `2b7363114b47167b02e95cbc8df1511c9ebd9340`
- Implemented the Task 5 Add alert and focused-editor starter-theme workflows.
- Closed the held Task 4 web-gate checkboxes only after the affected web typecheck and Storybook build passed.
- Marked OpenSpec tasks 4.1 through 4.5 and implementation-plan Task 5 steps 1 through 7 complete after their evidence existed.

## TDD evidence

RED:

- Built `@stream-jams/core` successfully so the web package consumed the current contracts.
- Ran the focused management API, Add alert, and editor tests before implementation.
- The run produced the expected five failures because the Add alert chooser and editor re-theme entry points did not yet exist; the other 105 tests passed.

GREEN:

- Focused Vitest: 110/110 tests passed.
- Web typecheck: passed. This resolves the two Task 4 errors held for the planned request boundary by changing `ManagementApi.createAlert` to accept `AlertCreateRequestInput` while leaving parsed server input required after schema defaulting.
- Web production build: passed. Vite emitted only the existing chunk-size advisory.
- Storybook static build: passed. Vite emitted only the existing chunk-size advisory.
- Focused ESLint for the ten changed production/test/story files: passed with no output.
- Storybook test CI: 15 suites and 162 tests passed with zero snapshots. Output included only routine Story Store deprecation warnings.
- Strict OpenSpec validation: `Change 'add-curated-alert-starter-themes' is valid`.
- `git diff --check`: passed with no output.

## Delivered behavior

- Add alert opens with Clean Signal selected, updates previews when its event type changes, lets the user choose any canonical starter theme, and always submits the selected `themeId`.
- Explicit selection and all other entered fields survive a server error; a newly opened global or event-scoped flow resets to Clean Signal.
- The focused editor now exposes `Apply starter theme` in Alert settings and requires an explicit `Apply theme` confirmation.
- The confirmation explains that visual text, shape, image, and video layers are replaced; primary message, audio/TTS, identity, matching, variation, cooldown, priority, duration, samples, variables, and configured profile availability are preserved; and the alert is disabled with both profiles requiring review.
- Confirmed application uses the existing draft updater exactly once, so dirty state, Undo/Revert, save, and live-impact behavior remain intact. Cancel is non-mutating.
- The post-apply warning directs the operator to review both Landscape and Vertical before saving or re-enabling.
- Invalid transient drafts remain unchanged, keep the dialog open, and receive actionable correction guidance.

## Files changed

- `apps/web/src/management/management-api.ts`
- `apps/web/src/management/management-api.test.ts`
- `apps/web/src/management/alerts/AlertSetsPage.tsx`
- `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- `apps/web/src/management/alerts/AlertSetsPage.stories.tsx`
- `apps/web/src/management/alerts/alert-sets-page.css`
- `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- `apps/web/src/management/alerts/editor/alert-editor-page.css`
- `openspec/changes/add-curated-alert-starter-themes/tasks.md`
- `docs/superpowers/plans/2026-08-26-curated-alert-starter-themes.md`
- `.superpowers/sdd/2026-08-26-curated-alert-starter-themes/task-5-report.md`

## Self-review and boundaries

- No new route, persistence model, dependency, asset, marketplace/import behavior, BL-039 change, archive, publish, PR, or merge was introduced.
- Theme application remains ordinary alert-document materialization through the existing typed core operation and editor history boundary.
- Task 6 retains Playwright end-to-end coverage, rebuilt-service live verification, final repository gates, and completion of OpenSpec section 5.
- No blocking concerns. The only gate output of note was the standard Vite chunk-size advisory and routine Storybook deprecation warnings.
