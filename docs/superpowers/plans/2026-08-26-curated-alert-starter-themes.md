# Curated Alert Starter Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three universal, bundled, asset-free alert starter themes to alert creation and the focused editor while preserving alert behavior during re-theming.

**Architecture:** `packages/core` owns the validated theme IDs, catalog metadata, deterministic text/shape materializer, and pure re-theme operation. The server selects a theme while creating an ordinary editor document and otherwise reuses its existing mutation and persistence boundaries. The web app renders actual catalog output through a read-only preview component and applies themes to the current editor draft through the existing save/undo/live-impact flow.

**Tech Stack:** TypeScript 6, Zod, Node.js/Fastify, React 19, Vite, Vitest, Testing Library, Storybook, Playwright, OpenSpec.

**Spec:** `openspec/specs/alert-configuration-management/spec.md` (synced; implementation artifacts archived under `openspec/changes/archive/2026-08-26-add-curated-alert-starter-themes/`)

## Global Constraints

- Theme IDs are exactly `clean-signal`, `bold-pop`, and `neon-terminal`; `clean-signal` is the default.
- Every theme supports every canonical event type and both fixed profiles: landscape `1920x1080` and vertical `1080x1920`.
- Theme compositions contain only text and solid-fill shape layers; do not add dependencies, assets, migrations, external fonts, arbitrary CSS/HTML/JS, marketplaces, downloads, or persistent theme linkage.
- Re-theming preserves alert identity, name, event type, matching/variation behavior, cooldown, priority, duration, samples, template variables, audio, and TTS; it replaces text/shape/image/video composition, disables the alert, and sets both profiles to `needs-review` while preserving profile availability.
- Primary message precedence is: text layer named `Message` case-insensitively, first visible text layer by order, first text layer by order, then the canonical starter message.
- Theme application is deterministic and idempotent and returns `alertEditorDocumentSchema.parse(...)` output.
- Management UI uses existing semantic CSS variables, accessible controls, explicit confirmation, fixed toasts for transient feedback, and real production components in Storybook.
- BL-009, BL-008, BL-040, unrelated BL-039 cleanup, publishing, PR creation, and merging remain out of scope.

---

### Task 1: Materialize the OpenSpec change and promote BL-006

**Files:**
- Create: `openspec/changes/add-curated-alert-starter-themes/proposal.md`
- Create: `openspec/changes/add-curated-alert-starter-themes/design.md`
- Create: `openspec/changes/add-curated-alert-starter-themes/specs/alert-configuration-management/spec.md`
- Create: `openspec/changes/add-curated-alert-starter-themes/tasks.md`
- Modify: `docs/backlog.md`
- Modify: `docs/superpowers/plans/2026-08-26-curated-alert-starter-themes.md`

**Interfaces:**
- Produces: apply-ready OpenSpec change `add-curated-alert-starter-themes` and the authoritative requirements consumed by Tasks 2–6.

- [x] **Step 1: Scaffold the change and inspect artifact instructions**

```powershell
openspec.cmd new change "add-curated-alert-starter-themes"
openspec.cmd status --change "add-curated-alert-starter-themes" --json
openspec.cmd instructions proposal --change "add-curated-alert-starter-themes" --json
```

- [x] **Step 2: Write proposal, design, delta specification, and tasks in dependency order**

The artifacts must capture the approved catalog, exact colors/typography/normalized layouts, defaulting and preservation behavior, Add alert chooser, editor confirmation, ordinary-document materialization, test requirements, and explicit out-of-scope boundaries from Global Constraints.

- [x] **Step 3: Promote BL-006 only after the change is apply-ready**

Move BL-006 into `Planned Changes`, retain priority P1 and its existing dependency statement, and link `../openspec/changes/add-curated-alert-starter-themes/proposal.md`. Do not alter BL-039.

- [x] **Step 4: Strict-validate the change**

```powershell
openspec.cmd validate add-curated-alert-starter-themes --strict
```

Expected: validation succeeds with no errors.

- [x] **Step 5: Commit the planning artifacts**

```powershell
git add openspec/changes/add-curated-alert-starter-themes docs/backlog.md docs/superpowers/plans/2026-08-26-curated-alert-starter-themes.md
git commit -m "docs(alerts): plan curated starter themes"
```

### Task 2: Add the core theme catalog and pure materializer

