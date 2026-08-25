# frontend-agent-guardrails Specification

## Purpose
TBD - created by archiving change add-frontend-agent-guardrails. Update Purpose after archive.
## Requirements
### Requirement: Frontend Agent Guidance
The repository SHALL provide durable frontend guidance that agents can use before changing `apps/web`.

#### Scenario: Agent starts management UI work
- **WHEN** an agent is asked to change a management UI surface
- **THEN** the guidance MUST direct the agent to preserve a dense, operational, configuration-oriented interface using existing React/Vite/TypeScript patterns

#### Scenario: Agent starts overlay UI work
- **WHEN** an agent is asked to change a browser-source overlay surface
- **THEN** the guidance MUST direct the agent to preserve transparent/full-viewport rendering, stream readability, safe text wrapping, and separation from management UI chrome

### Requirement: Repo-Local Frontend Skills
The repository SHALL provide repo-local Codex skills for frontend implementation and frontend review workflows.

#### Scenario: Frontend implementation skill is invoked
- **WHEN** a frontend implementation task touches `apps/web`
- **THEN** the skill MUST route the agent through relevant docs, existing components, Storybook stories, targeted implementation, automated checks, and rendered browser verification

#### Scenario: Frontend review skill is invoked
- **WHEN** a frontend review task inspects changes touching `apps/web`
- **THEN** the skill MUST check accessibility, responsive behavior, visual overflow, management-vs-overlay constraints, Storybook coverage, and relevant tests before summarizing findings

### Requirement: Storybook Workbench
The `apps/web` package SHALL include Storybook configured for the existing React and Vite frontend stack.

#### Scenario: Developer starts Storybook
- **WHEN** a developer runs the documented Storybook dev command
- **THEN** Storybook MUST serve the Stream Jams web stories without requiring the production Fastify server

#### Scenario: Developer builds Storybook
- **WHEN** a developer runs the documented Storybook build command
- **THEN** Storybook MUST emit a static build suitable for local or CI validation

#### Scenario: CI validates Storybook
- **WHEN** the repository CI validation workflow runs
- **THEN** CI MUST build Storybook and run the Storybook test-runner with accessibility validation as a required gate

### Requirement: Representative UI Stories
Storybook SHALL include representative stories for management UI and overlay UI states.

#### Scenario: Agent inspects management UI examples
- **WHEN** an agent needs examples for management UI work
- **THEN** Storybook MUST include stories that demonstrate the full management shell, navigation, form-heavy panels, list/table panels, and empty/loading/error/success states using real components with mocked API boundaries

#### Scenario: Agent inspects overlay UI examples
- **WHEN** an agent needs examples for overlay UI work
- **THEN** Storybook MUST include stories that demonstrate idle, text-only, media, and error-safe overlay states using the real overlay components and deterministic checked-in assets where media is needed

### Requirement: Frontend Option Documentation
The repository SHALL document deferred frontend tooling and design-system options so future agents do not need to rediscover known tradeoffs.

#### Scenario: Agent evaluates visual regression tooling
- **WHEN** an agent needs to choose a visual regression strategy
- **THEN** the guidance MUST compare local Playwright screenshots against local Storybook, Chromatic, Argos, and Percy-style hosted tooling with practical pros and cons

#### Scenario: Agent evaluates overlay error presentation
- **WHEN** an agent changes overlay error handling or error stories
- **THEN** the guidance MUST explain how transparent fail-closed, operator-only diagnostics, dev/test visible diagnostics, and live visible diagnostics would present during a live stream

#### Scenario: Agent evaluates token extraction
- **WHEN** an agent considers changing styling tokens
- **THEN** the guidance MUST explain the impact, pros, and cons of documenting current CSS versus extracting CSS custom properties

### Requirement: Storybook Accessibility Validation
Storybook SHALL include accessibility validation for stories.

#### Scenario: New story is added
- **WHEN** a new Storybook story is added for production UI behavior
- **THEN** the story MUST participate in accessibility validation unless it has an explicit documented exclusion

#### Scenario: Accessibility test fails
- **WHEN** Storybook accessibility validation reports a violation for a non-excluded story
- **THEN** the frontend validation workflow MUST fail or report a documented `todo` state that blocks claiming full accessibility completion

### Requirement: UI Change Verification
The repository SHALL define verification expectations for UI changes.

#### Scenario: Management UI behavior changes
- **WHEN** a change modifies user-visible management UI behavior
- **THEN** the implementation MUST update or add relevant unit/component tests, Storybook stories, and Playwright coverage when the behavior requires browser-flow validation

#### Scenario: Overlay rendering changes
- **WHEN** a change modifies browser-source overlay rendering
- **THEN** the implementation MUST update or add relevant overlay stories and rendered verification covering transparent background, viewport fit, text readability, and media layout behavior
