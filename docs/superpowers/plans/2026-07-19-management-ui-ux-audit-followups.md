# Management UI UX Audit Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make management configuration safe and responsive while making browser-source overlays resilient to disconnects and noncanonical viewport sizes.

**Architecture:** Preserve the local route model, typed management APIs, focused editor route, fixed alert profiles, and overlay authorization. Fix shared failures at their existing boundaries: shell link capture for dirty navigation, page-local retry-only load states, native/Diagnostics keyboard patterns, one overlay reconnect owner, and one fixed-profile scale wrapper.

**Tech Stack:** React 19, TypeScript 6, CSS custom properties, browser `Intl`, WebSocket, Vitest, Testing Library, Storybook, Playwright, OpenSpec.

## Global Constraints

- Add no runtime dependencies, router, component library, i18n package, resizable-pane framework, or OBS integration.
- Preserve strict TypeScript, existing management/overlay authorization split, and exact 1920x1080 Landscape plus 1080x1920 Vertical profiles.
- Production overlay failures render no diagnostic DOM content; diagnostics remain management/log-only.
- Use existing design tokens and native HTML before new abstractions.
- Follow TDD: add one failing behavior test, run it red, add minimum production change, run green.
- Use production components in Storybook and role/label-based selectors in tests.

---

### Task 1: Restore Green Baseline And Guard Internal Navigation

**Files:**
- Modify: `apps/web/src/management/providers/ProviderPages.test.tsx`
- Modify: `apps/web/src/management/ManagementApp.tsx`
- Modify: `apps/web/src/management/ManagementApp.test.tsx`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.tsx`
- Modify: `apps/web/src/management/navigation/ManagementNavigation.stories.tsx`
- Modify: `apps/web/src/management/routing/management-route.ts`
- Modify: `apps/web/src/App.css`

**Interfaces:**
- Consumes: `parseManagementRoute(href: string): ManagementRoute`, `navigation.requestNavigation(route)`.
- Produces: shell `onClickCapture` behavior for eligible same-origin `/manage` anchors; Modules renders as a group label and Alerts as the only link/current destination.

- [ ] **Step 1: Confirm and correct the existing async test defect**

Change the detail assertion to await the detail request already represented by the test:

```tsx
expect(await screen.findByText("Jamsethoth (@jamsethoth)")).toBeInTheDocument();
```

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/providers/ProviderPages.test.tsx -t "shows authorization recovery for an inactive registered Twitch source"
```

Expected: one passing test; the prior deterministic failure no longer reads the detail synchronously.

- [ ] **Step 2: Write failing shell navigation tests**

In `ManagementApp.test.tsx`, register a dirty source, activate a rendered `/manage/tts-providers` anchor, and assert `Leave with unsaved changes?` appears before the location changes. Add separate assertions that Ctrl-click, `target="_blank"`, downloads, and external origins are not intercepted.

Use the existing dirty-source test component and this anchor shape:

```tsx
<a href="/manage/tts-providers">Set up TTS</a>
```

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/ManagementApp.test.tsx
```

Expected: new guarded-link test fails because raw anchors currently bypass `requestNavigation`.

- [ ] **Step 3: Implement one shell-boundary interceptor**

Add a capture handler to `.app-shell`. It MUST return without interception when the event is prevented, not button 0, modified, the anchor has `download`, its target is nonempty and not `_self`, origin differs, or pathname does not start `/manage`. Otherwise prevent default and call:

```tsx
navigation.requestNavigation(parseManagementRoute(`${url.pathname}${url.search}${url.hash}`));
```

Do not add props to correction-link consumers.

- [ ] **Step 4: Remove duplicate Modules/Alerts current links**

Keep Modules as a non-anchor group label when `childRoutes.length > 0`; render Alerts as its child link. Update narrow CSS so the child remains visible and all primary destinations wrap instead of requiring an unlabeled horizontal scrollbar.

- [ ] **Step 5: Run focused tests**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/ManagementApp.test.tsx apps/web/src/management/providers/ProviderPages.test.tsx
```

Expected: both files pass.

### Task 2: Safe Initial Load And Operator-Safe Errors

**Parallel lane:** Safe-load/error agent. Do not edit overlay or focused-editor files.

**Files:**
- Modify: `apps/web/src/management/foundation/ManagementErrorBanner.tsx`
- Modify: `apps/web/src/management/foundation/ManagementFoundation.test.tsx`
- Modify: `apps/web/src/management/settings/SettingsPanel.tsx`
- Modify: `apps/web/src/management/settings/SettingsPanel.test.tsx`
- Modify: `apps/web/src/management/settings/SettingsPanel.stories.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.stories.tsx`
- Modify: `apps/web/src/management/assets/AssetManager.tsx`
- Modify: `apps/web/src/management/assets/AssetManager.test.tsx`
- Modify: `apps/web/src/management/assets/AssetManager.stories.tsx`
- Modify: `apps/web/src/management/providers/ProviderPage.tsx`
- Modify: `apps/web/src/management/settings/settings-panel.css`