**Files:**
- Create: `packages/core/src/management/alert-starter-themes.ts`
- Create: `packages/core/src/management/alert-starter-themes.test.ts`
- Modify: `packages/core/src/management/contracts.ts`
- Modify: `packages/core/src/management/contracts.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `AlertStarterThemeId`, `alertStarterThemeIdSchema`, `defaultAlertStarterThemeId`, `alertStarterThemes`, `materializeAlertStarterTheme(input)`, and `applyAlertStarterTheme(document, themeId)`.
- Produces: `AlertCreateRequestInput = z.input<typeof alertCreateInputSchema>` for caller/wire payloads, where `themeId` remains optional, and `AlertCreateInput = z.output<typeof alertCreateInputSchema>` for parsed internal input, where `themeId` is required after Clean Signal defaulting.

- [x] **Step 1: Write contract tests that fail because theme IDs and create-input defaulting do not exist**

```ts
expect(alertCreateInputSchema.parse({ eventType: "raid", name: "Raid" }).themeId)
  .toBe("clean-signal");
expect(() => alertCreateInputSchema.parse({
  eventType: "raid",
  name: "Raid",
  themeId: "unknown",
})).toThrow();
```

- [x] **Step 2: Run the focused contract test and verify RED**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/management/contracts.test.ts
```

Expected: failure because `themeId` and the exported catalog contract are absent.

- [x] **Step 3: Add the exact theme ID schema, default, summary type, and create-input field**

Use a Zod enum over the three literal IDs and apply the Clean Signal default during parsing. Export `AlertCreateRequestInput = z.input<typeof alertCreateInputSchema>` for wire/caller compatibility (`themeId?: AlertStarterThemeId`) and `AlertCreateInput = z.output<typeof alertCreateInputSchema>` only for parsed internal use (`themeId: AlertStarterThemeId`). Do not use the parsed type for a caller that may omit the field.

- [x] **Step 4: Write materialization and re-theme tests and verify RED**

Cover all canonical event types × three themes × two profiles, schema validity, in-bounds geometry, deterministic IDs/order, text/shape-only materialization, primary-message precedence, fallback message, audio/TTS preservation, visual replacement, disabled/review state, profile-availability preservation, and idempotency.

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/management/alert-starter-themes.test.ts
```

- [x] **Step 5: Implement the minimal catalog and pure functions**

Use deterministic IDs based on document ID, theme ID, and semantic role. Scale the approved normalized rectangles to the fixed profile dimensions with integer rounding. Define both target-profile layouts explicitly and validate the returned full document at the boundary.

- [x] **Step 6: Run focused core tests and typecheck the package**

```powershell
corepack.cmd pnpm exec vitest run packages/core/src/management/contracts.test.ts packages/core/src/management/alert-starter-themes.test.ts
corepack.cmd pnpm --filter @stream-jams/core typecheck
```

- [x] **Step 7: Commit the core catalog**

```powershell
git add packages/core/src
git commit -m "feat(alerts): add starter theme catalog"
```

### Task 3: Integrate themed documents with alert creation and defaults

**Files:**
- Modify: `apps/server/src/modules/alerts/alert-editor-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-editor-service.test.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.ts`
- Modify: `apps/server/src/modules/alerts/alert-set-management-service.test.ts`
- Modify: `apps/server/src/http/routes/management-ui.ts`
- Modify: `apps/server/src/http/routes/management-ui.test.ts`

**Interfaces:**
- Consumes: `AlertStarterThemeId`, `defaultAlertStarterThemeId`, `applyAlertStarterTheme`, and parsed `AlertCreateInput.themeId` from Task 2.
- Produces: `createAlertEditorDocumentFromRule(rule, revision, metadata, themeId?)`, defaulting to Clean Signal.
- Boundary: `apps/server/src/http/routes/management-ui.ts` parses unknown `request.body` with `alertCreateInputSchema`; its `input.data` is the required-theme `AlertCreateInput` passed to `ManagementUiService.createAlert`, then `AlertSetManagementService.createAlert`. Those service signatures use only parsed internal input. HTTP callers remain compatible because the route accepts the optional-theme schema input.

- [x] **Step 1: Add failing service tests**

Test explicit Bold Pop creation, omitted-theme Clean Signal creation, lazy document creation, starter/default reset behavior, and atomic rejection/no mutation for an invalid ID.

- [x] **Step 2: Run the focused server tests and verify RED**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/server/src/http/routes/management-ui.test.ts
```

