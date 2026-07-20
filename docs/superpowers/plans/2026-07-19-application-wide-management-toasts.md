# Application-Wide Management Toasts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace layout-shifting transient management feedback with one responsive green-success, yellow-warning, and red-failure toast pattern.

**Architecture:** Keep each mounted page as owner of its existing async state. Add two small foundation renderers: `ManagementToast` for text feedback and `ManagementErrorToast` for `ActionableManagementError`. Both share fixed positioning, semantic tones, auto-dismiss behavior, wrapping, and dismissal controls; blocking and corrective messages remain inline.

**Tech Stack:** React 19.2.6, TypeScript 6.0.3, CSS custom properties, Vitest 4.1.7, Testing Library, Storybook, Playwright.

## Global Constraints

- Add no runtime dependency, notification store, provider, queue, or stacking system.
- Success uses green and expires after 4,000 ms.
- Warning uses yellow and expires after 4,000 ms.
- Failure uses red, is manually dismissible, and expires after 8,000 ms.
- Visible text and semantic roles communicate outcome without relying on color.
- Initial-load failures, stale refresh failures, validation, wizard/modal failures, confirmations, and warnings requiring a decision remain inline.
- Toast width never exceeds viewport; timestamps, reference IDs, actions, and localized copy wrap inside it.

---

### Task 1: Shared Toast Foundation

**Files:**
- Create: `apps/web/src/management/foundation/ManagementToast.tsx`
- Modify: `apps/web/src/management/foundation/ManagementErrorBanner.tsx`
- Modify: `apps/web/src/management/foundation/ManagementFoundation.test.tsx`
- Modify: `apps/web/src/management/foundation/ManagementFoundation.stories.tsx`
- Modify: `apps/web/src/App.css`

**Interfaces:**
- Produces: `ManagementToastTone = "success" | "warning" | "failure"`.
- Produces: `ManagementToastNotice { tone, message, detail? }`.
- Produces: `ManagementToast({ notice, onDismiss })`.
- Produces: `ManagementErrorToast({ error, onDismiss })`.
- Changes: `ManagementErrorBanner({ error, role? })`, defaulting `role` to `"alert"` for existing inline callers.

- [ ] **Step 1: Write failing foundation tests**

Add tests proving semantic tone classes, roles, timers, dismissal, and metadata containment:

Update Testing Library import to `import { act, render, screen } from "@testing-library/react";` and import both toast components from `./ManagementToast.js`.

```tsx
it.each([
  ["success", "status", "management-toast--success", 4_000],
  ["warning", "status", "management-toast--warning", 4_000],
  ["failure", "alert", "management-toast--failure", 8_000]
] as const)("renders and expires %s feedback", (tone, role, className, timeoutMs) => {
  vi.useFakeTimers();
  const onDismiss = vi.fn();
  render(<ManagementToast notice={{ tone, message: `${tone} result` }} onDismiss={onDismiss} />);
  expect(screen.getByRole(role)).toHaveClass("management-toast", className);
  act(() => vi.advanceTimersByTime(timeoutMs - 1));
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onDismiss).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it("keeps actionable metadata and controls inside the failure toast", async () => {
  const user = userEvent.setup();
  const onDismiss = vi.fn();
  const referenceId = `err_${"long-reference-".repeat(12)}`;
  render(<ManagementErrorToast error={{
    summary: "Save failed",
    cause: "The local service rejected the request.",
    nextStep: "Retry after checking Diagnostics.",
    severity: "error",
    occurredAt: "2026-07-19T22:45:00.000Z",
    referenceId,
    correction: null
  }} onDismiss={onDismiss} />);
  const toast = screen.getByRole("alert").closest(".management-toast");
  expect(toast).toContainElement(screen.getByText(referenceId));
  expect(toast).toContainElement(screen.getByRole("link", { name: "Open diagnostics" }));
  await user.click(screen.getByRole("button", { name: "Dismiss failure" }));
  expect(onDismiss).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run foundation tests and verify RED**

Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/web test -- ManagementFoundation.test.tsx
```

Expected: failure because `ManagementToast.js`, exports, roles, and toast classes do not exist.

- [ ] **Step 3: Implement minimal toast renderers**

Create `ManagementToast.tsx` with these exact public shapes and behavior:

```tsx
import { useEffect, useRef } from "react";
import type { ActionableManagementError } from "@stream-jams/core";
import { ManagementErrorBanner } from "./ManagementErrorBanner.js";

export type ManagementToastTone = "success" | "warning" | "failure";

export interface ManagementToastNotice {
  readonly tone: ManagementToastTone;
  readonly message: string;
  readonly detail?: string | undefined;
}

export function ManagementToast({ notice, onDismiss }: {
  readonly notice: ManagementToastNotice;
  readonly onDismiss: () => void;
}) {
  useAutoDismiss(`${notice.tone}:${notice.message}:${notice.detail ?? ""}`, notice.tone, onDismiss);
  const label = notice.tone === "success" ? "Success" : notice.tone === "warning" ? "Warning" : "Failure";
  return (
    <section className={`management-toast management-toast--${notice.tone}`} role={notice.tone === "failure" ? "alert" : "status"}>
      <div className="management-toast__content"><strong>{label}</strong><p>{notice.message}</p>{notice.detail === undefined ? null : <p>{notice.detail}</p>}</div>
      <button className="button button--secondary" onClick={onDismiss} type="button">Dismiss {label.toLowerCase()}</button>
    </section>
  );
}

export function ManagementErrorToast({ error, onDismiss }: {
  readonly error: ActionableManagementError;
  readonly onDismiss: () => void;
}) {
  const tone: ManagementToastTone = error.severity === "warning" ? "warning" : error.severity === "info" ? "success" : "failure";
  useAutoDismiss(error, tone, onDismiss);
  return (
    <div className={`management-toast management-toast--${tone} management-toast--actionable`}>
      <ManagementErrorBanner error={error} role={tone === "failure" ? "alert" : "status"} />
      <div className="management-toast__actions">
        {error.referenceId === null ? null : <a href={`/manage/diagnostics?reference=${encodeURIComponent(error.referenceId)}`}>Open diagnostics</a>}
        <button className="button button--secondary" onClick={onDismiss} type="button">Dismiss {tone}</button>
      </div>
    </div>
  );
}

function useAutoDismiss(trigger: unknown, tone: ManagementToastTone, onDismiss: () => void) {
  const dismissRef = useRef(onDismiss);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    const timeout = window.setTimeout(() => dismissRef.current(), tone === "failure" ? 8_000 : 4_000);
    return () => window.clearTimeout(timeout);
  }, [tone, trigger]);
}
```

Change `ManagementErrorBanner` to accept `role?: "alert" | "status"` and render `role={role}` while preserving `"alert"` as default.

Add this foundation styling, then use the existing narrow breakpoint to change the inset:

```css
.management-toast {
  bottom: 24px;
  box-sizing: border-box;
  display: flex;
  filter: drop-shadow(0 8px 18px rgb(0 0 0 / 22%));
  gap: 16px;
  justify-content: space-between;
  max-width: calc(100vw - 48px);
  overflow-wrap: anywhere;
  padding: 13px 14px;
  position: fixed;
  right: 24px;
  width: min(480px, calc(100vw - 48px));
  z-index: 900;
}
.management-toast--success { background: var(--color-positive-soft); border: 1px solid var(--color-positive); }
.management-toast--warning { background: var(--color-warning-soft); border: 1px solid var(--color-warning); }
.management-toast--failure { background: var(--color-negative-soft); border: 1px solid var(--color-negative); }
.management-toast__content { min-width: 0; }
.management-toast__content p { margin: 5px 0 0; }
.management-toast--actionable { display: block; padding: 0; }
.management-toast--actionable .management-error-banner { background: transparent; border: 0; flex-direction: column; min-width: 0; }
.management-toast .management-error-banner__meta { align-items: flex-start; max-width: 100%; min-width: 0; }
.management-toast code, .management-toast time, .management-toast a { max-width: 100%; overflow-wrap: anywhere; white-space: normal; }
.management-toast__actions { align-items: center; border-top: 1px solid currentColor; display: flex; gap: 12px; justify-content: flex-end; padding: 10px 14px; }
```

At the existing narrow breakpoint set `.management-toast { bottom: 16px; left: 16px; max-width: none; right: 16px; width: auto; }`.

- [ ] **Step 4: Add Storybook scenarios**

Add `SuccessToast`, `WarningToast`, and `FailureToastLongMetadata` foundation stories using production components. Long failure story uses a repeated reference ID and timestamp to expose overflow.

