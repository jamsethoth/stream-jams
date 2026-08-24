## Why

Frontend work in Stream Jams now spans two very different browser surfaces: the dense local management UI and the full-screen browser-source overlay. Agents need durable, repo-specific guidance and concrete examples so generated UI stays aligned with those surfaces instead of drifting into generic dashboard, marketing, or component-library patterns.

The repo already has React, Vite, TypeScript, Testing Library, Vitest, and Playwright. This change adds the missing agent-friendly design and verification layer around that stack.

## What Changes

- Add frontend agent guidance that defines the desired management UI and overlay UI constraints.
- Add repo-local Codex skills for frontend implementation and frontend review workflows.
- Add Storybook for `apps/web` as the component/state catalog agents can inspect before changing UI.
- Add initial stories for representative management UI panels and overlay states.
- Add Storybook build and accessibility-oriented validation tasks to the frontend workflow.
- Update repository guidance so UI changes require stories, rendered browser verification, and relevant automated checks.

## Capabilities

### New Capabilities

- `frontend-agent-guardrails`: Defines durable agent guidance, Storybook-backed UI examples, and validation expectations for Stream Jams frontend work.

### Modified Capabilities

- None.

## Impact

- Affected docs and guidance: `AGENTS.md`, `docs/ai/`, and frontend design/verification documentation.
- Affected Codex workflows: repo-local skills under `.agents/skills/`.
- Affected frontend tooling: `apps/web` Storybook configuration, story files, package scripts, and workspace dependencies.
- Affected verification: existing lint, typecheck, Vitest, and Playwright checks remain; Storybook build and accessibility checks become part of the UI-change workflow.
