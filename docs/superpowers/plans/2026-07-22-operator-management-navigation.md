# Operator And Management Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the management/operator surface-switch link in the same rightmost header position with native same-tab link behavior.

**Architecture:** Extend the existing `PageHeader` with one optional action slot, move the management link from the sidebar into that slot, and reuse one CSS class on the operator return link. Keep routing native so modified clicks retain browser behavior and the existing `beforeunload` dirty-state protection remains active.

**Tech Stack:** React, TypeScript, CSS, Vitest, Testing Library, Storybook, Playwright, OpenSpec.

## Global Constraints

- Reuse existing `PageHeader`, `StatusBadge`, button classes, routes, and dirty-navigation behavior.
- Use real `<a href>` navigation without `target="_blank"` or click interception.
- Keep the focused alert editor and playback behavior unchanged.
- Add no dependency or new shared navigation abstraction.

---

### Task 1: Align The Contract And Add Failing Tests

**Files:**
- Modify: `openspec/changes/add-alert-playback-operator-controls/proposal.md`
- Modify: `openspec/changes/add-alert-playback-operator-controls/design.md`
- Modify: `openspec/changes/add-alert-playback-operator-controls/specs/alert-playback-operator-controls/spec.md`
- Modify: `openspec/changes/add-alert-playback-operator-controls/tasks.md`
- Modify: `apps/web/src/management/ManagementApp.test.tsx`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.test.tsx`
- Modify: `apps/web/src/operator/OperatorApp.test.tsx`

**Interfaces:**
- Consumes: existing `/manage` and `/operator` routes.
- Produces: tested navigation contract requiring header placement, shared styling, and no forced target.

- [x] **Step 1: Record the approved follow-up in OpenSpec**

Add a scenario requirement stating that ordinary activation navigates in the current tab and native modified-click behavior remains available. Add unchecked follow-up tasks for failing tests, implementation, and verification.

- [x] **Step 2: Add the failing management-shell test**

In `ManagementApp.test.tsx`, add:

```tsx
it("places same-tab operator navigation in the page header", () => {
  render(<ManagementApp assetApi={createAssetApi()} managementApi={createManagementApi()} />);

  const header = screen.getByRole("banner");
  const link = within(header).getByRole("link", { name: "Open Operator Console" });
  expect(link).toHaveAttribute("href", "/operator");
  expect(link).not.toHaveAttribute("target");
  expect(link).toHaveClass("surface-switch-link");
});
```

- [x] **Step 3: Move the sidebar expectation to absence**

Replace the existing `ManagementNavigation` new-tab test with:

```tsx
it("keeps surface switching out of primary navigation", () => {
  render(<ManagementNavigation activeRoute={{ id: "home" }} onNavigate={vi.fn()} />);

  expect(screen.queryByRole("link", { name: "Open Operator Console" })).not.toBeInTheDocument();
  expect(screen.getByText("Local only")).toBeInTheDocument();
});
```

- [x] **Step 4: Add the failing operator-header test**

In `OperatorApp.test.tsx`, add:

```tsx
it("places management navigation in the shared header action position", async () => {
  render(<OperatorApp api={createApi({ getSnapshot: async () => snapshot() })} />);

  const link = await screen.findByRole("link", { name: "Back to management" });
  expect(link).toHaveAttribute("href", "/manage");
  expect(link).not.toHaveAttribute("target");
  expect(link).toHaveClass("surface-switch-link");
});
```

- [x] **Step 5: Run the focused tests and verify RED**

Run:

```powershell
node_modules\.bin\vitest.CMD run apps/web/src/management/ManagementApp.test.tsx apps/web/src/management/navigation/ManagementNavigation.test.tsx apps/web/src/operator/OperatorApp.test.tsx
```

Expected: the new header-placement/shared-class assertions fail because the management link is still in the sidebar and the operator link lacks the shared class.

### Task 2: Implement The Shared Header Action

**Files:**
- Modify: `apps/web/src/management/foundation/PageHeader.tsx`
- Modify: `apps/web/src/management/ManagementApp.tsx`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.tsx`
- Modify: `apps/web/src/operator/OperatorApp.tsx`
- Modify: `apps/web/src/App.css`

**Interfaces:**
- Consumes: `PageHeaderProps.status`, existing button CSS, and native anchor navigation.
- Produces: `PageHeaderProps.action?: ReactNode` and `.surface-switch-link`.

- [x] **Step 1: Add the minimal page-header action slot**

Update `PageHeaderProps` and the right side of `PageHeader`:

```tsx
readonly action?: ReactNode | undefined;
```

```tsx
{status === undefined && action === undefined ? null : (
  <div className="management-page-header__actions">{status}{action}</div>
)}
```

- [x] **Step 2: Move the management link into the header**

Pass this `action` from `ManagementApp`:

```tsx
<a className="button button--secondary surface-switch-link" href="/operator">
  Open Operator Console
</a>
```

Remove the link from `ManagementNavigation`, leaving the `Local only` status in its footer.

- [x] **Step 3: Apply the shared class to the operator return link**

Replace the plain operator anchor with:

```tsx
<a className="button button--secondary surface-switch-link" href="/manage">
  Back to management
</a>
```

- [x] **Step 4: Add responsive shared styling**

Add:

```css
.management-page-header__actions {
  align-items: center;
  display: flex;
  gap: 10px;
}

.surface-switch-link {
  align-items: center;
  display: inline-flex;
  justify-content: center;
  text-decoration: none;
  white-space: nowrap;
}
```

At `max-width: 640px`, make `.management-page-header__actions` column-aligned and `.surface-switch-link` full width.

- [x] **Step 5: Run the focused tests and verify GREEN**

Run the Task 1 Vitest command.

Expected: all selected test files pass with zero failures.

### Task 3: Storybook, Browser Workflow, And Verification

**Files:**
- Modify: `apps/web/src/management/ManagementApp.stories.tsx`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.stories.tsx`
- Modify: `tests/e2e/operator.spec.ts`
- Modify: `openspec/changes/add-alert-playback-operator-controls/tasks.md`

**Interfaces:**
- Consumes: production management/operator components and routes.
- Produces: executable coverage for same-tab switching and responsive placement.

- [x] **Step 1: Update Storybook assertions**

Add a `FullShell.play` assertion for the `/operator` header link without a target. Remove the obsolete operator-link assertion from the navigation-only story.

- [x] **Step 2: Update Playwright to verify same-tab navigation**

Replace popup handling with:

```ts
const operatorLink = page.getByRole("link", { name: "Open Operator Console" });
await expect(operatorLink).not.toHaveAttribute("target");
await operatorLink.click();
const operator = page;
```

Keep the existing operator command assertions unchanged.

- [x] **Step 3: Run focused browser-visible gates**

Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e -- tests/e2e/operator.spec.ts
```

Expected: Storybook build/tests and the focused operator Playwright spec pass.

- [x] **Step 4: Run repository and OpenSpec gates**

Run:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
openspec.cmd validate add-alert-playback-operator-controls --strict
```

Expected: all commands exit zero and strict OpenSpec validation succeeds.

- [x] **Step 5: Rebuild, restart, and verify live**

Restart the local server from the rebuilt workspace, wait for `/health`, then verify `/manage` and `/operator` at desktop and narrow widths. Confirm both links occupy the rightmost header action position, ordinary clicks stay in the same tab, focus is visible, and the browser console has no errors.

- [x] **Step 6: Complete the OpenSpec follow-up tasks**

Mark the navigation follow-up tasks complete only after the focused tests, gates, and live verification pass.
