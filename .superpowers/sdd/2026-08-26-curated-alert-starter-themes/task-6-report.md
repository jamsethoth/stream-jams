# Task 6 report: Playwright starter-theme acceptance

## Result

- Starting HEAD: `d0664ffb70f752bdb7733c0d925e22b3c56ed207`.
- Added the focused route-mocked BL-006 browser acceptance slice without changing production code.
- Marked implementation-plan Task 6 Steps 1–2 and OpenSpec 5.1 complete only after the focused browser file and required checks passed.
- Left OpenSpec 5.2 and implementation-plan Task 6 Steps 3–5 open for the root-owned repository gates and live verification.

## Acceptance coverage

- Updated the existing Community gift create assertion to require the always-sent default `themeId: "clean-signal"`.
- Added Raid creation coverage that selects Bold Pop, verifies its checked native radio plus resolved Landscape and Vertical previews, asserts the POST boundary sends `themeId: "bold-pop"`, opens the created editor, and inspects the core-materialized composition in both target profiles.
- Added explicit Neon Terminal re-theme coverage from a schema-validated editor document containing a custom Message, image, video, audio, and enabled TTS with an active provider.
- The re-theme scenario verifies the replacement/preservation confirmation, post-apply review/save guidance, both review gates and preserved profile-enabled flags before save, a stateful PUT/GET reload, preserved custom message/audio/TTS, removed image/video layers, Neon Terminal text/shape output, disabled alert state, and both profiles remaining `needs-review`.

## Browser evidence

- Environment: route-mocked Vite management UI at `http://127.0.0.1:4173`, Playwright Chromium desktop project.
- First complete run: 7/8 passed. The new Bold Pop preview test failed because its `has` filter incorrectly nested a dialog-scoped locator; the captured DOM showed the checked Bold Pop option and both previews were present, so this was a test-selector defect rather than a production browser defect.
- Narrowed corrected scenario: 1/1 passed.
- Final complete focused file: 8/8 passed in 18.7 seconds.
- The Neon Terminal apply/save/reload scenario passed on its first run.
- No production browser-only defect was exposed, so no production files were changed.

## Verification

- `corepack.cmd pnpm --filter @stream-jams/core build` — passed.
- `corepack.cmd pnpm exec playwright test tests/e2e/management-alerts.spec.ts --reporter=line` — 8/8 passed.
- `corepack.cmd pnpm exec eslint tests/e2e/management-alerts.spec.ts` — passed with no output.
- `openspec.cmd validate add-curated-alert-starter-themes --strict --json` — 1/1 change valid with zero issues.
- `git diff --check` — passed with no output.

## Scope

- Changed only the focused E2E file, authorized plan/OpenSpec checkboxes, SDD progress/report evidence, and no production code.
- Did not run or claim the root-owned full repository gates or live runtime checks.
- Did not publish, push, open a PR, merge, sync or archive specs, or remove BL-006 from the backlog.

## Typecheck integration follow-up

- Follow-up starting HEAD: `30c319de86f076c5a9ecd6ab16a2030f15d41253`.
- Root full-gate verification exposed TS6307 because the Task 6 E2E fixture imports `@stream-jams/core`, whose source path alias entered the composite E2E project without a declared project reference.
- RED: `corepack.cmd pnpm exec tsc -b tests/e2e/tsconfig.json` consistently reported core source files were not listed in the E2E project.
- Fix: added the same `../../packages/core` project reference used by the web and server TypeScript projects; imports, include boundaries, and compiler strictness remain unchanged.
- GREEN: the focused E2E TypeScript build passed, the original `corepack.cmd pnpm typecheck` root command passed, core build passed, and the focused Playwright file passed 8/8 in 24.5 seconds.
- Focused ESLint passed with no output, strict OpenSpec JSON validation reported 1/1 valid with zero issues, and `git diff --check` passed.
- No production files changed.
