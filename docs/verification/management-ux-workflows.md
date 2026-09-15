# Management UX Workflow Verification

## Identity And Isolation

- Baseline: `origin/main` at `386b35a`; slice branch `codex/simplify-management-ux-workflows`; specification commit `f60c191`.
- Full application: production build served by the repository Fastify runtime on unused loopback port `39227`.
- Data: ignored disposable config, SQLite data, and assets under `test-results/ux-full-app`; default starter data plus one synthetic Screen Effect using a repository image.
- Safety: the user's configured service and data were not used or stopped. No Browser Source URL was created or revealed, the Screen Effects module remained disabled, and the saved-test confirmation was cancelled without queueing output.

## Evidence Boundaries

- Source inspection established the six workflow findings and the request/persistence contracts behind them.
- Storybook rendered production components with fixtures for desktop and narrow layout checks. It did not reproduce the user's running application and is not counted as full-app acceptance.
- Playwright exercised the production app shell and routes with controlled API mocks for scenario breadth, including multi-profile, unavailable-output, Home, and saved-effect confirmation states.
- Full-app validation exercised the built web bundle, real Fastify management APIs, real routing/layout, and the disposable local store. It confirmed integration behavior without using production configuration or sending output.

## Full-App Results

1. Alert inventory exposes `Edit`, `Test saved`, and `Enable` inline. `Sample message`, eligible `Add variation`, `Duplicate`, `Reset`, and `Delete` appear exactly once under `More` with per-alert accessible names.
2. `Sample message` opens a text-only dialog that explicitly says it is not the rendered design and does not send a test or play media.
3. The focused editor labels its actions `Preview` and `Test draft`, shows the draft/destination/audio/TTS summary, and presents a bounded `Live readiness` correction rather than claiming delivery.
4. Editing the shared alert name and switching from Landscape to Vertical retained the unsaved edit, undo state, and `Unsaved` status without a profile-switch modal or save.
5. Home showed incomplete setup first in its existing order, marked the first item `Next action`, and retained the active-set summary. Mixed and complete states are covered by production-component stories and browser workflows.
6. A saved synthetic Screen Effect exposed `Test saved…`; its confirmation named the saved Default variant and `OBS Browser Source visual`. Cancelling queued nothing.

## Clarifications

The earlier standalone-editor scrolling observation was withdrawn: the production focused shell already constrains editor height. No scrolling workaround remains in this change. Missing Storybook video assets, desktop-settings session mocks, and echo-only safety-preview behavior are recorded as fixture limitations rather than product defects.

## Automated Evidence

- Focused frontend regressions: 4 files, 159 tests passed.
- Full unit/integration suite: 232 Vitest files and 2,004 tests passed; 9 Node tests passed.
- Typecheck, lint, and production build passed; the build retained only the existing Vite chunk-size advisory.
- Storybook production build and interaction/accessibility suite passed: 22 suites, 226 tests.
- Full Playwright suite passed: 38 tests using one isolated Chromium worker.
- `openspec.cmd validate simplify-management-ux-workflows --strict` passed after durable-spec synchronization.
