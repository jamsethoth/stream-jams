# Task 4 report — accessible chooser and read-only theme previews

## Scope and result

Implemented the reusable controlled starter-theme chooser, actual catalog-backed read-only landscape and vertical previews, shared template-preview interpolation, and focused Storybook states. Add alert and focused-editor theme application remain untouched for Task 5.

OpenSpec tasks 3.1–3.3 and Task 4 plan Steps 1–4 and 6 are complete. OpenSpec task 3.4 and Task 4 Step 5 remain intentionally unchecked because the package typecheck is blocked by two verified Task 5-owned create-request type errors described below.

## TDD evidence

### RED

Command:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/template-preview.test.ts apps/web/src/management/alerts/AlertThemeChooser.test.tsx --reporter=verbose
```

Result: expected failure, 2 failed suites and no tests collected. Vite could not resolve the not-yet-created `./template-preview.js` and `./AlertThemeChooser.js` modules.

### GREEN

Command:

```powershell
corepack.cmd pnpm exec vitest run apps/web/src/management/alerts/editor/template-preview.test.ts apps/web/src/management/alerts/AlertThemeChooser.test.tsx apps/web/src/management/alerts/editor/AlertCanvas.test.tsx --reporter=verbose
```

Result: PASS — 3 files, 12 tests, 0 failures. This includes nested/missing/object/unescaped interpolation, catalog order, native radio semantics, controlled selection, disabled controls, six profile surfaces, actual materialized shapes and text, all-event resolved sample text, existing AlertCanvas authoring interpolation, and the moderated-preview override.

### Review follow-up RED/GREEN

Review found that percentage geometry responded to wider cards while text and box styles retained a fixed scale, and that the preview used a block `div` within phrasing content. A focused chooser test run produced the intended RED result: 3 failures and 4 passes. The failures proved the roots were not `span` elements, no preview surface was observed, and no observer lifecycle existed.

After the focused fix, the chooser suite passed 7/7. The regression drives a real `ResizeObserver` boundary at 240px and 480px and verifies the materialized message font size doubles. It also verifies profile changes disconnect and replace the observer and unmount disconnects the replacement.

## Accessibility and rendering decisions

- The chooser exposes one `radiogroup` named `Starter theme` with three native radios in core catalog order. Each radio has the catalog label and description, controlled checked state, a native disabled state, and a token-based `:focus-visible` outline on its card.
- Each card contains phrasing-safe `span` preview roots exposed as atomic read-only images named with the theme and `Landscape 16:9` or `Vertical 9:16` profile. Preview layers have no focus target, pointer handler, selection state, asset API, or editor history behavior.
- `AlertThemePreview` calls core `materializeAlertStarterTheme`, uses its target-profile layouts as percentages, preserves `zIndex`, and renders only visible text and shape layers. A cleaned-up `ResizeObserver` derives the typography/box scale from actual surface width divided by the core profile width, so text and geometry respond together; a deterministic profile-sized fallback covers the first render and environments without the observer.
- Management chrome uses semantic `--color-*` tokens. Theme colors enter the web output only from the materialized layer values.
- A bounded `Record<StreamEventType, ...>` provides deterministic preview-only samples for every canonical event. The selected sample is converted with `createAlertTemplateContext`; Raid resolves to `Welcome raiders from StreamSpark!` with no raw placeholder.
- `renderAlertTemplatePreview` delegates directly to one `DefaultTemplateRenderer` instance with `{ template, values: sample, escapeHtml: false }`. Both the theme preview and AlertCanvas authoring display use it. Existing moderated server preview text still overrides local interpolation.

## Changed files

- `apps/web/src/management/alerts/AlertThemeChooser.tsx` — controlled accessible three-option chooser and typed canonical-event samples.
- `apps/web/src/management/alerts/AlertThemePreview.tsx` — display-only materialized profile renderer.
- `apps/web/src/management/alerts/alert-theme-chooser.css` — compact responsive token-based chooser and preview layout.
- `apps/web/src/management/alerts/AlertThemeChooser.test.tsx` — chooser, profile, materialization, sample, control, and disabled behavior.
- `apps/web/src/management/alerts/AlertThemeChooser.stories.tsx` — Raid/Clean, Raid/Bold, Raid/Neon, and disabled production-component stories.
- `apps/web/src/management/alerts/editor/template-preview.ts` and `.test.ts` — direct core renderer delegation and focused interpolation coverage.
- `apps/web/src/management/alerts/editor/AlertCanvas.tsx` — shared helper use; private formatter removed.
- OpenSpec tasks and implementation plan — only evidenced Task 4 checkboxes updated.

## Verification evidence

- `corepack.cmd pnpm --filter @stream-jams/core build` — PASS.
- Focused Vitest command above — PASS, 14/14 after the review regressions.
- Focused ESLint command from the Task 4 brief — PASS, no findings.
- `corepack.cmd pnpm --filter @stream-jams/web build-storybook` — PASS; 229 modules transformed and static Storybook output completed successfully.
- `corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci` — PASS; Chromium ran 15 story suites and 160 browser/accessibility tests, including `AlertThemeChooser.stories.tsx`.
- `corepack.cmd pnpm --filter @stream-jams/web typecheck` — BLOCKED only by `AlertSetsPage.tsx:335` and `management-api.test.ts:278`, whose calls omit `themeId` because the browser API still uses parsed `AlertCreateInput`. Task 5 explicitly owns changing that transport boundary to `AlertCreateRequestInput` and integrating Add alert. No Task 4 files remain in the error output.
- `openspec.cmd validate add-curated-alert-starter-themes --strict` — PASS; change is valid.
- `git -c safe.directory=C:/Users/James/.codex/worktrees/966c/stream-jams diff --check` — PASS; no whitespace errors.

## Self-review and concerns

- Re-read the Task 4 brief, OpenSpec requirements, catalog materializer, core renderer/context boundary, existing canvas tests, frontend UX guidance, CSS tokens, and Storybook conventions against the diff.
- Confirmed no server/core production, Add alert/editor application, persistence, routes, assets, dependencies, BL-039, archive, publishing, PR, or merge changes were introduced.
- The available Storybook Chromium/accessibility gate passed. No routed-app Playwright or live-app check was added because Task 4 creates a standalone Storybook-visible component but does not yet integrate it into a routed browser workflow; Task 5 and Task 6 own that workflow coverage.
- Remaining concern: the package typecheck cannot close until Task 5 repairs the create-request caller boundary. That dependency is recorded rather than hidden or repaired out of slice.
