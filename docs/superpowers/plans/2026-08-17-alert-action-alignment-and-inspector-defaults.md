# Alert Action Alignment And Inspector Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Alert Sets inventory actions across enabled and disabled rows, normalize the More control, and collapse focused-editor inspector disclosures by default.

**Architecture:** Keep the existing React structure and native `details` behavior. Add narrow CSS hooks for the toggle and More controls, remove forced `open` attributes from inspector disclosures, and update existing component, Storybook, and Playwright coverage to assert the new initial state and unchanged interaction behavior.

**Tech Stack:** React 19, TypeScript, CSS, Vitest/Testing Library, Storybook test-runner, Playwright.

## Global Constraints

- Keep the existing `6px` flex gap and action order.
- Preserve labels, accessible names, menu behavior, responsive wrapping, and save behavior.
- Collapse `Live TTS`, `Typography`, `Text box`, `Position and size`, and `Animation preset` only as an initial default; do not persist disclosure state or force it closed after user interaction.
- Add no dependencies and make no API, persistence, or alert-data changes.

---

### Task 1: Align Alert Inventory Actions

**Files:**
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx:813-828`
- Modify: `apps/web/src/management/alerts/alert-sets-page.css:422-454`
- Test: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Test: `tests/e2e/management-alerts.spec.ts:187-203`

**Interfaces:**
- Consumes: existing `alert-sets-page__row-actions`, `button`, `button--secondary`, and `button--compact` CSS contracts.
- Produces: `alert-sets-page__toggle-action` for stable Enable/Disable width and compact-button classes on the More summary.

- [ ] **Step 1: Write failing component assertions for action styling hooks**

Add an assertion to the existing inventory-action test:

```tsx
const toggle = screen.getByRole("button", { name: "Enable New follower" });
expect(toggle).toHaveClass("alert-sets-page__toggle-action");
const more = screen.getByText("More", { selector: "summary[aria-label='More actions for New follower']" });
expect(more).toHaveClass("button", "button--secondary", "button--compact");
```

- [ ] **Step 2: Run the focused component test and verify it fails**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/AlertSetsPage.test.tsx
```

Expected: FAIL because the toggle and More controls do not yet have the new classes.

- [ ] **Step 3: Add the minimal action hooks and CSS**

Update the controls:

```tsx
<button className="button button--compact alert-sets-page__toggle-action" ...>
  {alert.enabled ? "Disable" : "Enable"}
</button>
<summary
  aria-label={`More actions for ${alert.name}`}
  className="button button--secondary button--compact"
>
  More
</summary>
```

Normalize the summary and toggle sizing:

```css
.alert-sets-page__toggle-action {
  min-width: 77px;
}

.alert-sets-page__action-menu summary {
  align-items: center;
  display: inline-flex;
  justify-content: center;
  list-style: none;
}
```

Remove the summary declarations that conflict with the shared compact-button contract: custom background, border, border radius, color, font size, font weight, and padding. Keep cursor, marker suppression, and menu positioning.

- [ ] **Step 4: Run the focused component test and verify it passes**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/AlertSetsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Add browser geometry regression coverage**

Before enabling New follower in the existing Playwright workflow, capture the toggle width, click it, and compare the Disable width:

```ts
const enableToggle = alertRow.getByRole("button", { name: "Enable New follower" });
const enableBox = await enableToggle.boundingBox();
expect(enableBox).not.toBeNull();
await enableToggle.click();
const disableToggle = alertRow.getByRole("button", { name: "Disable New follower" });
await expect(disableToggle).toBeVisible();
const disableBox = await disableToggle.boundingBox();
expect(disableBox).not.toBeNull();
expect(disableBox!.width).toBe(enableBox!.width);
```

Move the existing success-toast assertion after this sequence and remove its duplicate enable click.

- [ ] **Step 6: Run the focused Playwright workflow**

Run:

```powershell
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts --grep "management alerts reviews the starter set"
```

Expected: PASS with equal toggle widths.

- [ ] **Step 7: Commit the action-row change**

```powershell
git add apps/web/src/management/alerts/AlertSetsPage.tsx apps/web/src/management/alerts/alert-sets-page.css apps/web/src/management/alerts/AlertSetsPage.test.tsx tests/e2e/management-alerts.spec.ts
git commit -m "fix(alerts): align inventory actions"
```