**Interfaces:**
- Produces: retry-only initial error states; `formatManagementErrorCause(cause: string): string` or equivalent file-local/shared helper that never returns raw serialized issue arrays.
- Preserves: existing `ActionableManagementError` contract and reference IDs.

- [ ] **Step 1: Write failing initial-load tests and stories**

For Settings, Alerts, and Assets, reject only the initial list/summary request. Assert the actionable error is present and assert absence of mutation controls and valid-empty copy, for example:

```tsx
expect(screen.queryByRole("button", { name: "Save server settings" })).not.toBeInTheDocument();
expect(screen.queryByText("No alert sets yet.")).not.toBeInTheDocument();
expect(screen.queryByText("No assets imported yet.")).not.toBeInTheDocument();
```

Run the three focused test files. Expected: assertions fail against current fallback/empty rendering.

- [ ] **Step 2: Return retry-only states**

Track whether initial authoritative data loaded. On initial error, render `ManagementErrorBanner` plus a `Retry` button that invokes the existing load function. Do not render forms, empty-state creation buttons, or inventory mutation actions until a load succeeds.

- [ ] **Step 3: Write failing structured-error test**

Pass a cause containing a serialized Zod issue array and assert the raw `"invalid_value"` token is absent while the expected-values sentence is present.

- [ ] **Step 4: Implement minimum cause formatting**

Attempt JSON parsing only when the cause begins with `[` or `{`. If it is an issue array, join nonempty issue messages and paths into one sentence. On parse failure, retain the existing safe cause string. Never render stack/object serialization.

- [ ] **Step 5: Remove duplicate in-panel page headings**

Delete provider and Settings copies of route title/description; preserve page-specific action rows, version, and descriptive section headings. Rename Diagnostics' internal workspace heading to a lower-level label or remove it when the shared route heading already supplies context.

- [ ] **Step 6: Run focused tests and build changed stories**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/foundation/ManagementFoundation.test.tsx apps/web/src/management/settings/SettingsPanel.test.tsx apps/web/src/management/alerts/AlertSetsPage.test.tsx apps/web/src/management/assets/AssetManager.test.tsx apps/web/src/management/providers/ProviderPages.test.tsx
corepack.cmd pnpm --filter @stream-jams/web build-storybook
```

Expected: focused tests pass and Storybook builds.

### Task 3: Overlay Reconnect, Scaling, And True Fail-Closed Rendering

**Parallel lane:** Overlay agent. Do not edit management page files or `App.css`; use overlay-local TSX/CSS if styling is needed.

**Files:**
- Modify: `apps/web/src/overlay/overlay-client.ts`
- Modify: `apps/web/src/overlay/overlay-client.test.ts`
- Modify: `apps/web/src/overlay/OverlayApp.tsx`
- Modify: `apps/web/src/overlay/OverlayApp.test.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.test.tsx`
- Modify: `apps/web/src/overlay/components/OverlaySurface.stories.tsx`
- Optional create: `apps/web/src/overlay/components/overlay-surface.css`

**Interfaces:**
- Preserve current overlay route parsing, message schemas, completion/failure reporting, and route-key URLs.
- Produce reconnect delays `1000, 2000, 4000, 8000, 10000...` milliseconds and a cleanup that cancels retry plus closes active socket.
- Produce fixed profile dimensions Landscape `1920x1080`, Vertical `1080x1920`.

- [ ] **Step 1: Write failing reconnect tests**

Use `vi.useFakeTimers()` and a minimal fake WebSocket class. Assert unexpected close schedules one new socket after 1 second, successive pre-open closes use 2/4/8/10 seconds, `open` resets to 1 second, and cleanup prevents new sockets.

Run:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/overlay/overlay-client.test.ts
```

Expected: new reconnect tests fail because current client creates one socket only.

- [ ] **Step 2: Implement one reconnect owner**

Keep `socket` and `retryTimer` inside the existing connection function. `connect()` creates listeners; `close` schedules only if not disposed; `open` resets attempt; cleanup sets disposed, clears timeout, and closes socket. Do not expose retry configuration in production APIs.

- [ ] **Step 3: Write failing scale tests**

Render Landscape and Vertical composition into fixed viewport sizes. Assert a profile-canvas wrapper exposes profile pixel dimensions and a uniform scale/centering style. Cover canonical 1:1 and one mismatched aspect ratio.

- [ ] **Step 4: Implement fixed canvas scaling**

Render layers inside a fixed-size canvas. Compute:

```ts
const scale = Math.min(viewportWidth / profileWidth, viewportHeight / profileHeight);
```

