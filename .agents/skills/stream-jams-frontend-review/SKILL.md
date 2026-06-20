---
name: stream-jams-frontend-review
description: Use when reviewing Stream Jams frontend changes in apps/web, Storybook stories, management UI, or overlay UI.
---

# Stream Jams Frontend Review

## Review Focus

Read the frontend guidance first:

- `docs/ai/frontend-agent-guide.md`
- `docs/ui-guidelines.md`
- `docs/design-tokens.md`
- `docs/ai/visual-regression-options.md`
- `docs/ai/overlay-error-presentation.md`

Prioritize findings in this order:

1. Live overlay leaks: visible debug output, secrets, route keys, internal errors, or non-transparent failure states.
2. Broken management workflows: missing loading/error/empty/success states, inaccessible controls, unclear operator diagnostics.
3. Contract drift: copied markup instead of production components, mocks that do not satisfy typed API boundaries, domain logic moved into React.
4. Missing Storybook coverage for changed UI states.
5. Missing validation: lint, typecheck, tests, Storybook build, Storybook test-runner, and Playwright when browser behavior changed.

## Output

Lead with actionable findings and file/line references. Keep summaries secondary.