- [x] **Step 3: Thread the theme through existing boundaries**

Add the optional helper parameter, create the compatibility document, then apply the selected/default theme. Keep `request.body` parsing in the HTTP route; pass the parsed required `themeId` through `ManagementUiService.createAlert` and the existing aggregate mutation, rather than re-parsing a wire-shaped value in services. Keep handlers thin and update invalid-input copy to mention supported starter themes without exposing internal IDs.

- [x] **Step 4: Re-run focused tests and server typecheck**

```powershell
corepack.cmd pnpm exec vitest run apps/server/src/modules/alerts/alert-editor-service.test.ts apps/server/src/modules/alerts/alert-set-management-service.test.ts apps/server/src/http/routes/management-ui.test.ts
corepack.cmd pnpm --filter @stream-jams/server typecheck
```

- [x] **Step 5: Commit server integration**

```powershell
git add apps/server/src
git commit -m "feat(alerts): create themed alert documents"
```

### Task 4: Build the reusable theme chooser and read-only previews

**Files:**
- Create: `apps/web/src/management/alerts/AlertThemeChooser.tsx`
- Create: `apps/web/src/management/alerts/AlertThemeChooser.test.tsx`
- Create: `apps/web/src/management/alerts/AlertThemeChooser.stories.tsx`
- Create: `apps/web/src/management/alerts/AlertThemePreview.tsx`
- Create: `apps/web/src/management/alerts/alert-theme-chooser.css`
- Create: `apps/web/src/management/alerts/editor/template-preview.ts`
- Create: `apps/web/src/management/alerts/editor/template-preview.test.ts`
- Modify: `apps/web/src/management/alerts/editor/AlertCanvas.tsx`

**Interfaces:**
- Consumes: core theme summaries/materializer, canonical event starter metadata, and the exported core `DefaultTemplateRenderer`.
- Produces: `AlertThemeChooser({ eventType, value, onChange, disabled? })` and shared `renderAlertTemplatePreview(template, sample)` that delegates to `new DefaultTemplateRenderer().render({ template, values: sample, escapeHtml: false })` for non-HTML preview text.

- [x] **Step 1: Write failing interpolation and chooser tests**

Verify accessible radiogroup/radios, exact three labels, controlled selection, disabled state, landscape and vertical previews per card, and resolved sample text rather than raw placeholders. Add interpolation coverage proving the helper delegates to `DefaultTemplateRenderer` with `escapeHtml: false` rather than implementing another placeholder formatter.

- [x] **Step 2: Run focused web tests and verify RED**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/template-preview.test.ts apps/web/src/management/alerts/AlertThemeChooser.test.tsx
```

- [x] **Step 3: Extract interpolation and implement the preview renderer**

Reuse `alertTextLayerStyle`, delegate placeholder resolution to the existing exported core `DefaultTemplateRenderer` with non-HTML output, and render catalog materialization read-only. Do not create another placeholder formatter, reuse interactive canvas pointer/selection behavior, or introduce asset APIs. Management chrome must use semantic design tokens; fixed theme colors are permitted only inside preview output.

- [x] **Step 4: Implement the controlled chooser and focused stories**

Stories cover a Raid chooser with Clean Signal selected, Bold Pop selected, Neon Terminal selected, and disabled controls. Use production components and typed event/sample data.

- [x] **Step 5: Run focused tests, web typecheck, and Storybook build**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/template-preview.test.ts apps/web/src/management/alerts/AlertThemeChooser.test.tsx
corepack.cmd pnpm --filter @stream-jams/web typecheck
corepack.cmd pnpm --filter @stream-jams/web build-storybook
```

- [x] **Step 6: Commit the chooser and previews**

```powershell
git add apps/web/src/management/alerts
git commit -m "feat(alerts): add starter theme chooser"
```

### Task 5: Integrate theme selection with Add alert and editor re-theming