Center with transparent unused space. Keep all stored layer geometry in profile pixels.

- [ ] **Step 5: Write failing fail-closed test and implement empty production error tree**

Assert transport/internal errors do not produce their message or role text in live `OverlayApp`. Return the empty overlay root instead of transparent diagnostic text. Keep explicit safe diagnostic examples only in Storybook component stories.

Add `dir="auto"` to resolved user-generated overlay text in this same file so later locale work does not overlap the overlay agent's edits.

- [ ] **Step 6: Run overlay tests**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/overlay/overlay-client.test.ts apps/web/src/overlay/OverlayApp.test.tsx apps/web/src/overlay/OverlayApp.lifecycle.test.tsx apps/web/src/overlay/components/OverlaySurface.test.tsx
```

Expected: all overlay tests pass.

### Task 4: Focused Alert Editor Context, Layout, And Tabs

**Files:**
- Modify: `apps/web/src/management/ManagementApp.tsx`
- Modify: `apps/web/src/management/ManagementApp.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.stories.tsx`
- Modify: `apps/web/src/management/alerts/editor/alert-editor-page.css`
- Modify: `apps/web/src/App.css`

**Interfaces:**
- Consumes loaded `AlertSetDetail.overview.name` and `AlertEditorDocument.setId/name/eventType` already fetched by `AlertEditorPage`.
- Changes `onBack` to receive authoritative `setId: string`, or changes the focused route callback equivalently without adding another fetch.

- [ ] **Step 1: Write failing context and Back tests**

Assert the loaded set name and alert name appear in a `Breadcrumb` navigation. Start with a stale route `set` query, activate Back, and assert navigation formats the loaded document's set ID.

- [ ] **Step 2: Implement compact loaded breadcrumb and authoritative Back**

Render `Alerts / {setDetail.overview.name} / {document.name}` above the editor title. Pass `document.setId` to Back. Do not show raw stable IDs.

- [ ] **Step 3: Write failing tab keyboard test**

Focus Layers, press ArrowRight, End, Home, and assert selected tab plus one `tabIndex=0`. Assert `aria-controls` and the active `tabpanel` ID.

- [ ] **Step 4: Reuse Diagnostics tab keyboard behavior**

Use the same key mapping and focus approach as `DiagnosticsPanel`. No generic tab component is required.

- [ ] **Step 5: Make focused route use available viewport**

Add a focused class to `management-route-content` or bypass its 1280px maximum for editor routes. Set the focused main/editor workspace to available `100dvh` space; keep side panes independently scrollable. At `701px-980px`, use `grid-template-columns: 180px minmax(0, 1fr)` and place inspector across `1 / -1`; at `<=700px`, retain the guard and hide workspace.

- [ ] **Step 6: Run focused tests**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/ManagementApp.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
```

Expected: tests pass.

### Task 5: Responsive Primary Actions And Browser-Source Onboarding

**Files:**
- Modify: `apps/web/src/App.css`
- Modify: `apps/web/src/management/providers/provider-pages.css`
- Modify: `apps/web/src/management/alerts/alert-sets-page.css`
- Modify: `apps/web/src/management/assets/asset-library.css`
- Modify: `apps/web/src/management/diagnostics/diagnostics-workspace.css`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.stories.tsx`
- Modify: `apps/web/src/management/assets/AssetManager.tsx`
- Modify: `apps/web/src/management/assets/AssetManager.test.tsx`
- Modify: `tests/e2e/management.spec.ts`
- Modify: `tests/e2e/management-alerts.spec.ts`
- Modify: `tests/e2e/management-assets.spec.ts`

**Interfaces:**
- Preserve semantic tables at desktop/tablet widths.
- Profile dimensions: Landscape `1920 x 1080`, Vertical `1080 x 1920`.
- Reveal button toggles local revealed-ID membership only; Hide performs no API call.

- [ ] **Step 1: Add failing browser-source tests**

Assert each expanded profile exposes its dimension text and manual browser-source guidance. Reveal a URL, assert button becomes `Hide`, activate Hide, and assert the masked value returns without a management API mutation.

- [ ] **Step 2: Implement dimensions, guidance, and reveal toggle**

Use one constant map keyed by target profile. Toggle the existing revealed-ID set:

```tsx
setRevealedOutputIds((current) => current.has(id)
  ? new Set([...current].filter((candidate) => candidate !== id))
  : new Set(current).add(id));
