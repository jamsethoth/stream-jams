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

## Independent review follow-up

- Follow-up starting HEAD: `4f536c80eaccae954fec671760bdbfb262b4f38e`.
- The first review found that the existing dirty profile-switch dialog prevented the required post-theme inspection of both target profiles before saving. The initial fix made target-profile selection immediate for all shared drafts; the follow-up correction below narrows that exception to an explicitly tracked unsaved starter-theme review.
- The review found that document-history transitions could leave `selectedLayerId` referring to a visual layer removed by theme application. Selection now reconciles after every document transition, retaining a valid selection or choosing the first current layer, and the Layers inspector explicitly covers Undo, Redo, and Revert. Undo/Redo clear stale starter-theme guidance; Revert replaces it with the existing reverted-success notice.
- The previous starter-theme story applied the choice before a reviewer could inspect the confirmation. `StarterThemeConfirmation` now remains open with Neon Terminal selected, while `StarterThemeAppliedWarning` separately shows the applied warning, disabled alert, and review state.
- Add alert now has a direct regression proving Cancel closes the dialog without calling `createAlert`, independent of the existing failure/retry coverage.
- Review-fix RED evidence: the focused Add alert/editor run produced four expected editor failures for the dirty profile guard and stale layer/notice behavior; the new Add alert cancel test passed. The first GREEN run exposed one older assertion that depended on a deleted stale layer ID. It was reconciled with the reviewed invariant by verifying Undo restores the deleted layer while the inspector selects a valid current layer.
- Review-fix GREEN evidence: focused Add alert/editor Vitest passed 86/86; the final management API/Add alert/editor Vitest run passed 112/112; web typecheck, production build, focused ESLint, and Storybook static build passed; Storybook browser CI passed 15 suites and 163 tests with zero snapshots; strict OpenSpec validation and diff checks passed.

## Contract-scope re-review follow-up

- Follow-up starting HEAD: `886351acce835285eeaf3eee64ee42ec71eb8a21`.
- Re-review found that globally bypassing the dirty target-profile guard conflicted with the focused-editor Save/Discard/Cancel rule in the UX specification. The editor now restores that guard for ordinary dirty drafts and bypasses it only while an explicit unsaved starter-theme review is active.
- The review marker is independent of notice text. It remains active through subsequent themed-draft edits, deactivates when Undo crosses the theme application, reactivates when Redo restores the exact themed snapshot, and clears when a new edit branches away from an undone theme or when the draft is saved, reverted, discarded, changed, or reloaded.
- Profile-switch regressions cover the themed apply/edit/inspect-both-profiles workflow without persistence, the ordinary Save/Discard/Cancel workflow, guard restoration after save/revert/navigation discard, and Undo/Redo transitions. Existing Layers inspector assertions continue to prove selection remains valid and theme guidance follows the active history state.
- Storybook now has a stable `StarterThemeProfileInspection` story for the narrow bypass and an `OrdinaryDirtyProfileSwitchGuard` story with the restored dialog open, in addition to the separate theme confirmation and applied-warning stories.
- Contract-scope RED evidence: four focused regressions failed against the global-switch implementation because the ordinary, Undo, Revert, and Discard paths did not restore the profile guard. The theme review test initially exposed one ambiguous selector, which was corrected without changing behavior.
- Contract-scope GREEN evidence: the focused transition run passed 6/6; the complete Alert editor Vitest file passed 64/64; web typecheck, production build, focused ESLint, Storybook static build, and strict OpenSpec validation passed; Storybook browser CI passed 15 suites and 164 tests with zero snapshots; `git diff --check` passed. Build output contained only the existing Vite chunk-size advisory, and browser CI contained only the routine Story Store deprecation warning.

## History-provenance re-review follow-up

- Follow-up starting HEAD: `91919d49d942c45929b7842ea24ffd5886dc0209`.
- Final re-review found that one marker could describe only the most recently applied theme. Applying a second distinct theme, or reapplying the same theme, then using Undo landed on an earlier unsaved themed snapshot without restoring the review warning or direct target-profile inspection.
- Starter-theme review provenance now follows editor history through parallel bounded `past`, `current`, and `future` state. Every ordinary document or priority-group edit preserves the current snapshot's provenance, every theme application creates a themed-review snapshot, Undo and Redo restore the landed snapshot's provenance and warning, and new edits clear the abandoned future branch.
- Save, Revert, navigation Discard, document changes, and reloads clear all review provenance. Missing provenance after those resets defaults to ordinary dirty behavior, so the Save/Discard/Cancel profile-switch guard remains intact outside an unsaved themed draft.
- Focused regressions cover distinct consecutive theme applications across Undo and Redo, direct inspection of both target profiles, same-theme reapplication, themed-draft branching, and branching from an ordinary pre-theme snapshot with the normal dirty guard restored.
- History-provenance RED evidence: both new focused regressions failed against the single-marker implementation. Undo after two distinct theme applications did not restore `Starter theme applied.`, and editing a snapshot reached through same-theme reapplication incorrectly opened the dirty profile-switch dialog. An interim GREEN run exposed a test defect because `userEvent.type` intentionally created one history entry per character; the regression was corrected to use one semantic change event without weakening the behavior under test.
- History-provenance GREEN evidence: the two new focused regressions passed 2/2 and the complete Alert editor Vitest file passed 66/66. Web typecheck, production build, focused ESLint, Storybook static build, strict OpenSpec validation, and diff checks passed; Storybook browser CI passed 15 suites and 164 tests with zero snapshots. Build output contained only the existing Vite chunk-size advisory, and browser CI contained only the routine Story Store deprecation warning.