**Files:**
- Modify: `apps/web/src/management/management-api.ts`
- Modify: `apps/web/src/management/management-api.test.ts`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.tsx`
- Modify: `apps/web/src/management/alerts/AlertSetsPage.test.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.tsx`
- Modify: `apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx`
- Modify: the existing management alert/editor stylesheet that owns dialog and inspector layout.

**Interfaces:**
- Consumes: `AlertThemeChooser`, `defaultAlertStarterThemeId`, `AlertStarterThemeId`, and `applyAlertStarterTheme`.
- Produces: creation requests that always send `themeId`; editor draft application through the existing document updater/history mechanism. `ManagementApi.createAlert` accepts `AlertCreateRequestInput` as the transport/caller type so legacy callers may omit the field, while `AlertSetsPage` always constructs and sends its selected `themeId`.

- [x] **Step 1: Write failing Add alert tests**

Verify Clean Signal starts selected, changing to Bold Pop updates the selection, submission sends `{ eventType, name, themeId: "bold-pop" }`, server errors preserve inputs, and reopening resets the default.

- [x] **Step 2: Write failing editor tests**

Verify opening/canceling the dialog is non-mutating; applying Neon Terminal requires the explicit button; custom Message/audio/TTS and behavior survive; visual media is removed; the alert becomes disabled; both profiles become `needs-review`; the editor becomes dirty; undo restores the prior draft; and the warning toast instructs review and save.

- [x] **Step 3: Run focused integration tests and verify RED**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/management-api.test.ts apps/web/src/management/alerts/AlertSetsPage.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
```

- [x] **Step 4: Implement Add alert theme state and payload**

Keep event and name behavior unchanged. Place the theme chooser after event selection, use the selected event sample, and restore Clean Signal whenever the dialog begins a fresh creation flow.

- [x] **Step 5: Implement editor application and confirmation**

Add `Apply starter theme` in the Alert inspector. The modal must name the replacement/preservation consequences and use `Apply theme` as its explicit action. Apply to the current draft through the existing updater so history and save/live-impact behavior remain intact. Use the shared warning toast after application.

- [x] **Step 6: Run focused tests and affected-package checks**

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/management-api.test.ts apps/web/src/management/alerts/AlertSetsPage.test.tsx apps/web/src/management/alerts/editor/AlertEditorPage.test.tsx
corepack.cmd pnpm --filter @stream-jams/web typecheck
corepack.cmd pnpm --filter @stream-jams/web build
```

- [x] **Step 7: Commit UI integration**

```powershell
git add apps/web/src
git commit -m "feat(alerts): select and apply starter themes"
```

### Task 6: Add end-to-end coverage and complete verification

**Files:**
- Modify: `tests/e2e/management-alerts.spec.ts`
- Modify: `openspec/changes/add-curated-alert-starter-themes/tasks.md`
- Modify: `docs/backlog.md` only after implementation and spec sync/archive rules permit removal.

**Interfaces:**
- Consumes: completed create and re-theme workflows from Tasks 2–5.

- [x] **Step 1: Write the failing Playwright scenarios**

Cover creating a Raid alert with Bold Pop and reviewing both previews, then applying Neon Terminal to an existing alert with custom message and TTS, saving, reloading, and verifying preserved nonvisual behavior plus reset review gates.

- [x] **Step 2: Run the focused Playwright file and verify the completed workflow**

```powershell
corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts
```

Expected: PASS. Production behavior is developed test-first in Tasks 2–5; this task adds browser-level acceptance coverage after those behaviors exist and must not manufacture an artificial failing state.

- [x] **Step 3: Mark OpenSpec tasks complete only after their evidence exists**

Run strict validation after checkbox updates. Do not archive, sync, remove BL-006, push, create a PR, or merge without the corresponding explicit workflow/approval.

- [x] **Step 4: Run final repository gates**

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm build
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
corepack.cmd pnpm test:e2e
openspec.cmd validate add-curated-alert-starter-themes --strict
openspec.cmd validate --all --strict --json
```

Run the full Vitest suite with a verbose reporter and allow its normal three-plus-minute collection/execution window to finish. If it genuinely fails or hangs beyond the repository's expected runtime, preserve the output and report the full-suite gap; do not describe focused passing tests as a full-suite pass.

- [x] **Step 5: Rebuild, restart, and live-check**

Wait for `/health`, then verify all three cards, landscape/vertical previews, one themed creation, one re-theme/save/reload, and one connected browser-source test playback. Shut down only the service instance started for this task.

- [x] **Step 6: Commit end-to-end coverage and task evidence**

```powershell
git add tests/e2e/management-alerts.spec.ts openspec/changes/add-curated-alert-starter-themes/tasks.md
git commit -m "test(alerts): cover starter theme workflows"
```
