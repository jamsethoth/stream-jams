# Inline Alert Profile Review Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make profile review discoverable by placing `Mark reviewed` in the selected profile's warning bar while preserving explicit Save.

**Architecture:** Reuse `AlertEditorPage`'s existing `updateProfile` draft mutation and the existing profile-warning presentation. No domain contract, API, persistence, or overlay behavior changes; the action updates the selected profile in editor history, and the existing save path persists it.

**Tech Stack:** React, TypeScript, Testing Library/user-event, Storybook interactions, Playwright, CSS, OpenSpec.

## Global Constraints

- Review is scoped to the currently selected `TargetProfileId`.
- Clicking `Mark reviewed` changes draft state only; the user must invoke the existing `Save` action.
- Keep the existing Alert-tab review action as a secondary path.
- Use the existing button, warning, dirty-state, undo/redo, and save patterns; add no dependency or abstraction.
- The action must have an accessible name and native keyboard behavior.
- Applicable MVP UX sections: Alert Editor, Target Profiles, and Dirty-state rules. This is an MVP usability correction, not a new backlog feature.
- Loading, empty, and error states are unchanged. The changed states are selected-profile Needs review, unsaved reviewed draft, and saved reviewed profile.

---

### Task 1: Specify the inline mark-then-Save interaction

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`

**Interfaces:**
- Consumes: `AlertEditorDocument.targetProfiles`, `updateProfile(document, profileId, { reviewState: "ready" })`, existing `Save` button.
- Produces: deterministic component and Storybook interaction coverage for the warning-bar action.

- [x] **Step 1: Add a failing component test**

Extend the two-profile review test so it begins on Landscape without opening the Alert tab. Within `.alert-editor-page__profile-warning`, assert a native button named `Mark reviewed`, click it, then assert:

```ts
expect(screen.getByText("Unsaved")).toBeInTheDocument();
expect(screen.queryByText("This generated layout is editable but cannot be sent live until you mark it reviewed and enable it.")).not.toBeInTheDocument();
expect(saveAlertEditorDocument).not.toHaveBeenCalled();
```

Click `Save` and retain the existing assertion that only Landscape is `ready` while Vertical remains `needs-review`. Switch to Vertical and repeat through its inline warning action, proving the selected-profile scope and explicit-save behavior.

- [x] **Step 2: Run the component test and verify RED**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx -t "reviews and saves two already-enabled profiles incrementally"
```

Expected: FAIL because `.alert-editor-page__profile-warning` has no `Mark reviewed` button.

- [x] **Step 3: Extend the existing `VerticalNeedsReview` story interaction**

In `AlertEditorPage.stories.tsx`, locate the warning by its explanatory copy, scope with `within`, and require the action:

```ts
const warning = (await canvas.findByText(/This generated layout is editable/u)).closest(".alert-editor-page__profile-warning");
await expect(warning).not.toBeNull();
const warningCanvas = within(warning as HTMLElement);
await userEvent.click(warningCanvas.getByRole("button", { name: "Mark reviewed" }));
await expect(canvas.getByText("Unsaved")).toBeVisible();
await expect(canvas.queryByText(/This generated layout is editable/u)).not.toBeInTheDocument();
```

Do not click Save in this story; it demonstrates the required intermediate draft state.

- [x] **Step 4: Run the story test and verify RED**

Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci -- --testNamePattern "VerticalNeedsReview"
```

Expected: FAIL because the warning contains no action.

### Task 2: Add the warning-bar action

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx:670`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css:332`
- Test: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Test: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`

**Interfaces:**
- Consumes: `setEditor(applyEditorUpdate(editor, updater))` through the component's existing document change callback and `updateProfile`.
- Produces: a visible native button that changes only `profileId` to `reviewState: "ready"` in the draft.

- [x] **Step 1: Implement the minimal action**

Inside `.alert-editor-page__profile-warning`, group the existing copy and add:

```tsx
<button
  className="button button--secondary button--compact"
  onClick={() => updateDocument((current) => updateProfile(current, profileId, { reviewState: "ready" }))}
  type="button"
>
  Mark reviewed
</button>
```

Call the existing `updateDocument` callback directly; do not add local review state or call the save API. Keep the entire warning conditional on `profile.reviewState === "needs-review"` so it disappears after activation.

- [x] **Step 2: Keep the warning responsive**

Update `.alert-editor-page__profile-warning` so its explanatory content can grow and the button remains usable at the existing 820 px editor viewport:

```css
.alert-editor-page__profile-warning {
  flex-wrap: wrap;
}

.alert-editor-page__profile-warning .button {
  margin-left: auto;
}
```

Preserve existing warning colors and typography. Do not introduce fixed widths.

- [x] **Step 3: Run focused component and Storybook tests and verify GREEN**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx -t "reviews and saves two already-enabled profiles incrementally"
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci -- --testNamePattern "VerticalNeedsReview"
```

Expected: both pass; the component assertion proves save is not called until `Save` and the story proves the intermediate Unsaved state.

### Task 3: Prove the live browser workflow and finish the change

**Files:**
- Modify: `tests/e2e/management-alerts.spec.ts:524`
- Modify: `openspec/changes/add-alert-visual-style-controls/tasks.md`

**Interfaces:**
- Consumes: the mocked PUT `/management/alerts/alert-follow/editor` and `savedDocuments` capture already used by the focused editor test.
- Produces: real-browser evidence for discoverability, selected-profile scope, and explicit Save.

- [x] **Step 1: Change the Playwright workflow to use the warning action**

Before opening any inspector tab, locate the visible profile warning and click its button:

```ts
const landscapeReviewWarning = page.locator(".alert-editor-page__profile-warning");
await expect(landscapeReviewWarning).toContainText("Needs review");
await landscapeReviewWarning.getByRole("button", { name: "Mark reviewed" }).click();
await expect(page.getByText("Unsaved")).toBeVisible();
expect(savedDocuments).toHaveLength(0);
await page.getByRole("button", { name: "Save" }).click();
```

Retain the existing saved-document assertion. When Vertical is selected later, use its warning-bar action too and retain the final ready/ready assertion. Keep the existing Alert-tab review control in production but stop depending on it for this primary browser workflow.

- [x] **Step 2: Run the focused Playwright test**

Run:

```powershell
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts --grep "focused alert editor saves layouts"
```

Expected: 1 passed.

- [x] **Step 3: Complete OpenSpec tasks and run required gates**

Mark tasks 8.1 and 8.2 complete after focused green tests. Run:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate add-alert-visual-style-controls --strict
```

Expected: all commands exit 0. Mark task 8.3 complete only after these gates, restart, and live verification.

- [x] **Step 4: Rebuild, restart, and verify without altering user data**

Stop only the verified process listening on `127.0.0.1:39187`, start `corepack.cmd pnpm start:local` from this worktree in a hidden process, wait for `/health` to return `{ "status": "ok" }`, and verify `/manage` returns HTTP 200. Use Playwright fixtures for the state-changing review workflow; do not mark the user's real alerts reviewed.

- [x] **Step 5: Commit, push, and update PR #83**

Stage the component, CSS, tests, story, Playwright spec, OpenSpec tasks, and this plan. Commit with:

```text
Surface alert profile review action
```

Push `codex/add-alert-visual-style-controls` and update PR #83's UX note with the applicable Alert Editor, Target Profiles, and Dirty-state sections; changed needs-review/unsaved/saved states; native button keyboard behavior; and Storybook/Playwright coverage.