- [ ] **Step 5: Run foundation tests and verify GREEN**

Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/web test -- ManagementFoundation.test.tsx
```

Expected: foundation tests pass.

- [ ] **Step 6: Commit foundation**

```powershell
git add apps/web/src/management/foundation/ManagementToast.tsx apps/web/src/management/foundation/ManagementErrorBanner.tsx apps/web/src/management/foundation/ManagementFoundation.test.tsx apps/web/src/management/foundation/ManagementFoundation.stories.tsx apps/web/src/App.css
git commit -m "feat(web): add shared management toasts"
```

### Task 2: Migrate Existing Transient Feedback

**Files:**
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx`
- Modify: `apps/web/src/management/alerts/alert-sets-page.css`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/assets/AssetManager.tsx`
- Modify: `apps/web/src/management/assets/asset-library.css`
- Modify: `apps/web/src/management/assets/AssetManager.test.tsx`
- Modify: `apps/web/src/management/providers/ProviderPage.tsx`
- Modify: `apps/web/src/management/providers/provider-pages.css`
- Modify: `apps/web/src/management/providers/ProviderPages.test.tsx`
- Modify: `apps/web/src/management/settings/SettingsPanel.tsx`
- Modify: `apps/web/src/management/settings/settings-panel.css`
- Modify: `apps/web/src/management/settings/SettingsPanel.test.tsx`
- Modify: `apps/web/src/management/diagnostics/DiagnosticsPanel.tsx`
- Modify: `apps/web/src/management/diagnostics/diagnostics-workspace.css`
- Modify: `apps/web/src/management/diagnostics/DiagnosticsPanel.test.tsx`
- Modify: `apps/web/src/management/foundation/MaskedValue.tsx`
- Modify: `apps/web/src/management/foundation/ThemeSwitcher.tsx`

**Interfaces:**
- Consumes: `ManagementToastNotice`, `ManagementToast`, and `ManagementErrorToast` from Task 1.
- Preserves: all existing API calls, diagnostics reporting, load/error boundaries, wizard state, modal state, copy semantics, and user-visible message text.

- [ ] **Step 1: Add failing migration assertions**

Update existing success/failure tests to require `.management-toast` and tone classes. Add warning assertions for alert-editor design/profile copy, alert-set route-key regeneration, starter review, and Settings restore/restart results. Preserve assertions that initial load failures, provider refresh failures, asset-picker errors, and wizard errors are not inside `.management-toast`.

Use this assertion shape in each existing workflow test:

```tsx
const toast = await screen.findByText("Asset details saved.");
expect(toast.closest(".management-toast")).toHaveClass("management-toast--success");
```

Use this warning assertion shape:

```tsx
const warning = await screen.findByText(/URL regenerated/u);
expect(warning.closest(".management-toast")).toHaveClass("management-toast--warning");
```

Change alert-editor action-error expectation from `.alert-editor-page__action-error` to `.management-toast--failure`; keep diagnostics reporting, dismissal, and 8,000 ms expiry assertions.

- [ ] **Step 2: Run focused page tests and verify RED**

Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/web test -- ManagementFoundation.test.tsx AlertSetsPage.test.tsx AlertEditorPage.test.tsx AssetManager.test.tsx ProviderPages.test.tsx SettingsPanel.test.tsx DiagnosticsPanel.test.tsx
```

Expected: tests fail because current notices remain inline and do not carry toast tone classes.

- [ ] **Step 3: Convert text notice state to typed toast state**

In Alerts, editor, Assets, Providers, Settings, and Diagnostics, use:

```tsx
const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
```

Render:

```tsx
{notice === null ? null : <ManagementToast notice={notice} onDismiss={() => setNotice(null)} />}
```

Use exact tone classification:

- Success: saved, copied, queued, tested, exported, opened, enabled, disabled, activated, created without review, renamed, deleted, replaced, reconnected, and local preview running.
- Warning: created or duplicated disabled/Needs review, layout/design copied for review, alert reset to Needs review, starter review while alerts remain disabled, browser-source URL regeneration requiring external updates, server settings saved with possible restart, and restore completed with follow-up actions.
- Failure: nonblocking command errors, clipboard errors, theme persistence errors, and Diagnostics copy/export errors.

- [ ] **Step 4: Convert actionable command errors**

Replace post-load `ManagementErrorBanner` uses with:

```tsx
{error === null ? null : <ManagementErrorToast error={error} onDismiss={() => setError(null)} />}
```

Apply only where content has loaded and command failure does not invalidate page state:

- `AlertSetsPage`: general post-load `error`; keep initial-load return, dialog errors, and browser-source refresh error inline.
- `AlertEditorPage`: loaded `error`; keep initial-load failure inline and remove page-owned 8-second timer plus old action-error wrapper/actions.
- `AssetManager`: post-load `error`; keep initial-load return, picker, replacement validation, and dirty-navigation errors inline.
- `ProviderPage`: `operationError`; keep `pageError`, `refreshError`, provider health, setup `requestError`, and validation errors inline.
- `SettingsPanel`: post-load `error`; keep initial-load return, backup blockers, preflight blockers/warnings, and restore-result warnings inline.

