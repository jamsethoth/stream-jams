## 1. Planning and Baseline

- [x] 1.1 Fetch the latest `origin/main`, create a new implementation branch from it, and preserve unrelated local changes.
- [x] 1.2 Review `AGENTS.md`, `docs/product-plan.md`, `docs/mvp-runbook.md`, `apps/web/package.json`, and representative `apps/web/src` components before editing.
- [x] 1.3 Record the current frontend commands and any existing UI validation gaps in the implementation notes.

## 2. Frontend Agent Guidance

- [x] 2.1 Add `docs/ai/frontend-agent-guide.md` with management UI, overlay UI, Storybook, testing, and review workflow guidance.
- [x] 2.2 Add `docs/ui-guidelines.md` with concrete management and overlay design constraints.
- [x] 2.3 Add `docs/design-tokens.md` documenting current colors, spacing, typography, radius, overlay safe-area, and the impact/pros/cons of documenting current CSS versus extracting CSS custom properties.
- [x] 2.4 Add `docs/ai/visual-regression-options.md` comparing local Playwright screenshots against local Storybook, Chromatic, Argos, and Percy-style hosted tools with pros/cons.
- [x] 2.5 Add `docs/ai/overlay-error-presentation.md` explaining how transparent fail-closed, operator-only diagnostics, dev/test visible diagnostics, and live visible diagnostics present during a stream.
- [x] 2.6 Update `AGENTS.md` to reference the new frontend guidance and require Storybook consideration for UI changes.

## 3. Repo-Local Frontend Skills

- [x] 3.1 Add `.agents/skills/stream-jams-frontend-change/SKILL.md` for implementation tasks touching `apps/web`.
- [x] 3.2 Add `.agents/skills/stream-jams-frontend-review/SKILL.md` for UI review tasks touching `apps/web`.
- [x] 3.3 Verify the skill descriptions are specific enough for implicit Codex invocation and do not duplicate large documentation already in `docs/ai/`.

## 4. Storybook Setup

- [x] 4.1 Add Storybook React/Vite dependencies to `apps/web` using exact pnpm-managed versions.
- [x] 4.2 Add Storybook configuration under `apps/web/.storybook/`.
- [x] 4.3 Add `storybook`, `build-storybook`, `test-storybook`, and `test-storybook:ci` scripts to `apps/web/package.json`.
- [x] 4.4 Add root package scripts that run the `@stream-jams/web` Storybook commands from the workspace root.
- [x] 4.5 Configure Storybook accessibility validation so new production stories default to failing on accessibility violations.
- [x] 4.6 Add Storybook build and Storybook test-runner execution to `.github/workflows/ci.yml` as a required validation gate.
- [x] 4.7 Add a backlog item to evaluate Storybook's Vitest addon after the test-runner baseline is stable.

## 5. Story Data and Stories

- [x] 5.1 Add tiny checked-in Storybook assets under `apps/web/public/storybook-assets/`.
- [x] 5.2 Add shared Storybook mock data and mock API helpers for management, asset, and alert APIs.
- [x] 5.3 Add representative management stories for the full management shell, form-heavy panels, list/table panels, and empty/loading/error/success states.
- [x] 5.4 Add representative overlay stories for idle, text-only, media, and error-safe rendering states backed by fixed local assets where media is needed.
- [x] 5.5 Ensure stories import real production components and mocked boundaries instead of copying rendered markup.

## 6. Validation Workflow

- [x] 6.1 Update frontend documentation with required commands for lint, typecheck, unit tests, Storybook build/tests, and Playwright when UI behavior changes.
- [x] 6.2 Run `corepack.cmd pnpm lint`.
- [x] 6.3 Run `corepack.cmd pnpm typecheck`.
- [x] 6.4 Run `corepack.cmd pnpm test`.
- [x] 6.5 Run `corepack.cmd pnpm --filter @stream-jams/web build-storybook`.
- [x] 6.6 Run `corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci`.
- [x] 6.7 Run `corepack.cmd pnpm test:e2e` if the implementation changes browser-visible behavior beyond Storybook setup. Not required for this Storybook infrastructure slice.
- [x] 6.8 Run `openspec.cmd validate add-frontend-agent-guardrails --strict`.
- [x] 6.9 Confirm `git status --short` only includes intended artifacts and implementation files plus any pre-existing unrelated changes.