```

- [ ] **Step 3: Add responsive CSS without generic table abstraction**

At narrow breakpoints, wrap navigation; reduce Alerts inline actions to Edit, Test, Enable/Disable plus existing More; keep provider identity/status/action visible; stack asset details and collapse secondary filters using native `details`; move Diagnostics exports below Problems content on mobile. Avoid hiding the only action for any row.

- [ ] **Step 4: Add Playwright viewport assertions**

At 390px assert primary destinations and one primary action per sampled inventory are visible without scrolling the table horizontally. At 820px assert Alerts actions and editor canvas remain usable. At 1920px assert focused editor width exceeds 1280px.

- [ ] **Step 5: Run page tests and targeted Playwright**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/AlertSetsPage.test.tsx apps/web/src/management/assets/AssetManager.test.tsx
corepack.cmd pnpm exec playwright test tests/e2e/management.spec.ts tests/e2e/management-alerts.spec.ts tests/e2e/management-assets.spec.ts
```

Expected: unit and viewport workflows pass.

### Task 6: Accessible Selection, Locale Formatting, And Token Cleanup

**Files:**
- Modify: `apps/web/src/management/assets/AssetPicker.tsx`
- Modify: `apps/web/src/management/assets/AssetPicker.test.tsx`
- Modify: `apps/web/src/management/assets/AssetManager.tsx`
- Modify: `apps/web/src/management/assets/AssetManager.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.test.tsx`
- Create: `apps/web/src/management/foundation/formatters.ts`
- Create: `apps/web/src/management/foundation/formatters.test.ts`
- Modify: `apps/web/src/management/settings/SettingsPanel.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/.storybook/preview.ts`
- Modify: `apps/web/src/App.css`

**Interfaces:**
- Produce `formatDateTime`, `formatDate`, `formatBytes`, `formatCount`, and `formatHours` helpers using browser `Intl` only.
- Preserve all existing stored values; formatting changes presentation only.

- [ ] **Step 1: Write failing asset/canvas keyboard tests**

Assert asset choices are native buttons with `aria-pressed`, not listbox options. Focus a canvas layer, press Enter and Space, and assert `onSelectLayer` plus selected state. Assert in-use deletion help is visible and referenced with `aria-describedby`.

- [ ] **Step 2: Implement native selection behavior**

Remove incomplete listbox/option roles. Handle Enter/Space in the existing canvas key handler while retaining arrow geometry movement.

- [ ] **Step 3: Write formatter tests first**

Cover `1 hour`, `24 hours` or `1 day` according to current product copy, `1 use`, plural uses, deterministic binary byte labels, and locale-aware date formatting with an explicit test locale.

- [ ] **Step 4: Implement shared `Intl` helpers and replace local duplicates**

Accept an optional locale for tests; default to `document.documentElement.lang || navigator.language || "en"`. Keep KiB/MiB consistently because values use powers of 1024.

- [ ] **Step 5: Set language/direction and user-text boundaries**

At app startup, set `document.documentElement.lang` from `navigator.language || "en"`; set `dir="rtl"` only for `ar`, `fa`, `he`, and `ur`, otherwise `ltr`. Overlay text direction is owned by Task 3 to keep parallel file scopes disjoint.

- [ ] **Step 6: Replace fixed management action colors and delete dead touched CSS**

Use `--color-accent`, `--color-negative`, and existing hover tokens. Delete pre-refactor selectors proven unused by `rg`; do not reformat unrelated CSS.

- [ ] **Step 7: Add RTL/expanded-copy Storybook globals and run focused tests**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/assets/AssetPicker.test.tsx apps/web/src/management/assets/AssetManager.test.tsx apps/web/src/management/alerts/editor/AlertCanvas.test.tsx apps/web/src/management/foundation/formatters.test.ts
```

Expected: tests pass.

### Task 7: Integrated Review, Browser Verification, And OpenSpec Completion

**Files:**
- Modify: changed Storybook stories and Playwright specs only when verification exposes an uncovered required state.
- Modify: `openspec/changes/improve-management-ui-ux-audit-followups/tasks.md` checkboxes as each verified task completes.

**Interfaces:**
- No new production interfaces.

- [ ] **Step 1: Run all static and unit gates**

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
```

Expected: exit 0 for each; unit suite has zero failures.

- [ ] **Step 2: Run Storybook gates**

```powershell
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
```

Expected: build and axe-enabled stories pass.

- [ ] **Step 3: Run browser workflows**

```powershell
corepack.cmd pnpm test:e2e
```

Expected: all Playwright tests pass.

- [ ] **Step 4: Rebuild, restart, and inspect live UI**

Verify `/manage` at 390, 820, 1280, and 1920 CSS pixels; inspect every top-level route, dirty correction links, retry-only states, editor breadcrumb/workspace, browser-source dimensions/Hide, and both overlay profiles. Confirm no console errors or visible production overlay diagnostics.

- [ ] **Step 5: Validate OpenSpec and reconcile requirements**

```powershell
openspec.cmd validate improve-management-ui-ux-audit-followups --strict
```

Expected: strict validation passes. Check every OpenSpec scenario against a focused test, Storybook state, Playwright assertion, or recorded live verification before marking tasks complete.