- [ ] **Step 5: Preserve Diagnostics load failure inline**

Split Diagnostics state:

```tsx
const [loadNotice, setLoadNotice] = useState<ManagementToastNotice | null>(null);
const [notice, setNotice] = useState<ManagementToastNotice | null>(null);
```

Set `loadNotice` only from `loadWorkspace()` failure and clear it on retry/success. Render it through existing inline load-failure content, while copy/export outcomes use `ManagementToast`. Change `failureNotice()` to return `{ tone: "failure", message: title, detail }`.

- [ ] **Step 6: Migrate foundation-local feedback**

In `MaskedValue`, replace `feedback: string | null` with `ManagementToastNotice | null`; copy success uses success and clipboard failure uses failure. In `ThemeSwitcher`, render existing storage error through a failure `ManagementToast`; keep theme controls and session behavior unchanged.

- [ ] **Step 7: Delete superseded inline notice CSS**

Remove only selectors no longer rendered:

- `.alert-sets-page__notice`
- `.alert-editor-page__notice`
- `.alert-editor-page__action-error*`
- `.asset-library__success`
- top-level `.provider-page__notice` styling retained only if wizard review still uses it
- `.settings-page__notice`
- transient `.diagnostics-workspace__notice--positive`; retain inline load-failure styling
- `.management-copy-feedback` and `.theme-switcher__error` only if no remaining markup uses them

- [ ] **Step 8: Run focused tests and verify GREEN**

Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/web test -- ManagementFoundation.test.tsx AlertSetsPage.test.tsx AlertEditorPage.test.tsx AssetManager.test.tsx ProviderPages.test.tsx SettingsPanel.test.tsx DiagnosticsPanel.test.tsx ManagementApp.test.tsx
```

Expected: focused tests pass with no timer leakage warnings.

- [ ] **Step 9: Commit migration**

```powershell
git add apps/web/src/management apps/web/src/App.css
git commit -m "refactor(web): use toasts for transient feedback"
```

### Task 3: Browser Coverage And Completion

**Files:**
- Modify: `tests/e2e/management-alerts.spec.ts`
- Modify: `tests/e2e/management-assets.spec.ts`
- Modify: `tests/e2e/management-settings.spec.ts`
- Modify: `openspec/changes/improve-management-ui-ux-audit-followups/tasks.md`

**Interfaces:**
- Consumes: production toast roles/classes from Tasks 1 and 2.
- Produces: viewport, tone, layout, and auto-dismiss evidence for OpenSpec task 10.

- [ ] **Step 1: Add Playwright assertions for tone and viewport containment**

After existing alert enable, starter review, regeneration, asset save, and Settings maintenance actions, assert exact tone classes. For one 390px toast and one 1920px toast, assert:

```ts
const toast = page.locator(".management-toast");
await expect(toast).toBeVisible();
const box = await toast.boundingBox();
expect(box).not.toBeNull();
expect(box!.x).toBeGreaterThanOrEqual(0);
expect(box!.x + box!.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
```

Assert alert enable and asset save are green, starter review and route-key regeneration are yellow, and Settings action results remain fixed without increasing `document.documentElement.scrollWidth`.

- [ ] **Step 2: Run focused Playwright tests**

Run:

```powershell
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts tests/e2e/management-assets.spec.ts tests/e2e/management-settings.spec.ts
```

Expected: all focused browser tests pass at their configured viewports.

- [ ] **Step 3: Run required frontend gates**

Run:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate improve-management-ui-ux-audit-followups --strict
```

Expected: every command succeeds without skipped or weakened coverage.

- [ ] **Step 4: Rebuild, restart, and live-verify**

Build production artifacts, stop only the current Stream Jams service process after identifying its exact PID, start the new build, wait for health response, reload management UI, and verify:

- success toast is green and expires after four seconds;
- warning toast is yellow and expires after four seconds;
- failure toast is red, dismissible, and expires after eight seconds;
- long timestamp and reference ID remain within toast at 390px, 820px, and 1920px;
- initial-load, validation, wizard, and stale refresh errors remain inline;
- toast appearance does not change editor workspace height or page scroll width.

- [ ] **Step 5: Complete OpenSpec tasks and commit evidence**

Mark tasks 10.1 through 10.4 complete only after their corresponding checks pass.

```powershell
git add tests/e2e/management-alerts.spec.ts tests/e2e/management-assets.spec.ts tests/e2e/management-settings.spec.ts openspec/changes/improve-management-ui-ux-audit-followups/tasks.md
git commit -m "test(web): verify management toast workflows"
```
