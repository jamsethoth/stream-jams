---
name: stream-jams-frontend-change
description: Use when implementing changes that touch Stream Jams apps/web, Storybook, browser-visible management UI, or browser-source overlay UI.
---

# Stream Jams Frontend Change

## Start

1. Load the active OpenSpec apply context when the work is attached to an OpenSpec change.
2. Read:
   - `docs/ai/frontend-agent-guide.md`
   - `docs/ui-guidelines.md`
   - `docs/design-tokens.md`
   - `docs/ai/overlay-error-presentation.md`
3. Inspect the real component and typed API boundary before editing.

## Build

- Use production components.
- Mock typed API clients and asset resolution boundaries.
- Add or update Storybook stories for changed UI states.
- Use tiny fixed assets from `apps/web/public/storybook-assets/` for media stories.
- Keep live overlay failures transparent and operator-diagnosed.

## Verify

Run the relevant commands before completion:

```sh
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
```

Run `corepack.cmd pnpm test:e2e` when browser-visible app behavior changes beyond Storybook setup.
