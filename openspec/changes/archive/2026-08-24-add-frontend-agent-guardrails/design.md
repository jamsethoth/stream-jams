## Context

Stream Jams is a local-first TypeScript monorepo. The web app uses React, Vite, Testing Library, Vitest, and Playwright for two browser surfaces with different constraints:

- The management UI at `/manage` is an operational configuration and diagnostics tool.
- Browser-source overlays are full-screen transparent renderers that must remain readable and safe inside streaming software.

The repository already has strong stack guidance in `AGENTS.md`, but it does not yet give agents a frontend-specific design target, repeatable frontend skills, or an inspectable component/state catalog. As a result, agent-generated frontend work can satisfy TypeScript and unit tests while still missing the intended product feel, accessibility posture, responsive behavior, or overlay-specific rendering constraints.

Storybook is a good fit because Storybook's React/Vite framework supports isolated UI component development for React applications built with Vite, and its AI guidance treats stories as concrete examples agents can inspect before changing UI. Storybook's accessibility addon is built on axe-core and supports `parameters.a11y.test = "error"` so accessibility violations can fail local or CI test runs.

## Goals / Non-Goals

**Goals:**

- Add durable frontend guidance for agents that distinguishes management UI work from overlay UI work.
- Add repo-local Codex skills for frontend implementation and review workflows.
- Add Storybook to `apps/web` using the React/Vite framework.
- Add initial stories for representative management and overlay states.
- Add Storybook accessibility, build, and test-runner validation to the CI workflow as a required gate.
- Document visual regression options before adopting any hosted visual review service.
- Keep the implementation compatible with the existing pnpm workspace, strict TypeScript, React/Vite app, Vitest tests, and Playwright E2E flow.

**Non-Goals:**

- Do not adopt shadcn, Tailwind, Radix, or a new component library as part of this change.
- Do not redesign the management UI or overlay UI in this change.
- Do not replace existing Testing Library, Vitest, or Playwright tests with Storybook.
- Do not introduce hosted visual regression services as a required gate in this first pass.
- Do not require Figma unless a future design source is explicitly added.

## Decisions

### Decision: Use repo-local skills, not only `AGENTS.md`

`AGENTS.md` should stay concise and always loaded. Detailed workflows should live in repo-local skills under `.agents/skills` so Codex can load them only when the task matches frontend implementation or review work.

The skills should be minimal Markdown `SKILL.md` files only. Do not add `agents/openai.yaml` or another agent manifest in this change.

Alternatives considered:

- Put all frontend process detail in `AGENTS.md`: rejected because it would bloat always-on context.
- Rely on user prompts only: rejected because the same frontend constraints should apply across sessions and contributors.

### Decision: Add Storybook under `apps/web`

Storybook configuration, preview setup, and stories should live with the React/Vite app. Stories should import real components and mocked API clients instead of duplicating UI markup.

Alternatives considered:

- Add a root-level Storybook package: rejected because this repo has one browser app today and the stories are specific to `apps/web`.
- Use Playwright screenshots only: rejected because Playwright verifies pages and flows but does not provide an agent-readable component/state catalog.

### Decision: Start with representative stories, not every component

The initial Storybook scope should include enough examples to teach agents the UI system:

- Full management shell/navigation with mocked management, asset, and alert APIs.
- A form-heavy management panel.
- A table/list management panel.
- An empty/loading/error/success state.
- Overlay idle, text-only, media, and error-safe states.
- Overlay media states backed by tiny checked-in assets, not network media.

This avoids turning the first Storybook slice into a broad UI migration.

### Decision: Accessibility failures should be explicit

New stories should default to `parameters.a11y.test = "error"` once the first baseline is passing. If an existing component cannot be made to pass inside this change without broad redesign, that story may be marked `a11y: { test: "todo" }` with a documented reason and a follow-up task.

Alternatives considered:

- Manual-only accessibility review: rejected because it is not deterministic enough for agentic workflows.
- Block the entire change on all legacy accessibility fixes: rejected because this change is a guardrail foundation, not a redesign.

### Decision: Keep visual regression local-first

This change should add Storybook build, Storybook test-runner, and documented screenshot expectations for UI work. It should not require Chromatic, Argos, Percy, or another hosted visual regression service. A future change can add hosted visual review if desired.

The implementation documentation should compare:

- Local Playwright screenshots against a locally served Storybook.
- Chromatic.
- Argos.
- Percy or similar hosted screenshot tools.

### Decision: Use Storybook test-runner by default

Use Storybook build plus the Storybook test-runner with accessibility checks for the first CI gate. Add a backlog task to evaluate Storybook's Vitest addon because this project uses Vite, but do not adopt it in the first pass.

### Decision: Document tokens before extracting CSS variables

Start by documenting current colors, spacing, typography, radius, and overlay constraints in `docs/design-tokens.md`. Do not extract CSS custom properties in this change. Token extraction is useful, but it is a broader styling refactor that should follow a visible Storybook baseline.

## Risks / Trade-offs

- Storybook may add noticeable dependency weight and lockfile churn -> Keep packages scoped to `@stream-jams/web`, pin exact versions through pnpm, and avoid unrelated dependency upgrades.
- Storybook stories can drift from production behavior -> Stories must import real components and mocked API boundaries, not copy rendered markup.
- Accessibility checks may reveal existing issues -> Mark legacy issues as `todo` only when scoped follow-up is documented; new stories should fail on violations.
- Agents may overuse visually driven redesign workflows -> Repo guidance must distinguish normal incremental UI work from explicit redesign work.
- Overlay stories may accidentally normalize unsafe rendering -> Overlay stories must include transparent background, viewport sizing, text wrapping, and no-management-chrome expectations.
- Full-shell stories may require more complete API mocks -> Keep mocks typed, deterministic, and shared rather than adding per-story ad hoc objects.
- CI Storybook tests can be slower than build-only validation -> Use the initial CI gate for core stories, then tune coverage once baseline timing is known.

## Migration Plan

1. Add frontend guidance docs and repo-local skills.
2. Install and configure Storybook for `apps/web`.
3. Add representative stories with mocked data and accessible states.
4. Add Storybook scripts, CI validation, and a backlog item for the Vitest addon evaluation.
5. Update `AGENTS.md` so future UI work uses the new guidance, skills, and Storybook checks.
6. Validate with lint, typecheck, unit tests, Storybook build, Storybook tests, and Playwright where UI behavior changes.