### Task 2: Collapse Inspector Disclosures By Default

**Files:**
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx:1148-1370`
- Test: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx:841-875`
- Test: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx:53-95`
- Test: `tests/e2e/management-alerts.spec.ts:768-795`

**Interfaces:**
- Consumes: native uncontrolled HTML `details`/`summary` behavior.
- Produces: collapsed initial inspector disclosures with unchanged keyboard expansion and form controls.

- [ ] **Step 1: Change component and Storybook tests to expect collapsed defaults**

For each disclosure, assert no `open` attribute and hidden control before clicking, then click to expand:

```tsx
for (const [label, controlLabel] of disclosures) {
  const summary = screen.getByText(label, { selector: "summary" });
  expect(summary.closest("details")).not.toHaveAttribute("open");
  const control = screen.getByLabelText(controlLabel);
  expect(control).not.toBeVisible();
  await user.click(summary);
  expect(summary.closest("details")).toHaveAttribute("open");
  expect(control).toBeVisible();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
}
```

Update `CompatibilityTextStyle` and other stories that immediately query disclosure contents to click their summary before querying those controls.

- [ ] **Step 2: Run the focused editor tests and verify they fail**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
```

Expected: FAIL because the production disclosures still render with `open`.

- [ ] **Step 3: Remove forced-open attributes from every inspector option disclosure**

Change all five option disclosures from:

```tsx
<details className="alert-editor-inspector__disclosure" open>
```

to:

```tsx
<details className="alert-editor-inspector__disclosure">
```

Apply this to Live TTS, Position and size, Animation preset, Typography, and Text box.

- [ ] **Step 4: Run focused component and Storybook interaction tests**

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
$env:TEST_MATCH = '**/apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx'; corepack.cmd pnpm exec start-server-and-test "storybook dev --host 127.0.0.1 --port 6007 --ci" http://127.0.0.1:6007 "test-storybook --url http://127.0.0.1:6007 --ci --failOnConsole --maxWorkers=1 --testTimeout=30000"
```

Expected: both focused suites PASS.

- [ ] **Step 5: Update Playwright disclosure assertions**

Change the editor workflow so each disclosure starts hidden and expands with keyboard Enter:

```ts
for (const [label, controlLabel] of disclosures) {
  const summary = page.locator("summary").filter({ hasText: label });
  const control = page.getByLabel(controlLabel, { exact: true });
  await expect(control).toBeHidden();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(control).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
}
```

- [ ] **Step 6: Run the focused editor Playwright workflow**

Run:

```powershell
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts --grep "focused alert editor saves layouts"
```

Expected: PASS with all option panels initially collapsed and keyboard expandable.

- [ ] **Step 7: Commit the inspector-default change**

```powershell
git add apps/web/src/management/alerts/editor/AlertEditorPage.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx tests/e2e/management-alerts.spec.ts
git commit -m "fix(alerts): collapse inspector options initially"
```

### Task 3: Validate And Restart The Production App

**Files:**
- Verify only; no source files should change.

**Interfaces:**
- Consumes: workspace build scripts and existing local configuration at `C:\Users\James\.stream-jams`.
- Produces: rebuilt production assets and a healthy local server on `127.0.0.1:39187`.

- [ ] **Step 1: Run repository frontend gates**

Run:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 2: Verify the final diff**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors and only intended files/commits.

- [ ] **Step 3: Replace only the verified Stream Jams runtime**

Identify the listener on port 39187 and confirm its command line references `apps/server/dist/index.js`. Stop only that process, then start the rebuilt server hidden with redirected logs:

```powershell
$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 39187 -State Listen
$runtime = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
$runtime.CommandLine
Stop-Process -Id $runtime.ProcessId
Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'apps/server/dist/index.js' -WorkingDirectory 'C:\dev\projects\stream-jams' -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
```

Expected: the old process is confirmed as Stream Jams before stopping, and the new process owns port 39187.

- [ ] **Step 4: Verify the rebuilt live workflow**

Check `http://127.0.0.1:39187/health` and `http://127.0.0.1:39187/manage`, then inspect the Alert Sets inventory and focused editor in the browser.

Expected: HTTP 200; Enable and Disable occupy equal width, More matches adjacent compact controls, and inspector disclosures start collapsed but expand normally.
