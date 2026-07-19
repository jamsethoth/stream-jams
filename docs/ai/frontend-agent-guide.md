# Frontend Agent Guide

Use this guide for changes that touch `apps/web`, Storybook, browser-visible management UI, or browser-source overlays.

## Target

Stream Jams is a local-first streamer tool. The frontend has two distinct surfaces:

- Management UI: dense, quiet, operational controls for repeated setup and troubleshooting.
- Overlay UI: fullscreen transparent browser-source output that must not expose secrets or debug text on live routes.

Do not treat this as a marketing site. Build the actual management or overlay workflow first.

## Before Editing

1. Check the active OpenSpec change when one exists.
2. Read `docs/product-plan.md`, `docs/design/ui-refactor-mvp-ux-spec.md`, `docs/ui-guidelines.md`, `docs/design-tokens.md`, and this guide.
3. For management UI, overlay UI, integrations, assets, diagnostics, alert-module, or alert-editor changes, identify the applicable MVP UX spec sections and whether the requested behavior is MVP or backlog before editing.
4. For UI changes, inspect the current component and API boundaries before adding abstractions.
5. If `.codegraph/` is usable, sync and query it before broad text search. If CodeGraph reports no usable index, continue with normal tools.

## Implementation Rules

- Use real production components in stories and tests. Mock typed API boundaries, not rendered markup.
- Keep domain behavior out of React components. Matching, queueing, provider normalization, persistence, auth, and overlay composition belong in services/packages.
- Keep management and overlay auth separate. Never put secrets, OAuth tokens, overlay keys, signed URLs, or credential refs in Storybook args, client env, logs, screenshots, or docs examples.
- Use `import type` for type-only imports and keep relative TypeScript imports ESM-compatible.
- Preserve strict TypeScript. Do not weaken `strict`, `noUncheckedIndexedAccess`, or `exactOptionalPropertyTypes`.
- Prefer the existing CSS and component patterns before introducing a new UI dependency.
- Do not silently fail. User-visible failures need human-readable next steps and a log/reference ID when one is available.
- Keep live-runtime changes explicit, especially actions that affect active alert consumption, active alert sets, overlay routes, or provider selection.

## PR UX Contract

Every browser-visible PR must include a short UX note covering:

- Applicable sections reviewed from `docs/design/ui-refactor-mvp-ux-spec.md`.
- MVP/backlog boundary for the changed behavior.
- Failure, empty, loading, and success states touched by the change.
- Accessibility and keyboard behavior considered.
- Storybook and Playwright coverage added, updated, or explicitly skipped with reason.

## Storybook Rules

Storybook is the component workbench for `apps/web`.

- Add or update stories for new or changed production UI components.
- Cover the useful UI states: loaded, empty, loading, error, and success when the component has those states.
- Include representative management shell, form-heavy panels, list/table panels, and overlay render states.
- Use tiny checked-in assets under `apps/web/public/storybook-assets/` for media-backed stories.
- Name stories by the user or operator scenario they represent.
- Keep each story focused on one concept or state. Storybook's AI guidance says stories are useful to agents as usage examples when they explain when and why a pattern is used.

## Accessibility

- Storybook includes `@storybook/addon-a11y`; production stories default to automated axe checks.
- New controls need accessible names, stable focus behavior, and keyboard operation.
- Prefer role and label based testing selectors. Use test IDs only when user-facing selectors do not exist.
- Automated accessibility checks are a first pass, not a replacement for keyboard and screen-reader review.

## Overlay Error Rule

Production live overlays fail closed and transparent. Operators should see actionable diagnostics in `/manage`, logs, or diagnostic export. Visible overlay diagnostics are allowed only in Storybook, local development, or explicit test/debug routes.

See `docs/ai/overlay-error-presentation.md`.

## Required Commands

Run from the repo root unless a task says otherwise:

```sh
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
```

Run Playwright when browser-visible behavior changes beyond Storybook setup:

```sh
corepack.cmd pnpm test:e2e
```

Run the matching OpenSpec validation before completion:

```sh
openspec.cmd validate <change-name> --strict
```

## Current Gaps

- Storybook now provides a local component workbench and CI gate, but hosted visual approval is not selected.
- The Storybook test-runner is the default gate. The Storybook Vitest addon remains a backlog evaluation item until this baseline is stable.
- Local Playwright screenshots are the default visual-regression path for now. Hosted options are documented in `docs/ai/visual-regression-options.md`.

## Sources

- Storybook React/Vite docs: https://storybook.js.org/docs/get-started/frameworks/react-vite
- Storybook AI best practices: https://storybook.js.org/docs/ai/best-practices
- Storybook accessibility tests: https://storybook.js.org/docs/writing-tests/accessibility-testing
- Storybook test-runner: https://storybook.js.org/docs/writing-tests/integrations/test-runner
- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots
