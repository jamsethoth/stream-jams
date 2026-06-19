# Frontend Agent Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Codex-friendly frontend guardrails, repo-local frontend skills, and a Storybook workbench for the Stream Jams React/Vite management and overlay UI.

**Architecture:** Keep `AGENTS.md` concise and route detailed frontend workflow through docs and repo-local skills. Configure Storybook inside `apps/web` so stories import real production components with mocked API boundaries and tiny checked-in assets. Use Storybook as an agent-readable UI state catalog and CI gate, while retaining Vitest, Testing Library, and Playwright for existing verification roles. Document hosted visual-regression options, but keep the first implementation local-first.

**Tech Stack:** TypeScript, React 19, Vite 8, pnpm workspaces, Storybook React/Vite, Storybook a11y addon, Storybook test-runner, Vitest, Testing Library, Playwright, Codex repo-local skills.

---

## Source References

- OpenSpec change: `openspec/changes/add-frontend-agent-guardrails/`
- Storybook React/Vite docs: `https://storybook.js.org/docs/get-started/frameworks/react-vite`
- Storybook AI best practices: `https://storybook.js.org/docs/ai/best-practices`
- Storybook accessibility docs: `https://storybook.js.org/docs/writing-tests/accessibility-testing`
- Storybook test-runner docs: `https://storybook.js.org/docs/writing-tests/integrations/test-runner`
- Storybook Vitest addon docs: `https://storybook.js.org/docs/writing-tests/integrations/vitest-addon`
- Playwright visual comparison docs: `https://playwright.dev/docs/test-snapshots`
- Chromatic docs: `https://www.chromatic.com/docs/`
- Argos Playwright docs: `https://argos-ci.com/docs/playwright`
- Codex skills docs: `https://developers.openai.com/codex/skills`
- Codex AGENTS.md docs: `https://developers.openai.com/codex/guides/agents-md`

## Gap Decisions

1. CI gate: add Storybook build and Storybook test-runner to `.github/workflows/ci.yml`.
2. Storybook test default: use build plus test-runner now; add a backlog item to evaluate Storybook's Vitest addon.
3. Visual regression options: document local Playwright screenshots against local Storybook, Chromatic, Argos, and Percy-style hosted tools with impact, pros, and cons.
4. Assets: use tiny checked-in assets under `apps/web/public/storybook-assets/`.
5. Overlay error presentation: production uses transparent fail-closed overlay plus operator-only diagnostics; visible diagnostics are dev/test only.
6. Full shell: include `apps/web/src/management/ManagementApp.stories.tsx` with typed mocked APIs.
7. Tokens: document current CSS first; defer CSS custom property extraction and document impact, pros, and cons.
8. Skills: use minimal Markdown repo-local skills only; do not add `agents/openai.yaml` or another agent manifest in this change.
9. Branch: implement from a new branch created from latest `origin/main`.

## File Structure

- Modify: `AGENTS.md`
  - Add a short frontend agent workflow section that points to docs and skills.
- Create: `docs/ai/frontend-agent-guide.md`
  - Source of truth for frontend agent behavior, Storybook usage, verification, and review expectations.
- Create: `docs/ui-guidelines.md`
  - Human-readable design constraints for management UI and overlay UI.
- Create: `docs/design-tokens.md`
  - Current token inventory and token-strategy tradeoffs without introducing Tailwind, shadcn, or Radix.
- Create: `docs/ai/visual-regression-options.md`
  - Local and hosted visual regression options with pros/cons.
- Create: `docs/ai/overlay-error-presentation.md`
  - Overlay error presentation options and how each appears during a live stream.
- Create: `.agents/skills/stream-jams-frontend-change/SKILL.md`
  - Repo-local implementation workflow for tasks touching `apps/web`.
- Create: `.agents/skills/stream-jams-frontend-review/SKILL.md`
  - Repo-local review workflow for tasks touching `apps/web`.
- Modify: `package.json`
  - Add root Storybook scripts that delegate to `@stream-jams/web`.
- Modify: `apps/web/package.json`
  - Add Storybook dependencies and scripts, including a CI-safe test command.
- Modify: `.github/workflows/ci.yml`
  - Add Storybook build and test-runner commands as a validation gate.
- Create: `apps/web/.storybook/main.ts`
  - Storybook React/Vite configuration.
- Create: `apps/web/.storybook/preview.ts`
  - Global CSS import and a11y defaults.
- Create: `apps/web/.storybook/test-runner.ts`
  - Test-runner extension point.
- Create: `apps/web/src/stories/story-fixtures.ts`
  - Shared story data for management and overlay examples.
- Create: `apps/web/public/storybook-assets/tiny-alert.svg`
  - Tiny deterministic local asset for media stories.
- Create: `apps/web/src/management/ManagementApp.stories.tsx`
  - Full management shell story with mocked API clients.
- Create: `apps/web/src/management/navigation/ManagementNavigation.stories.tsx`
- Create: `apps/web/src/management/dashboard/DashboardPanel.stories.tsx`
- Create: `apps/web/src/management/settings/SettingsPanel.stories.tsx`
- Create: `apps/web/src/management/overlays/OverlayOutputsPanel.stories.tsx`
- Create: `apps/web/src/management/assets/AssetManager.stories.tsx`
- Create: `apps/web/src/overlay/components/OverlaySurface.stories.tsx`
- Modify: `.gitignore`
  - Add `storybook-static/`.
- Modify: `openspec/changes/add-frontend-agent-guardrails/tasks.md`
  - Mark tasks complete as implementation proceeds.

---

### Task 1: Baseline and Branch Hygiene

**Files:**
- Read: `openspec/changes/add-frontend-agent-guardrails/proposal.md`
- Read: `openspec/changes/add-frontend-agent-guardrails/design.md`
- Read: `openspec/changes/add-frontend-agent-guardrails/specs/frontend-agent-guardrails/spec.md`
- Read: `AGENTS.md`
- Read: `apps/web/package.json`
- Read: `package.json`
- Read: `.gitignore`

- [ ] **Step 1: Confirm worktree state**

Run:

```powershell
git -c safe.directory=C:/dev/projects/stream-jams status --short --branch
```

Expected: note any pre-existing unrelated changes. Do not modify or delete unrelated files.

- [ ] **Step 2: Update from remote main and create the implementation branch**

Run:

```powershell
git -c safe.directory=C:/dev/projects/stream-jams fetch origin main
git -c safe.directory=C:/dev/projects/stream-jams switch -c add-frontend-agent-guardrails origin/main
```

Expected: the implementation branch starts at the latest `origin/main`. If unrelated local changes are present, stash or move only with explicit user approval; otherwise preserve them in place and avoid touching those files.

- [ ] **Step 3: Confirm current OpenSpec task state**

Run:

```powershell
openspec.cmd status --change add-frontend-agent-guardrails
```

Expected: `proposal`, `design`, `specs`, and `tasks` are complete before implementation begins.

- [ ] **Step 4: Read implementation context**

Run:

```powershell
Get-Content openspec\changes\add-frontend-agent-guardrails\design.md
Get-Content openspec\changes\add-frontend-agent-guardrails\specs\frontend-agent-guardrails\spec.md
Get-Content AGENTS.md
Get-Content apps\web\package.json
Get-Content package.json
```

Expected: implementation follows the React/Vite/TypeScript stack and does not introduce Tailwind, shadcn, Radix, or a redesign.

---

### Task 2: Frontend Guidance Docs

**Files:**
- Create: `docs/ai/frontend-agent-guide.md`
- Create: `docs/ai/visual-regression-options.md`
- Create: `docs/ai/overlay-error-presentation.md`
- Create: `docs/ui-guidelines.md`
- Create: `docs/design-tokens.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Create `docs/ai/frontend-agent-guide.md`**

Create the file with this structure and content:

```markdown
# Frontend Agent Guide

## Purpose

This guide defines how agents should change Stream Jams frontend code in `apps/web`.

## Surfaces

### Management UI

- Treat `/manage` as an operational local tool for repeated streamer setup and troubleshooting.
- Prefer dense, scannable layouts: navigation tabs, forms, tables, lists, compact status panels, and clear diagnostics.
- Do not add marketing heroes, decorative feature cards, oversized editorial copy, or generic SaaS landing-page patterns.
- Keep domain logic outside React components. Components orchestrate UI state and call typed API boundaries.

### Browser-Source Overlay

- Treat overlay routes as stream output surfaces, not management pages.
- Preserve transparent full-viewport rendering, readable text, stable absolute layout, and safe wrapping.
- Do not render management controls, debug chrome, secrets, overlay keys, or configuration UI in overlays.
- Verify overlay changes at a browser viewport that represents a stream canvas.

## Storybook Workflow

- Before changing a component, inspect existing stories for the target surface.
- When adding a component or meaningful state, add or update a Storybook story.
- Stories must import real production components and provide mocked API boundaries.
- Stories must not copy rendered markup from production components.
- New production stories participate in accessibility validation unless a documented exclusion exists.
- Full management-shell stories must use mocked APIs, not the production server.
- Overlay media stories must use tiny checked-in assets from `apps/web/public/storybook-assets/`.

## Testing Workflow

- For component behavior, use Vitest and Testing Library.
- For browser-visible workflows, use Playwright.
- For component/state examples and accessibility checks, use Storybook.
- CI runs Storybook build and Storybook test-runner as a gate.
- For visual changes, capture rendered browser evidence before claiming completion.
- For visual regression strategy choices, use `docs/ai/visual-regression-options.md`.
- For overlay error presentation choices, use `docs/ai/overlay-error-presentation.md`.

## Review Checklist

- Management UI remains operational, dense, and scannable.
- Overlay UI remains transparent, full-viewport, and stream-safe.
- Text does not overlap, clip, or become unreadable at supported viewports.
- Controls have accessible names and keyboard-visible behavior.
- No secrets, route keys, auth headers, OAuth tokens, or signed URLs appear in UI copy, logs, stories, or screenshots.
- Relevant unit tests, Storybook stories, and Playwright tests are added or updated.
```

- [ ] **Step 2: Create `docs/ui-guidelines.md`**

Create the file with these sections:

```markdown
# UI Guidelines

## Management UI

The management UI is a local operations console. It should feel quiet, utilitarian, and work-focused.

Use:

- Compact tabs and panels.
- Tables and lists for comparable data.
- Forms for configuration.
- Inline diagnostics for actionable state.
- Clear empty, loading, success, and error states.

Avoid:

- Marketing-page composition.
- Decorative dashboards that hide task state.
- Nested cards.
- Large rounded promotional panels.
- One-off colors or spacing not reflected in `docs/design-tokens.md`.

## Overlay UI

The overlay UI is a browser-source output surface.

Use:

- Transparent background.
- Full viewport sizing.
- High-contrast text with shadow where needed.
- Stable absolute positioning from normalized playback instructions.
- Text wrapping that preserves readability.

Avoid:

- Management controls.
- Debug labels.
- Visible route keys or secret-bearing URLs.
- Scroll-dependent content.
- Layouts that assume a normal document flow.

## Responsive Rules

- Management UI must remain usable below `760px` width.
- Tables may scroll horizontally when the data is inherently tabular.
- Buttons and form controls must keep readable labels.
- Overlay content must fit the intended stream canvas without body scroll.
```

- [ ] **Step 3: Create `docs/design-tokens.md`**

Create the file with these current-token values from `apps/web/src/App.css`:

```markdown
# Design Tokens

## Current Palette

- Page background: `#f7f8fa`
- Surface: `#ffffff`
- Primary text: `#20242c`
- Muted text: `#5f6673`
- Secondary text: `#4a5361`
- Field label: `#3d4654`
- Border: `#d9dee8`
- Subtle border: `#e4e8ef`
- Input border: `#c8ced8`
- Primary action: `#166c5f`
- Disabled action: `#a7b2bd`
- Success/diagnostic background: `#eef7f3`
- Success/diagnostic border: `#cde6dc`
- Success/diagnostic text: `#24564d`
- Overlay text: `#ffffff`
- Overlay shadow: `rgba(0, 0, 0, 0.72)`

## Typography

- Font stack: `Inter`, `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `sans-serif`
- Management page heading: `28px`, line height `1.2`
- Panel heading: `22px`, line height `1.25`
- Subheading: `16px`, line height `1.25`
- Table text: `14px`
- Table heading: `13px`, uppercase
- Overlay text: `32px`, weight `800`, line height `1.15`

## Layout

- App shell padding: `32px`, mobile `16px`
- Main content width: `1120px`
- Panel radius: `8px`
- Control radius: `6px`
- Primary row gap: `16px`
- Panel gap: `20px`

## Strategy Options

### Document current CSS first

Impact: adds a stable design reference without changing runtime styling.

Pros:

- Lowest implementation risk.
- No visual regressions from variable extraction.
- Gives agents a shared vocabulary immediately.

Cons:

- Guidance is advisory until code uses tokens directly.
- Drift is still possible if reviewers do not enforce it.

### Extract CSS custom properties

Impact: converts repeated colors, spacing, radius, and typography values into reusable CSS variables.

Pros:

- Stronger consistency and easier future theming.
- Makes design intent visible in code.
- Reduces duplicated literal values over time.

Cons:

- Larger styling diff with higher regression risk.
- Requires careful visual review across management and overlay surfaces.
- Can mix guardrail setup with a refactor unless handled as a follow-up change.

Default for this change: document current CSS first. Add CSS custom property extraction only in a later scoped change after Storybook establishes baseline coverage.

## Rules

- Do not introduce raw colors that duplicate these roles.
- Do not introduce a new styling framework in this change.
- Add new tokens here before using them broadly in UI code.
```

- [ ] **Step 4: Create `docs/ai/visual-regression-options.md`**

Create the file:

```markdown
# Visual Regression Options

## Default For Now

Use local Storybook plus local Playwright screenshots when a visual diff needs screenshot evidence. Do not add a hosted visual regression gate in this change.

## Local Playwright Screenshots Against Local Storybook

Impact: runs screenshot assertions against stories served locally or in CI.

Pros:

- No hosted service or account required.
- Keeps screenshots and baselines under repository control.
- Fits the existing Playwright dependency.
- Good for deterministic stream-overlay states.

Cons:

- Baselines are sensitive to OS, browser, font, and rendering differences.
- Requires committed snapshots or artifact handling.
- Review UI is weaker than hosted tools.
- CI must run in a consistent environment.

## Chromatic

Impact: uploads Storybook builds to a hosted visual review service.

Pros:

- Purpose-built Storybook visual review.
- Good PR review workflow for component states.
- Cloud browsers reduce local rendering drift.
- Includes review and approval workflows.

Cons:

- Hosted service dependency and possible cost.
- Requires project/account setup.
- Screenshots leave the local repository environment.
- Needs policy decisions for public/private build visibility.

## Argos

Impact: uploads Playwright or Storybook screenshots to hosted visual comparison.

Pros:

- Works well with Playwright.
- Avoids committing screenshot baselines.
- Provides hosted diff review and CI integration.

Cons:

- Hosted service dependency and possible cost.
- Requires CI token and project setup.
- Needs screenshot stabilization discipline.
- Some advanced features may be billable.

## Percy Or Similar Hosted Screenshot Tools

Impact: adds a general hosted screenshot-diff service.

Pros:

- Mature PR visual review workflow.
- Cross-browser options depending on plan.
- Can cover app routes as well as components.

Cons:

- Hosted dependency, token management, and cost.
- Less Storybook-native than Chromatic.
- Adds another vendor-specific CI integration.

## Recommendation

Start local-first. Revisit hosted tooling after Storybook has stable, valuable stories and the team knows whether PR review UX, cross-browser coverage, or avoiding committed snapshots is the main pain point.
```

- [ ] **Step 5: Create `docs/ai/overlay-error-presentation.md`**

Create the file:

```markdown
# Overlay Error Presentation

## Default For Live Streams

Use transparent fail-closed rendering for the live overlay, plus operator-facing diagnostics in management UI or logs. Visible overlay diagnostics are allowed only in dev/test stories unless a separate approved change opts into live diagnostics.

## Transparent Fail-Closed

Live-stream presentation: the browser source shows nothing for the failed alert state. Viewers see the stream continue without an error banner or broken UI.

Pros:

- Most professional live failure mode.
- Avoids exposing internals, route keys, filenames, or stack details.
- Prevents broken overlay chrome from covering gameplay or camera.

Cons:

- The streamer may not notice the failed alert immediately.
- Requires separate operator diagnostics to make failures actionable.

## Operator-Only Diagnostics

Live-stream presentation: viewers still see no overlay error; the management UI shows the problem in an alert queue, status panel, or diagnostics area.

Pros:

- Best default pairing with transparent fail-closed.
- Actionable for the operator without leaking to viewers.
- Keeps stream output clean.

Cons:

- Requires the operator to monitor the management UI.
- Not useful if management UI is closed during the stream.

## Dev/Test Visible Diagnostics

Live-stream presentation: should not appear on the live route. In Storybook, local dev, or test-only routes, a small diagnostic can show the failed state.

Pros:

- Makes failure states inspectable for agents and developers.
- Helps screenshot and accessibility checks cover error states.
- Does not affect the production stream route.

Cons:

- Requires strict route/build gating so diagnostics cannot leak into live overlay.

## Live Visible Diagnostics

Live-stream presentation: viewers see a small visible error message or fallback marker on the overlay.

Pros:

- Failure is immediately obvious to the streamer and moderators.
- Can help during setup or rehearsals.

Cons:

- Looks unprofessional during a real broadcast.
- Can cover important stream content.
- Risks exposing implementation details if copy is not tightly controlled.

## Recommendation

Use transparent fail-closed plus operator-only diagnostics for production. Keep visible diagnostics for Storybook, tests, and local development.
```

- [ ] **Step 6: Update `AGENTS.md`**

Add this concise section near the existing frontend guidance:

```markdown
## Frontend Agent Workflow

- For changes under `apps/web`, read `docs/ai/frontend-agent-guide.md`, `docs/ui-guidelines.md`, and `docs/design-tokens.md` before editing UI.
- Use `docs/ai/visual-regression-options.md` before adding visual regression tooling.
- Use `docs/ai/overlay-error-presentation.md` before changing overlay error visibility.
- Use `.agents/skills/stream-jams-frontend-change` for implementation tasks that touch frontend behavior or presentation.
- Use `.agents/skills/stream-jams-frontend-review` when reviewing frontend diffs.
- Check existing Storybook stories before changing a component, and add or update stories for new components or meaningful states.
- Keep management UI operational and dense; keep overlay UI transparent, full-viewport, and free of management chrome.
- Do not add shadcn, Tailwind, Radix, or a new component library unless a separate approved change adopts that design system.
```

- [ ] **Step 7: Mark OpenSpec guidance tasks**

Edit `openspec/changes/add-frontend-agent-guardrails/tasks.md` and mark tasks `2.1` through `2.6` complete after the files are created and reviewed.

---

### Task 3: Repo-Local Frontend Skills

**Files:**
- Create: `.agents/skills/stream-jams-frontend-change/SKILL.md`
- Create: `.agents/skills/stream-jams-frontend-review/SKILL.md`
- Modify: `openspec/changes/add-frontend-agent-guardrails/tasks.md`

- [ ] **Step 1: Create frontend implementation skill**

Create `.agents/skills/stream-jams-frontend-change/SKILL.md`:

```markdown
---
name: stream-jams-frontend-change
description: Use when implementing or modifying Stream Jams frontend code under apps/web, including management UI, browser-source overlay UI, Storybook stories, React components, frontend tests, or UI CSS.
---

# Stream Jams Frontend Change

Follow this workflow for implementation tasks touching `apps/web`.

1. Read the relevant OpenSpec change, `AGENTS.md`, `docs/ai/frontend-agent-guide.md`, `docs/ui-guidelines.md`, `docs/design-tokens.md`, `docs/ai/visual-regression-options.md`, and `docs/ai/overlay-error-presentation.md`.
2. Identify the target surface: management UI or browser-source overlay.
3. Inspect existing components and tests before editing.
4. Inspect existing Storybook stories for the target component or nearby surface.
5. Keep React components pure during render and keep domain logic outside React components.
6. Use existing CSS classes and token roles before adding new styling.
7. Add or update Storybook stories for new components or meaningful states.
8. Add or update Vitest and Testing Library tests for component behavior.
9. Add or update Playwright tests when browser-visible workflows change.
10. For visual changes, run rendered browser verification and capture screenshot evidence.

Management UI constraints:

- Keep the UI dense, operational, and configuration-oriented.
- Prefer tables, lists, forms, tabs, and inline diagnostics.
- Avoid marketing sections, decorative card grids, and oversized hero layouts.

Overlay UI constraints:

- Preserve transparent full-viewport rendering.
- Do not add management controls or debug chrome.
- Verify text wrapping, viewport fit, media layout, and readable contrast.

Validation commands from the repo root:

```powershell
corepack.cmd pnpm lint
corepack.cmd pnpm typecheck
corepack.cmd pnpm test
corepack.cmd pnpm --filter @stream-jams/web build-storybook
corepack.cmd pnpm test:e2e
```
```

- [ ] **Step 2: Create frontend review skill**

Create `.agents/skills/stream-jams-frontend-review/SKILL.md`:

```markdown
---
name: stream-jams-frontend-review
description: Use when reviewing Stream Jams frontend changes under apps/web for UI quality, accessibility, Storybook coverage, React correctness, browser behavior, or management-vs-overlay design fit.
---

# Stream Jams Frontend Review

Review frontend changes as a code and product-surface reviewer.

Lead with findings. For each finding, include the file, line, user-visible impact, and suggested fix.

Check these areas:

1. React correctness
   - Hooks follow React rules.
   - Render remains pure.
   - Effects are not used for derived render state.
   - Async effects handle unmount/cancellation where needed.

2. Management UI fit
   - Operational density is preserved.
   - Controls, forms, tables, and lists remain scannable.
   - Empty, loading, success, and error states are clear.

3. Overlay UI fit
   - Transparent full-viewport behavior is preserved.
   - Overlay text remains readable and wraps safely.
   - No management chrome, route keys, secrets, or debug UI appear.

4. Accessibility
   - Interactive controls have accessible names.
   - Form controls have labels.
   - Keyboard interaction is not broken.
   - Storybook a11y exclusions are documented.

5. Storybook and tests
   - New or changed UI states have stories.
   - Component behavior has Vitest/Testing Library coverage.
   - Browser workflows have Playwright coverage when needed.

6. Security
   - No OAuth tokens, overlay keys, auth headers, signed URLs, or secret values appear in UI output, logs, stories, screenshots, or test fixtures.

If no issues are found, say that clearly and list any remaining unverified checks.
```

- [ ] **Step 3: Verify skill discovery shape**

Run:

```powershell
Get-Content .agents\skills\stream-jams-frontend-change\SKILL.md
Get-Content .agents\skills\stream-jams-frontend-review\SKILL.md
```

Expected: both files have frontmatter with `name` and `description`; descriptions mention `apps/web` and frontend work.

- [ ] **Step 4: Mark OpenSpec skill tasks**

Edit `openspec/changes/add-frontend-agent-guardrails/tasks.md` and mark tasks `3.1`, `3.2`, and `3.3` complete.

---

### Task 4: Storybook Dependencies and Configuration

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Create: `apps/web/.storybook/main.ts`
- Create: `apps/web/.storybook/preview.ts`
- Create: `apps/web/.storybook/test-runner.ts`
- Modify: `.gitignore`
- Modify: `docs/future-features.md`
- Modify: `openspec/changes/add-frontend-agent-guardrails/tasks.md`

- [ ] **Step 1: Add Storybook dependencies**

Run from repo root:

```powershell
corepack.cmd pnpm --filter @stream-jams/web add -D -E storybook@latest @storybook/react-vite@latest @storybook/addon-a11y@latest @storybook/test-runner@latest start-server-and-test@latest
```

Expected: `apps/web/package.json` gains exact dev dependency versions and `pnpm-lock.yaml` updates.

- [ ] **Step 2: Add web package Storybook scripts**

Modify `apps/web/package.json` scripts to include:

```json
{
  "storybook": "storybook dev --host 127.0.0.1 --port 6006",
  "build-storybook": "storybook build",
  "test-storybook": "test-storybook --url http://127.0.0.1:6006 --failOnConsole",
  "test-storybook:ci": "start-server-and-test \"storybook dev --host 127.0.0.1 --port 6006 --ci\" http://127.0.0.1:6006 \"test-storybook --url http://127.0.0.1:6006 --failOnConsole\""
}
```

Keep existing `dev`, `build`, and `typecheck` scripts.

- [ ] **Step 3: Add root Storybook scripts**

Modify root `package.json` scripts to include:

```json
{
  "storybook": "pnpm --filter @stream-jams/web storybook",
  "build-storybook": "pnpm --filter @stream-jams/web build-storybook",
  "test:storybook": "pnpm --filter @stream-jams/web test-storybook",
  "test:storybook:ci": "pnpm --filter @stream-jams/web test-storybook:ci"
}
```

Keep existing `dev`, `build`, `test`, `test:unit`, `test:e2e`, `lint`, and `typecheck` scripts.

- [ ] **Step 4: Create Storybook main config**

Create `apps/web/.storybook/main.ts`:

```ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.mdx", "../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  staticDirs: ["../public"],
  framework: {
    name: "@storybook/react-vite",
    options: {}
  },
  docs: {
    autodocs: "tag"
  }
};

export default config;
```

- [ ] **Step 5: Create Storybook preview config**

Create `apps/web/.storybook/preview.ts`:

```ts
import type { Preview } from "@storybook/react-vite";
import "../src/App.css";

const preview: Preview = {
  parameters: {
    a11y: {
      test: "error"
    },
    layout: "fullscreen"
  }
};

export default preview;
```

- [ ] **Step 6: Create Storybook test-runner config**

Create `apps/web/.storybook/test-runner.ts`:

```ts
import type { TestRunnerConfig } from "@storybook/test-runner";

const config: TestRunnerConfig = {};

export default config;
```

- [ ] **Step 7: Add Storybook to CI**

Modify `.github/workflows/ci.yml` in the existing validation job after Playwright browser installation and before or near the existing E2E step:

```yaml
      - name: Build Storybook
        run: pnpm --filter @stream-jams/web build-storybook

      - name: Test Storybook
        run: pnpm --filter @stream-jams/web test-storybook:ci
```

Expected: Storybook build and Storybook test-runner failures fail the CI validation job.

- [ ] **Step 8: Add Vitest addon backlog item**

Append a backlog item to `docs/future-features.md`:

```markdown
## Evaluate Storybook Vitest Addon

- Context: The initial Storybook CI gate uses Storybook build plus the Storybook test-runner.
- Evaluate: Whether Storybook's Vitest addon should replace or supplement the test-runner for this Vite-powered app.
- Decision inputs: CI runtime, a11y coverage, story interaction coverage, maintenance cost, and compatibility with existing Vitest configuration.
```

- [ ] **Step 9: Ignore Storybook static output**

Append this line to `.gitignore`:

```gitignore
storybook-static/
```

- [ ] **Step 10: Verify JSON syntax**

Run:

```powershell
node -e "JSON.parse(require('node:fs').readFileSync('package.json','utf8')); JSON.parse(require('node:fs').readFileSync('apps/web/package.json','utf8')); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 11: Mark OpenSpec Storybook setup tasks**

Edit `openspec/changes/add-frontend-agent-guardrails/tasks.md` and mark tasks `4.1` through `4.7` complete.

---

### Task 5: Story Fixtures and Initial Stories

**Files:**
- Create: `apps/web/public/storybook-assets/tiny-alert.svg`
- Create: `apps/web/src/stories/story-fixtures.ts`
- Create: `apps/web/src/stories/mock-apis.ts`
- Create: `apps/web/src/management/ManagementApp.stories.tsx`
- Create: `apps/web/src/management/navigation/ManagementNavigation.stories.tsx`
- Create: `apps/web/src/management/dashboard/DashboardPanel.stories.tsx`
- Create: `apps/web/src/management/settings/SettingsPanel.stories.tsx`
- Create: `apps/web/src/management/overlays/OverlayOutputsPanel.stories.tsx`
- Create: `apps/web/src/management/assets/AssetManager.stories.tsx`
- Create: `apps/web/src/overlay/components/OverlaySurface.stories.tsx`
- Modify: `openspec/changes/add-frontend-agent-guardrails/tasks.md`

- [ ] **Step 1: Create fixed Storybook assets**

Create `apps/web/public/storybook-assets/tiny-alert.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" role="img" aria-labelledby="title desc">
  <title id="title">Storybook alert preview</title>
  <desc id="desc">A fixed local placeholder image for overlay media stories.</desc>
  <rect width="320" height="180" rx="8" fill="#166c5f"/>
  <rect x="16" y="16" width="288" height="148" rx="6" fill="#ffffff" opacity="0.14"/>
  <text x="160" y="88" fill="#ffffff" font-family="Arial, sans-serif" font-size="28" font-weight="700" text-anchor="middle">ALERT</text>
  <text x="160" y="122" fill="#ffffff" font-family="Arial, sans-serif" font-size="16" text-anchor="middle">fixed story asset</text>
</svg>
```

Expected: media stories never fetch network assets and always render the same tiny checked-in image.

- [ ] **Step 2: Create shared story fixtures**

Create `apps/web/src/stories/story-fixtures.ts`:

```ts
import type { OverlayComposition, OverlayInstruction } from "@stream-jams/core";
import type { AssetRecord } from "../management/assets/asset-api.js";
import type {
  DashboardSummary,
  ModerationSettingsView,
  OverlayClientView,
  OverlayOutputUrl,
  ServerConfigView
} from "../management/management-api.js";

export const dashboardSummary: DashboardSummary = {
  twitch: {
    connected: false,
    label: "Twitch disconnected"
  },
  overlay: {
    connectedClientCount: 2,
    label: "2 overlay clients"
  },
  queue: {
    label: "Queue paused",
    queuedCount: 3
  },
  recentErrors: ["Last provider request failed"]
};

export const serverConfig: ServerConfigView = {
  host: "127.0.0.1",
  port: 39187
};

export const moderationSettings: ModerationSettingsView = {
  renderedText: {
    maxLength: 240,
    blockedTerms: ["spoiler"],
    stripUrls: false
  },
  ttsText: {
    maxLength: 180,
    blockedTerms: ["spoiler"],
    stripUrls: true
  }
};

export const overlayOutputs: readonly OverlayOutputUrl[] = [
  {
    id: "alerts-test",
    label: "Alerts test",
    purpose: "test",
    scope: "module",
    moduleId: "alerts",
    url: "http://127.0.0.1:39187/overlay/modules/alerts/test/ovl_example_test"
  },
  {
    id: "unified-live",
    label: "Unified live",
    purpose: "live",
    scope: "unified",
    moduleId: null,
    url: "http://127.0.0.1:39187/overlay/unified/live/ovl_example_live"
  }
];

export const overlayClients: readonly OverlayClientView[] = [
  {
    id: "client-live",
    purpose: "live",
    scope: "module",
    moduleId: "alerts"
  }
];

export const assetRecords: readonly AssetRecord[] = [
  {
    id: "asset-image",
    originalFileName: "tiny-alert.svg",
    mediaType: "image",
    mimeType: "image/svg+xml",
    sizeBytes: 640,
    checksum: "sha256:example-image",
    storagePath: "storybook-assets/tiny-alert.svg"
  }
];

export function createOverlayComposition(
  instructions: readonly OverlayInstruction[] = [createOverlayInstruction("text-instruction")]
): OverlayComposition {
  return {
    overlayId: "default",
    purpose: "test",
    scope: "module",
    modules: [
      {
        moduleId: "alerts",
        enabled: true,
        instructions
      }
    ]
  };
}

export function createOverlayInstruction(id: string): OverlayInstruction {
  return {
    id,
    overlayId: "default",
    moduleId: "alerts",
    purpose: "test",
    scope: "module",
    durationMs: 5_000,
    visual: {
      assetId: "asset-image",
      mediaType: "image",
      layout: {
        x: 420,
        y: 220,
        width: 360,
        height: 180,
        zIndex: 5
      }
    },
    audio: null,
    text: {
      text: "Thanks for following",
      layout: {
        x: 420,
        y: 420,
        width: 520,
        height: 96,
        zIndex: 6
      }
    },
    tts: null
  };
}
```

- [ ] **Step 3: Create full management-shell story**

Create `apps/web/src/stories/mock-apis.ts` with typed deterministic mocks for `ManagementApi`, `AssetApi`, and `AlertConfigurationApi`. Derive the method list and return shapes from `apps/web/src/management/ManagementApp.test.tsx`, but do not import Vitest mocks into Storybook. Use plain async functions so Storybook remains runtime-light.

Create `apps/web/src/management/ManagementApp.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createStoryAlertApi, createStoryAssetApi, createStoryManagementApi } from "../stories/mock-apis.js";
import { ManagementApp } from "./ManagementApp.js";

const meta = {
  component: ManagementApp,
  title: "Management/App Shell",
  args: {
    alertApi: createStoryAlertApi(),
    assetApi: createStoryAssetApi(),
    managementApi: createStoryManagementApi()
  },
  parameters: {
    layout: "fullscreen"
  }
} satisfies Meta<typeof ManagementApp>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {};
```

Expected: agents can inspect the complete `/manage` shell and navigation frame without starting the production Fastify server.

- [ ] **Step 4: Add navigation stories**

Create `apps/web/src/management/navigation/ManagementNavigation.stories.tsx`:

```tsx
import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ManagementNavigation, type ManagementTabId } from "./ManagementNavigation.js";

const meta = {
  component: ManagementNavigation,
  title: "Management/Navigation"
} satisfies Meta<typeof ManagementNavigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DashboardSelected: Story = {
  render() {
    const [activeTab, setActiveTab] = useState<ManagementTabId>("dashboard");
    return <ManagementNavigation activeTab={activeTab} onSelect={setActiveTab} />;
  }
};
```

- [ ] **Step 5: Add dashboard stories**

Create `apps/web/src/management/dashboard/DashboardPanel.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { dashboardSummary } from "../../stories/story-fixtures.js";
import { DashboardPanel, type DashboardPanelProps } from "./DashboardPanel.js";

const loadedApi = {
  getDashboard: async () => dashboardSummary
} satisfies DashboardPanelProps["managementApi"];

const failingApi = {
  getDashboard: async () => {
    throw new Error("Unable to load dashboard.");
  }
} satisfies DashboardPanelProps["managementApi"];

const meta = {
  component: DashboardPanel,
  title: "Management/Dashboard"
} satisfies Meta<typeof DashboardPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  args: {
    managementApi: loadedApi
  }
};

export const ErrorState: Story = {
  args: {
    managementApi: failingApi
  }
};
```

- [ ] **Step 6: Add settings stories**

Create `apps/web/src/management/settings/SettingsPanel.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { moderationSettings, serverConfig } from "../../stories/story-fixtures.js";
import { SettingsPanel, type SettingsPanelProps } from "./SettingsPanel.js";

const settingsApi = {
  getServerConfig: async () => serverConfig,
  updateServerConfig: async (input) => input,
  getModerationSettings: async () => moderationSettings,
  updateModerationSettings: async (input) => input
} satisfies SettingsPanelProps["managementApi"];

const meta = {
  component: SettingsPanel,
  title: "Management/Settings"
} satisfies Meta<typeof SettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  args: {
    managementApi: settingsApi
  }
};
```

- [ ] **Step 7: Add overlay output stories**

Create `apps/web/src/management/overlays/OverlayOutputsPanel.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { overlayClients, overlayOutputs } from "../../stories/story-fixtures.js";
import { OverlayOutputsPanel, type OverlayOutputsPanelProps } from "./OverlayOutputsPanel.js";

const loadedApi = {
  listOverlayOutputs: async () => overlayOutputs,
  listOverlayClients: async () => overlayClients
} satisfies OverlayOutputsPanelProps["managementApi"];

const emptyApi = {
  listOverlayOutputs: async () => [],
  listOverlayClients: async () => []
} satisfies OverlayOutputsPanelProps["managementApi"];

const meta = {
  component: OverlayOutputsPanel,
  title: "Management/Overlay Outputs"
} satisfies Meta<typeof OverlayOutputsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  args: {
    managementApi: loadedApi
  }
};

export const Empty: Story = {
  args: {
    managementApi: emptyApi
  }
};
```

- [ ] **Step 8: Add asset manager stories**

Create `apps/web/src/management/assets/AssetManager.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { assetRecords } from "../../stories/story-fixtures.js";
import { AssetManager, type AssetManagerProps } from "./AssetManager.js";

const loadedApi = {
  listAssets: async () => assetRecords,
  importAsset: async () => assetRecords[0]
} satisfies AssetManagerProps["assetApi"];

const emptyApi = {
  listAssets: async () => [],
  importAsset: async () => assetRecords[0]
} satisfies AssetManagerProps["assetApi"];

const meta = {
  component: AssetManager,
  title: "Management/Assets"
} satisfies Meta<typeof AssetManager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {
  args: {
    assetApi: loadedApi
  }
};

export const Empty: Story = {
  args: {
    assetApi: emptyApi
  }
};
```

- [ ] **Step 9: Add overlay surface stories**

Create `apps/web/src/overlay/components/OverlaySurface.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { createOverlayComposition, createOverlayInstruction } from "../../stories/story-fixtures.js";
import { OverlaySurface } from "./OverlaySurface.js";

const meta = {
  component: OverlaySurface,
  title: "Overlay/Surface",
  parameters: {
    backgrounds: {
      default: "transparent",
      values: [{ name: "transparent", value: "transparent" }]
    },
    layout: "fullscreen"
  },
  args: {
    resolveAssetUrl: () => "/storybook-assets/tiny-alert.svg",
    onPlaybackEvent: () => undefined
  }
} satisfies Meta<typeof OverlaySurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: {
    composition: createOverlayComposition([])
  }
};

export const TextAndMedia: Story = {
  args: {
    composition: createOverlayComposition([createOverlayInstruction("text-and-media")])
  }
};

export const DisabledModule: Story = {
  args: {
    composition: {
      overlayId: "default",
      purpose: "test",
      scope: "module",
      modules: [
        {
          moduleId: "alerts",
          enabled: false,
          instructions: [createOverlayInstruction("disabled")]
        }
      ]
    }
  }
};
```

- [ ] **Step 10: Mark OpenSpec story tasks**

Edit `openspec/changes/add-frontend-agent-guardrails/tasks.md` and mark tasks `5.1` through `5.5` complete.

---

### Task 6: Type and Test Repair Loop

**Files:**
- Modify story/config files from Task 4 and Task 5 as needed.
- Modify: `openspec/changes/add-frontend-agent-guardrails/tasks.md`

- [ ] **Step 1: Run TypeScript**

Run:

```powershell
corepack.cmd pnpm typecheck
```

Expected: exit code `0`. If TypeScript reports story import or prop errors, fix the story types without weakening `tsconfig`.

- [ ] **Step 2: Run lint**

Run:

```powershell
corepack.cmd pnpm lint
```

Expected: exit code `0`. If ESLint reports story issues, fix the stories or config without disabling rules globally.

- [ ] **Step 3: Run unit tests**

Run:

```powershell
corepack.cmd pnpm test
```

Expected: exit code `0`. Existing tests should not change unless Storybook setup reveals a real type/import issue.

- [ ] **Step 4: Build Storybook**

Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/web build-storybook
```

Expected: exit code `0`; static output is written to Storybook's configured output directory and remains ignored by git.

- [ ] **Step 5: Run Storybook test-runner**

Run:

```powershell
corepack.cmd pnpm --filter @stream-jams/web test-storybook:ci
```

Expected: Storybook starts locally, the test-runner executes against `http://127.0.0.1:6006`, and accessibility failures fail unless a story is explicitly marked with a documented `todo` state.

For manual debugging, use the full shell in two terminals:

```powershell
corepack.cmd pnpm --filter @stream-jams/web storybook
corepack.cmd pnpm --filter @stream-jams/web test-storybook
```

- [ ] **Step 6: Run Playwright only if browser behavior changed**

If the implementation only adds docs, skills, and Storybook stories, record that Playwright was not required because production app behavior did not change. If production browser behavior changed, run:

```powershell
corepack.cmd pnpm test:e2e
```

Expected: exit code `0`.

- [ ] **Step 7: Mark OpenSpec validation tasks**

Edit `openspec/changes/add-frontend-agent-guardrails/tasks.md` and mark tasks `6.1` through `6.7` complete according to the commands actually run and documented.

---

### Task 7: OpenSpec and Final Verification

**Files:**
- Modify: `openspec/changes/add-frontend-agent-guardrails/tasks.md`

- [ ] **Step 1: Validate the OpenSpec change**

Run:

```powershell
openspec.cmd validate add-frontend-agent-guardrails --strict
```

Expected: validation passes.

- [ ] **Step 2: Confirm task status**

Run:

```powershell
openspec.cmd list --json
openspec.cmd status --change add-frontend-agent-guardrails
```

Expected: `add-frontend-agent-guardrails` appears as in progress until all task boxes are complete; status displays the planning artifacts.

- [ ] **Step 3: Review git diff**

Run:

```powershell
git -c safe.directory=C:/dev/projects/stream-jams diff --stat
git -c safe.directory=C:/dev/projects/stream-jams diff -- AGENTS.md docs .agents .github apps/web package.json pnpm-lock.yaml .gitignore openspec/changes/add-frontend-agent-guardrails
```

Expected: diff contains only the frontend guardrail implementation and the pre-approved OpenSpec artifacts.

- [ ] **Step 4: Confirm final status**

Run:

```powershell
git -c safe.directory=C:/dev/projects/stream-jams status --short
```

Expected: only intended frontend guardrail files plus any pre-existing unrelated files are present.

- [ ] **Step 5: Mark final OpenSpec tasks**

Edit `openspec/changes/add-frontend-agent-guardrails/tasks.md` and mark tasks `6.8` and `6.9` complete after validation and status review.

---

## Self-Review

Spec coverage:

- Frontend guidance is covered by Tasks 2 and 3.
- Repo-local skills are covered by Task 3.
- Storybook React/Vite setup is covered by Task 4.
- Storybook CI gating is covered by Tasks 4 and 6.
- Representative management and overlay stories are covered by Task 5.
- Visual regression, overlay error presentation, and token strategy options are covered by Task 2.
- Accessibility and Storybook validation are covered by Tasks 4, 6, and 7.
- UI-change verification expectations are covered by Tasks 2, 3, 6, and 7.

Placeholder scan:

- This plan contains concrete file paths, commands, and file content for the core new artifacts.
- No task depends on an unspecified component library or external design source.

Type consistency:

- Story examples use exported prop types from the current components.
- Story fixtures use current exported types from `management-api.ts`, `asset-api.ts`, and `@stream-jams/core`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-add-frontend-agent-guardrails.md`.

Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.
